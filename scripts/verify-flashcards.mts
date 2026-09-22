import assert from "node:assert/strict";
import {
  RELEARN_DELAY_MINUTES,
  calculateNextReview,
  endOfDay,
  isCardDueForReview,
  startOfDay,
} from "../src/lib/flashcards/srs";
import { LocalAdapter } from "../src/lib/data/local-adapter";
import { TRANSLATIONS, formatTranslation } from "../src/lib/i18n/translations";
import { minutesFromTime, reminderSlot } from "../src/lib/flashcards/notifications";
import {
  cardImage,
  cardImagePatch,
  cardStoragePaths,
  hasCardImage,
} from "../src/lib/flashcards/card-images";
import { buildDeckTree, flattenDecks, flattenNodes } from "../src/lib/flashcards/note-tree";
import { cardSignature, hasDuplicate, isSameCard } from "../src/lib/flashcards/duplicate-cards";
import {
  cardText,
  cosineSimilarity,
  filterSemanticDuplicates,
  relatedExisting,
} from "../src/lib/flashcards/semantic-duplicates";
import {
  extractComprehensiveNoteContent,
  resolveMediaUrl,
} from "../src/lib/flashcards/extract-note-content";
import type { Notebook, Page } from "../src/types/models";
import type { Flashcard } from "../src/types/models";

function installBrowserStubs() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.assign(globalThis, {
    window: { localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    localStorage,
  });
}

installBrowserStubs();

