import assert from "node:assert/strict";
import { calculateNextReview, isCardDueForReview } from "../src/lib/flashcards/srs";
import { LocalAdapter } from "../src/lib/data/local-adapter";
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
    pageId: "page_1",
    notebookId: "nb_1",
    pageTitle: "Biologia Celular",
    front: "O que é mitocôndria?",
    back: "Organela responsável pela respiração celular e produção de ATP.",
    repetition: 0,
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: Date.now() - 1000,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 10000,
  };

  assert.equal(isCardDueForReview(baseCard), true);

  const futureCard: Flashcard = {
    ...baseCard,
    nextReviewDate: Date.now() + 10000000,
  };
  assert.equal(isCardDueForReview(futureCard), false);

  const againResult = calculateNextReview(baseCard, "again", 1.0);
  assert.equal(againResult.repetition, 0);
  assert.equal(againResult.interval, 1);
  assert.ok(againResult.easeFactor < 2.5);

  const goodResult1 = calculateNextReview(baseCard, "good", 1.0);
  assert.equal(goodResult1.repetition, 1);
  assert.equal(goodResult1.interval, 1);

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
    imageUrl: "https://example.com/cell.png",
    imageStoragePath: `workspaces/local/flashcards/${page.id}/fc_1_cell.png`,
  });

  assert.equal(flashcardList.length, 1);
  assert.equal(flashcardList[0].front, "O que é tecido epitelial?");
  assert.equal(flashcardList[0].pageId, page.id);

  await adapter.reviewFlashcard(cardA.id, "good");
  assert.equal(flashcardList[0].repetition, 1);

  await adapter.trashPage(page.id);
  assert.equal(flashcardList.length, 1);

  await adapter.purgePage(page.id);
  assert.equal(flashcardList.length, 0);

  unsub();
  console.log("Flashcards verification passed successfully.");
}

runTests().catch((err) => {
  console.error("Flashcards verification failed:", err);
  process.exit(1);
});