async function runTests() {
  const baseCard: Flashcard = {
    id: "fc_1",
    workspaceId: "demo-workspace",
    pageId: "page_1",
    notebookId: "nb_1",
    pageTitle: "Biologia Celular",
    front: "O que é mitocôndria?",
    back: "Organela responsável pela respiração celular e produção de ATP.",
    repetition: 0,
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: Date.now() - 1000,
    lastReviewedAt: null,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 10000,
    createdBy: "demo-user",
  };

  assert.equal(isCardDueForReview(baseCard), true);

  // O agendamento é por dia: um card marcado para mais tarde HOJE continua vencido,
  // e só sai da fila quando cai em um dia seguinte.
  const laterTodayCard: Flashcard = { ...baseCard, nextReviewDate: endOfDay() };
  assert.equal(isCardDueForReview(laterTodayCard), true);

  const tomorrowCard: Flashcard = { ...baseCard, nextReviewDate: startOfDay() + 86_400_000 };
  assert.equal(isCardDueForReview(tomorrowCard), false);

  const againResult = calculateNextReview(baseCard, "again", 1.0);
  assert.equal(againResult.repetition, 0);
  assert.equal(againResult.interval, 1);
  assert.equal(againResult.relearn, true);
  assert.ok(againResult.easeFactor < 2.5);

  // "De novo" reagenda em minutos (relearn), não para o dia seguinte: o card
  // precisa continuar vencido hoje, como o rótulo da própria interface promete.
  const relearnDelta = againResult.nextReviewDate - Date.now();
  assert.ok(relearnDelta > 0 && relearnDelta <= RELEARN_DELAY_MINUTES * 60_000 + 1000);
  assert.equal(isCardDueForReview({ ...baseCard, nextReviewDate: againResult.nextReviewDate }), true);

  const goodResult1 = calculateNextReview(baseCard, "good", 1.0);
  assert.equal(goodResult1.repetition, 1);
  assert.equal(goodResult1.interval, 1);
  assert.equal(goodResult1.relearn, false);
  assert.equal(goodResult1.nextReviewDate, startOfDay(Date.now() + 86_400_000));

  const cardAfterGood1: Flashcard = {
    ...baseCard,
    repetition: goodResult1.repetition,
    interval: goodResult1.interval,
    easeFactor: goodResult1.easeFactor,
  };

  const goodResult2 = calculateNextReview(cardAfterGood1, "good", 1.0);
  assert.equal(goodResult2.repetition, 2);
  assert.equal(goodResult2.interval, 6);

  const easyResult = calculateNextReview(baseCard, "easy", 1.0);
  assert.ok(easyResult.easeFactor > 2.5);

  const modifiedRhythm = calculateNextReview(cardAfterGood1, "good", 1.5);
  assert.ok(modifiedRhythm.interval >= goodResult2.interval);

  const adapter = new LocalAdapter();
  let flashcardList: Flashcard[] = [];
  const unsub = adapter.subscribeFlashcards((cards) => {
    flashcardList = cards;
  });

  const page = await adapter.createPage({ title: "Histologia" });

  const cardA = await adapter.createFlashcard({
    pageId: page.id,
    notebookId: null,
    pageTitle: page.title,
    front: "O que é tecido epitelial?",
    back: "Tecido que reveste superfícies e cavidades.",
    hint: "Pense em revestimento",
    frontImageUrl: "https://example.com/cell.png",
    frontImageStoragePath: `workspaces/local/flashcards/${page.id}/fc_1_cell.png`,
    backImageUrl: "https://example.com/tissue.png",
    backImageStoragePath: `workspaces/local/flashcards/${page.id}/fc_1_tissue.png`,
  });

  assert.equal(flashcardList.length, 1);
  assert.equal(flashcardList[0].front, "O que é tecido epitelial?");
  assert.equal(flashcardList[0].pageId, page.id);
  assert.equal(cardImage(flashcardList[0], "back").url, "https://example.com/tissue.png");
  assert.equal(cardStoragePaths(flashcardList[0]).length, 2);

  // Limpar a dica precisa realmente removê-la do card.
  await adapter.updateFlashcard(cardA.id, { hint: undefined });
  assert.equal(flashcardList[0].hint, undefined);
  assert.equal(flashcardList[0].id, cardA.id);

  await adapter.reviewFlashcard(cardA.id, "good");
  assert.equal(flashcardList[0].repetition, 1);

  // Escopo por caderno: `null` significa "sem caderno", nunca "todos os cards".
  const otherPage = await adapter.createPage({ title: "Anatomia" });
  await adapter.updatePage(otherPage.id, { notebookId: "nb_outro" });
  const cardB = await adapter.createFlashcard({
    pageId: otherPage.id,
    notebookId: "nb_outro",
    pageTitle: otherPage.title,
    front: "Quantos ossos tem o crânio adulto?",
    back: "22 ossos.",
  });
  await adapter.reviewFlashcard(cardB.id, "good");

  const resetCount = await adapter.resetFlashcardsProgress({ notebookId: null });
  assert.equal(resetCount, 1);
  assert.equal(flashcardList.find((c) => c.id === cardA.id)?.repetition, 0);
  assert.equal(flashcardList.find((c) => c.id === cardB.id)?.repetition, 1);

  await adapter.trashPage(page.id);
  assert.equal(flashcardList.filter((c) => c.pageId === page.id).length, 1);

  await adapter.purgePage(page.id);
  assert.equal(flashcardList.filter((c) => c.pageId === page.id).length, 0);

  // Duplicar a nota leva os flashcards junto, zerados e sem dono da imagem.
  const noteToCopy = await adapter.createPage({ title: "Citologia" });
  await adapter.createFlashcard({
    pageId: noteToCopy.id,
    notebookId: null,
    pageTitle: noteToCopy.title,
    front: "O que e um lisossomo?",
    back: "Organela de digestao intracelular.",
    frontImageUrl: "https://example.com/lisossomo.png",
    frontImageStoragePath: "workspaces/local/uploads/orig/lisossomo.png",
  });
  const sub = await adapter.createPage({ title: "Subnota", parentPageId: noteToCopy.id });
  await adapter.createFlashcard({
    pageId: sub.id,
    notebookId: null,
    pageTitle: sub.title,
    front: "Pergunta da subnota",
    back: "Resposta da subnota",
  });

  const copy = await adapter.duplicatePage(noteToCopy.id);
  const copiedCards = flashcardList.filter((c) => c.pageId === copy.id);
  assert.equal(copiedCards.length, 1);
  assert.equal(copiedCards[0].front, "O que e um lisossomo?");
  assert.equal(copiedCards[0].repetition, 0, "a copia comeca sem progresso");
  assert.equal(cardImage(copiedCards[0], "front").url, "https://example.com/lisossomo.png");
  // A copia mostra a imagem mas nao e dona dela: apaga-la nao pode levar o
  // arquivo do card original junto.
  assert.deepEqual(cardStoragePaths(copiedCards[0]), []);

  // A subnota tambem foi duplicada com o card dela.
  const copiedSub = flashcardList.find(
    (c) => c.front === "Pergunta da subnota" && c.pageId !== sub.id
  );
  assert.ok(copiedSub, "o card da subnota deveria ter sido duplicado");

  // Exclusao em massa apaga so os cards da nota indicada.
  const removed = await adapter.deleteFlashcardsByPage(noteToCopy.id);
  assert.equal(removed, 1);
  assert.equal(flashcardList.filter((c) => c.pageId === noteToCopy.id).length, 0);
  assert.equal(flashcardList.filter((c) => c.pageId === copy.id).length, 1);
  assert.equal(await adapter.deleteFlashcardsByPage(noteToCopy.id), 0);

  unsub();

  checkNoteTree();
  checkCardImages();
  checkReminderSlot();
  checkAgreement();
  checkDuplicateCards();
  await checkSemanticDuplicates();
  await checkExtractComprehensiveMedia();

  console.log("Flashcards verification passed successfully.");
}

/**
 * Arvore da lista de flashcards: subnotas precisam aninhar sob a nota-mae,
 * como na barra lateral, e nao aparecer soltas na raiz.
 */
function checkNoteTree() {
  const page = (id: string, title: string, parentPageId: string | null, notebookId: string | null): Page =>
    ({
      id,
      title,
      parentPageId,
      notebookId,
      icon: null,
      coverUrl: null,
      blocks: [],
      tags: [],
      order: 0,
      deletedAt: null,
      createdAt: 0,
      updatedAt: 0,
    }) as unknown as Page;

  const card = (id: string, pageId: string, due: boolean): Flashcard =>
    ({
      id,
      workspaceId: "w",
      pageId,
      notebookId: null,
      front: "f" + id,
      back: "b" + id,
      repetition: 0,
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: due ? Date.now() - 1000 : startOfDay() + 5 * 86_400_000,
      lastReviewedAt: null,
      createdAt: 0,
      updatedAt: 0,
      createdBy: "u",
    }) as Flashcard;

  // Pagina (caderno raiz) > cadernos > notas > subnotas, como na barra lateral.
  const notebook = (id: string, name: string, parentId: string | null): Notebook =>
    ({ id, name, parentId, order: 0 }) as unknown as Notebook;
  const notebooks = [
    notebook("pagina", "Concursos", null),
    notebook("nb1", "Programação", "pagina"),
    notebook("nb2", "Direito", "pagina"),
    notebook("outra", "Outra página", null),
  ];
  const pages = [
    page("mae", "Aula 1", null, "nb1"),
    page("filha", "Aula 1.1", "mae", "nb1"),
    page("neta", "Aula 1.1.1", "filha", "nb1"),
    page("solta", "Aula 2", null, "nb1"),
    page("orfa", "Aula 3", "inexistente", "nb1"),
  ];
  const cardsByPage = new Map<string, Flashcard[]>([
    ["mae", [card("c1", "mae", true)]],
    ["filha", [card("c2", "filha", false)]],
    ["neta", [card("c3", "neta", true)]],
    ["solta", [card("c4", "solta", false)]],
    ["orfa", [card("c5", "orfa", false)]],
  ]);

  const decks = buildDeckTree({
    pages,
    notebooks,
    cardsByPage,
    filterMode: "all",
    term: "",
    unfiledLabel: "Sem caderno",
  });

  // A pagina fica na raiz e o caderno com cards entra aninhado dentro dela.
  assert.equal(decks.length, 1, "so a pagina com cards deveria aparecer");
  assert.equal(decks[0].notebook?.id, "pagina");
  assert.equal(decks[0].depth, 0);
  assert.equal(decks[0].nodes.length, 0, "a pagina nao tem notas diretas aqui");
  assert.equal(decks[0].children.length, 1, "so o caderno com cards desce junto");
  assert.equal(decks[0].children[0].notebook?.id, "nb1");
  assert.equal(decks[0].children[0].depth, 1);
  // Caderno vazio e pagina sem nada nao entram na lista.
  assert.equal(flattenDecks(decks).some((d) => d.notebook?.id === "nb2"), false);
  assert.equal(flattenDecks(decks).some((d) => d.notebook?.id === "outra"), false);
  // A pagina soma o que esta nos cadernos abaixo dela.
  assert.equal(decks[0].cards.length, 5);
  assert.equal(decks[0].due, 2);

  const tree = decks[0].children[0].nodes;

  const root = tree.find((n) => n.page.id === "mae");
  assert.ok(root, "a nota-mae deveria estar na raiz");
  assert.equal(root.depth, 0);
  assert.equal(root.children.length, 1, "a subnota deveria aninhar sob a mae");
  assert.equal(root.children[0].page.id, "filha");
  assert.equal(root.children[0].depth, 1);
  assert.equal(root.children[0].children[0].page.id, "neta", "aninha em mais de um nivel");
  assert.equal(root.children[0].children[0].depth, 2);

  // A subarvore soma os cards dos descendentes.
  assert.equal(root.cards.length, 1);
  assert.equal(root.subtreeCards.length, 3);
  assert.equal(root.subtreeDue, 2);

  // Subnotas nao podem aparecer tambem na raiz.
  assert.equal(tree.filter((n) => n.page.id === "filha").length, 0);

  // Uma subnota cujo pai nao existe mais sobe para a raiz em vez de sumir.
  assert.ok(tree.find((n) => n.page.id === "orfa"), "nota orfa deveria subir para a raiz");
  assert.equal(flattenNodes(tree).length, 5);

  // O caderno agrega o que esta abaixo dele.
  assert.equal(decks[0].children[0].cards.length, 5);
  assert.equal(decks[0].children[0].noteCount, 5);
  assert.equal(decks[0].children[0].due, 2);

  // Notas sem caderno viram um grupo proprio, depois dos cadernos.
  const comSoltas = buildDeckTree({
    pages: [...pages, page("avulsa", "Avulsa", null, null)],
    notebooks,
    cardsByPage: new Map([...cardsByPage, ["avulsa", [card("c6", "avulsa", true)]]]),
    filterMode: "all",
    term: "",
    unfiledLabel: "Sem caderno",
  });
  assert.equal(comSoltas.length, 2);
  assert.equal(comSoltas[1].notebook, null, "o grupo sem caderno vai por ultimo");
  assert.equal(comSoltas[1].depth, 0);
  assert.equal(comSoltas[1].nodes[0].page.id, "avulsa");

  // Nota-mae sem cards proprios continua na lista, como conteiner da subnota.
  const semCards = buildDeckTree({
    pages,
    notebooks,
    cardsByPage: new Map([["neta", [card("c3", "neta", true)]]]),
    filterMode: "all",
    term: "",
    unfiledLabel: "Sem caderno",
  })[0].children[0].nodes;
  const container = semCards.find((n) => n.page.id === "mae");
  assert.ok(container, "a mae sem cards deveria seguir como conteiner");
  assert.equal(container.cards.length, 0);
  assert.equal(container.subtreeCards.length, 1);
  assert.equal(container.children[0].children[0].page.id, "neta");

  // Filtro "pendentes" nao pode levar cards nao vencidos na subarvore.
  const pendentes = buildDeckTree({
    pages,
    notebooks,
    cardsByPage,
    filterMode: "due",
    term: "",
    unfiledLabel: "Sem caderno",
  })[0].children[0].nodes;
  const pendenteRoot = pendentes.find((n) => n.page.id === "mae");
  assert.ok(pendenteRoot);
  assert.equal(pendenteRoot.subtreeCards.length, 2, "so os vencidos entram");
  assert.equal(pendenteRoot.children[0].cards.length, 0, "a filha nao tem vencidos");
  assert.equal(pendentes.find((n) => n.page.id === "solta"), undefined);
}

/**
 * Imagens por face. Cards antigos guardavam uma única `imageUrl`, que precisa
 * continuar valendo como frente, e todo caminho de storage do card precisa ser
 * encontrável na exclusão — senão o arquivo fica órfão no bucket.
 */
function checkCardImages() {
  const legacy = {
    imageUrl: "https://cdn/antiga.png",
    imageStoragePath: "workspaces/w/uploads/p/antiga.png",
  };
  assert.equal(cardImage(legacy, "front").url, "https://cdn/antiga.png");
  assert.equal(cardImage(legacy, "front").storagePath, legacy.imageStoragePath);
  assert.equal(cardImage(legacy, "back").url, null);
  assert.equal(hasCardImage(legacy), true);

  const split = {
    frontImageUrl: "https://cdn/frente.png",
    frontImageStoragePath: "workspaces/w/uploads/p/frente.png",
    backImageUrl: "https://cdn/verso.png",
    backImageStoragePath: "workspaces/w/uploads/p/verso.png",
  };
  assert.equal(cardImage(split, "front").url, "https://cdn/frente.png");
  assert.equal(cardImage(split, "back").url, "https://cdn/verso.png");

  // O campo novo tem precedência sobre o legado.
  const both = { ...legacy, ...split };
  assert.equal(cardImage(both, "front").url, "https://cdn/frente.png");

  // A exclusão precisa enxergar os três campos, sem repetir.
  assert.deepEqual(cardStoragePaths(both).sort(), [
    "workspaces/w/uploads/p/antiga.png",
    "workspaces/w/uploads/p/frente.png",
    "workspaces/w/uploads/p/verso.png",
  ].sort());
  assert.deepEqual(cardStoragePaths({}), []);
  assert.deepEqual(cardStoragePaths({ frontImageStoragePath: "  " }), []);

  // Trocar a frente precisa zerar o campo legado, senão a imagem removida
  // voltaria pelo fallback.
  const cleared = cardImagePatch("front", { url: null, storagePath: null });
  assert.equal(cleared.frontImageUrl, null);
  assert.equal(cleared.imageUrl, null);
  assert.equal(cleared.imageStoragePath, null);
  assert.equal(cardImage({ ...legacy, ...cleared }, "front").url, null);

  const backPatch = cardImagePatch("back", { url: "u", storagePath: "s" });
  assert.equal(backPatch.backImageUrl, "u");
  assert.equal("imageUrl" in backPatch, false, "o verso não deve mexer no campo legado");

  assert.equal(hasCardImage({}), false);
}

/**
 * Lembrete diário. O marcador de "já avisei" precisa considerar o horário
 * configurado: com a data sozinha, trocar o horário depois do primeiro disparo
 * deixava o lembrete travado até a meia-noite seguinte.
 */
function checkReminderSlot() {
  assert.equal(minutesFromTime("09:00"), 540);
  assert.equal(minutesFromTime("00:00"), 0);
  assert.equal(minutesFromTime("23:59"), 1439);
  // Horários inválidos devem ser rejeitados, e não virar meia-noite.
  assert.equal(minutesFromTime(""), -1);
  assert.equal(minutesFromTime("abc"), -1);
  assert.equal(minutesFromTime("24:00"), -1);
  assert.equal(minutesFromTime("10:60"), -1);

  const day = new Date(2026, 8, 20, 15, 0, 0);
  const morning = reminderSlot("09:00", day);
  const noon = reminderSlot("12:01", day);

  assert.equal(morning, "2026-09-20T09:00");
  assert.notEqual(morning, noon, "trocar o horário precisa rearmar o lembrete no mesmo dia");

  // O mesmo horário no dia seguinte também rearma.
  const nextDay = new Date(2026, 8, 21, 15, 0, 0);
  assert.notEqual(reminderSlot("09:00", nextDay), morning);
}

/**
 * Concordância verbal e nominal: cada texto com contagem precisa flexionar.
 * O caso crítico é count = 1, onde a forma fixa antiga produzia "1 cards".
 */
function checkAgreement() {
  const render = (lang: string, key: string, n: number) =>
    formatTranslation((TRANSLATIONS[lang] as Record<string, string>)[key], lang, {
      count: n,
      cards: n,
      notes: n,
      total: n,
      percent: 40,
    });

  const expected: [string, string, number, string][] = [
    // Português: substantivo, verbo e particípio acompanham a contagem.
    ["pt", "cards_count", 1, "1 card"],
    ["pt", "cards_count", 2, "2 cards"],
    ["pt", "daily_goal_remaining", 1, "Falta 1 revisão hoje"],
    ["pt", "daily_goal_remaining", 3, "Faltam 3 revisões hoje"],
    ["pt", "cards_partially_added", 1, "Apenas 1 flashcard foi salvo"],
    ["pt", "selected_notes", 1, "1 nota selecionada"],
    ["pt", "deck_meta", 1, "1 card · 1 nota"],
    // Inglês.
    ["en", "cards_partially_added", 1, "Only 1 flashcard was saved"],
    ["en", "cards_partially_added", 2, "Only 2 flashcards were saved"],
    // Espanhol e italiano: verbo concorda com o sujeito.
    ["es", "cards_partially_added", 1, "Solo se guardó 1 tarjeta"],
    ["it", "daily_goal_remaining", 1, "Manca 1 ripasso oggi"],
    ["it", "daily_goal_remaining", 4, "Mancano 4 ripassi oggi"],
    // Francês trata 0 como singular.
    ["fr", "cards_count", 0, "0 carte"],
    ["fr", "cards_count", 1, "1 carte"],
    ["fr", "cards_count", 2, "2 cartes"],
    // Alemão.
    ["de", "cards_waiting", 1, "1 wartet auf Wiederholung"],
    ["de", "cards_waiting", 2, "2 warten auf Wiederholung"],
    // Russo tem três formas: 1/21 singular, 3 poucas, 5/11 muitas.
    ["ru", "of_total_cards", 1, "40% из 1 карточки"],
    ["ru", "of_total_cards", 3, "40% из 3 карточек"],
    ["ru", "of_total_cards", 11, "40% из 11 карточек"],
    ["ru", "of_total_cards", 21, "40% из 21 карточки"],
    // Japonês e chinês não flexionam número.
    ["ja", "cards_count", 1, "1 枚"],
    ["zh", "cards_count", 5, "5 张"],
  ];

  for (const [lang, key, n, want] of expected) {
    const got = render(lang, key, n);
    assert.equal(got, want, `${lang}.${key} com ${n}: "${got}" != "${want}"`);
  }

  // Nenhum texto pode chegar à interface com a sintaxe de plural por resolver.
  for (const lang of Object.keys(TRANSLATIONS)) {
    const dict = TRANSLATIONS[lang] as Record<string, string>;
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== "string" || !value.includes("|")) continue;
      const groups = value.match(/\{([A-Za-z0-9_]+)\|([^{}]*)\}/g) ?? [];
      for (const group of groups) {
        const param = group.slice(1, group.indexOf("|"));
        const resolved = formatTranslation(value, lang, { [param]: 1 });
        assert.ok(
          !resolved.includes(group),
          `${lang}.${key}: grupo de plural ${group} não foi resolvido`
        );
      }
    }
  }

  assert.ok((TRANSLATIONS.pt as Record<string, string>).card_hint_placeholder.includes("Mnemônico"));
}

async function checkExtractComprehensiveMedia() {
  const testPage: Page = {
    id: "page_media_test",
    notebookId: "nb_1",
    title: "Aula com Vídeo",
    workspaceId: "ws_1",
    plainText: "Anotações sobre a aula de Active Directory",
    order: 0,
    createdAt: 1000,
    updatedAt: 1000,
    blocks: [
      {
        id: "b_text",
        type: "paragraph",
        props: { textAlign: "left" },
        content: [{ type: "text", text: "Introdução ao AD" }],
      },
      {
        id: "b_vid",
        type: "video",
        props: {
          title: "Aula AD",
          url: "https://example.com/ad-lecture.mp4",
        },
        media: {
          url: "https://example.com/ad-lecture.mp4",
          name: "ad-lecture.mp4",
          mimeType: "video/mp4",
        },
      },
      {
        id: "b_aud",
        type: "audio",
        props: {
          title: "Áudio Explicativo",
          url: "https://example.com/audio.mp3",
        },
        media: {
          url: "https://example.com/audio.mp3",
          name: "audio.mp3",
          mimeType: "audio/mp3",
          transcript: "Transcrição pré-existente do áudio",
        },
      },
    ],
  };

  const snapshotBefore = JSON.stringify(testPage);
  const result = await extractComprehensiveNoteContent(testPage, { includeAttachments: false });

  assert.equal(result.pendingMedia.length, 1);
  assert.equal(result.pendingMedia[0].blockId, "b_vid");
  assert.equal(result.pendingMedia[0].kind, "video");
  assert.equal(result.pendingMedia[0].url, "https://example.com/ad-lecture.mp4");

  assert.equal(result.audioTranscripts.length, 1);
  assert.equal(result.audioTranscripts[0].text, "Transcrição pré-existente do áudio");
  assert.equal(result.videoTranscripts.length, 0);

  assert.equal(JSON.stringify(testPage), snapshotBefore);

  const resolved = await resolveMediaUrl("https://example.com/file.mp4");
  assert.equal(resolved, "https://example.com/file.mp4");
}

function checkDuplicateCards() {
  const sig = (front: string, back: string) => cardSignature(front, back);

  assert.equal(
    isSameCard(sig("Qual e a funcao da ALU?", "Executar operacoes"), sig("Qual é a FUNÇÃO da ALU?", "Executar operações")),
    true
  );

  assert.equal(
    isSameCard(
      sig("Qual é a função principal da unidade lógica aritmética?", "Executar operações aritméticas e lógicas."),
      sig("Qual a função principal da unidade lógica aritmética em um processador?", "Realiza cálculos e comparações.")
    ),
    true
  );

  assert.equal(
    isSameCard(
      sig("O que é memória cache?", "Memória rápida entre CPU e RAM."),
      sig("O que é memória cache em um processador?", "Uma camada rápida de memória.")
    ),
    true
  );

  assert.equal(
    isSameCard(
      sig("Quantos bits tem um byte?", "Um byte tem oito bits."),
      sig("Um byte corresponde a quantos bits?", "Um byte tem oito bits.")
    ),
    true
  );

  assert.equal(
    isSameCard(
      sig("Qual é a função da ALU?", "Executar operações aritméticas e lógicas."),
      sig("Qual é a função do barramento de dados?", "Transportar dados entre a CPU e a memória.")
    ),
    false
  );

  assert.equal(
    isSameCard(
      sig("Qual é a capital da França?", "Paris."),
      sig("Qual é a capital da Itália?", "Roma.")
    ),
    false
  );

  assert.equal(
    isSameCard(
      sig("Quais são as camadas do modelo OSI?", "Sete camadas, da física à aplicação."),
      sig("Quantas camadas tem o modelo TCP/IP?", "Quatro camadas.")
    ),
    false
  );

  assert.equal(
    isSameCard(
      sig("O que faz o registrador PC?", "Guarda o endereço da próxima instrução."),
      sig("O que faz o registrador de instrução?", "Guarda a instrução em execução.")
    ),
    false
  );

  const existing = [
    sig("O que é paginação de memória?", "Divisão da memória em páginas de tamanho fixo."),
    sig("Qual a diferença entre RISC e CISC?", "RISC usa instruções simples; CISC, instruções complexas."),
  ];

  assert.equal(
    hasDuplicate(existing, sig("O que é a paginação de memória?", "Dividir a memória em páginas fixas.")),
    true
  );
  assert.equal(
    hasDuplicate(existing, sig("O que é segmentação de memória?", "Divisão da memória em segmentos lógicos.")),
    false
  );
  assert.equal(hasDuplicate([], sig("Qualquer pergunta nova?", "Qualquer resposta.")), false);
}

function topicVector(text: string): number[] {
  const lower = text.toLowerCase();
  const topic = lower.includes("linux") ? 0 : lower.includes("capital") ? 1 : 2;
  const vector = [0.05, 0.05, 0.05];
  vector[topic] = 1;
  return vector;
}

function installEmbeddingStub(mode: "ok" | "fail"): () => void {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    calls += 1;
    if (mode === "fail") throw new Error("network down");
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      requests?: { content?: { parts?: { text?: string }[] } }[];
    };
    const requests = body.requests ?? [];
    return {
      ok: true,
      json: async () => ({
        embeddings: requests.map((request) => ({
          values: topicVector(request.content?.parts?.[0]?.text ?? ""),
        })),
      }),
    };
  }) as unknown as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
    return calls;
  };
}

async function checkSemanticDuplicates() {
  assert.equal(cardText({ front: "  Pergunta  ", back: " Resposta " }), `Pergunta\nResposta`);
  assert.ok(cosineSimilarity([1, 0], [1, 0]) > 0.999);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 0.001);
  assert.equal(cosineSimilarity([], [1, 0]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);

  const manyExisting = [
    { front: "O que e paginacao de memoria virtual", back: "Divisao em paginas" },
    { front: "O que e segmentacao de memoria", back: "Divisao em segmentos" },
    { front: "Qual a capital da Franca", back: "Paris" },
    { front: "Qual a capital da Italia", back: "Roma" },
  ];
  const narrowed = relatedExisting(
    manyExisting,
    [{ front: "O que e paginacao de memoria", back: "Paginas de tamanho fixo" }],
    2
  );
  assert.equal(narrowed.length, 2);
  assert.ok(narrowed[0].front.includes("paginacao"));
  assert.ok(narrowed[1].front.includes("segmentacao"));
  assert.equal(relatedExisting(manyExisting, [], 10).length, 4);

  const restore = installEmbeddingStub("ok");
  try {
    const againstExisting = await filterSemanticDuplicates({
      apiKey: "test-key",
      existing: [{ front: "Quem criou o Linux", back: "Linus Torvalds" }],
      candidates: [
        { front: "Qual a origem do kernel Linux", back: "Foi criado por Linus Torvalds" },
        { front: "Qual a capital da Franca", back: "Paris" },
      ],
      timeBudgetMs: 30_000,
    });
    assert.equal(againstExisting.applied, true);
    assert.equal(againstExisting.duplicates, 1);
    assert.deepEqual(againstExisting.keep, [false, true]);
    assert.equal(againstExisting.comparedExisting, 1);

    const amongCandidates = await filterSemanticDuplicates({
      apiKey: "test-key",
      existing: [],
      candidates: [
        { front: "O que faz o kernel Linux", back: "Gerencia recursos" },
        { front: "Para que serve o nucleo Linux", back: "Controla o hardware" },
        { front: "Qual a capital da Italia", back: "Roma" },
      ],
      timeBudgetMs: 30_000,
    });
    assert.equal(amongCandidates.duplicates, 1);
    assert.deepEqual(amongCandidates.keep, [true, false, true]);

    const tooLittleTime = await filterSemanticDuplicates({
      apiKey: "test-key",
      existing: [{ front: "Quem criou o Linux", back: "Linus Torvalds" }],
      candidates: [{ front: "Qual a origem do Linux", back: "Linus Torvalds" }],
      timeBudgetMs: 500,
    });
    assert.equal(tooLittleTime.applied, false);
    assert.deepEqual(tooLittleTime.keep, [true]);

    const noKey = await filterSemanticDuplicates({
      apiKey: "",
      existing: [{ front: "Quem criou o Linux", back: "Linus Torvalds" }],
      candidates: [{ front: "Qual a origem do Linux", back: "Linus Torvalds" }],
      timeBudgetMs: 30_000,
    });
    assert.equal(noKey.applied, false);
    assert.deepEqual(noKey.keep, [true]);
  } finally {
    restore();
  }

  const restoreFailing = installEmbeddingStub("fail");
  try {
    const degraded = await filterSemanticDuplicates({
      apiKey: "test-key",
      existing: [{ front: "Como funciona o escalonador do Linux", back: "Distribui tempo de CPU" }],
      candidates: [{ front: "Como o Linux escalona processos", back: "Reparte o tempo de CPU" }],
      timeBudgetMs: 30_000,
    });
    assert.equal(degraded.applied, false);
    assert.equal(degraded.duplicates, 0);
    assert.deepEqual(degraded.keep, [true]);
    assert.ok(degraded.error);
  } finally {
    restoreFailing();
  }
}

runTests().catch((err) => {
  console.error("Flashcards verification failed:", err);
  process.exit(1);
});
