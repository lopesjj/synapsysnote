import assert from "node:assert/strict";
import { SUPPORTED_LANGUAGES, getLanguageDefinition } from "../src/lib/i18n/languages";
import { TRANSLATIONS, formatTranslation, type TranslationKey } from "../src/lib/i18n/translations";
import { formatRelative } from "../src/lib/utils";
import type { SupportedLanguage, AppBlock, Page } from "../src/types/models";

const expectedCodes: SupportedLanguage[] = [
  "pt",
  "en",
  "it",
  "fr",
  "es",
  "ru",
  "ja",
  "zh",
  "de",
  "ar",
];

assert.equal(SUPPORTED_LANGUAGES.length, 10);

for (const code of expectedCodes) {
  const def = getLanguageDefinition(code);
  assert.equal(def.code, code);
  assert.ok(def.name.length > 0);
  assert.ok(def.nativeName.length > 0);
  assert.ok(def.flag.length > 0);

  const dict = TRANSLATIONS[code] as Record<TranslationKey, string>;
  if (!dict) throw new Error(`Dicionário para ${code} deve existir`);
  assert.ok(dict.all_notes.length > 0);
  assert.ok(dict.trash.length > 0);
  assert.ok(dict.preferences.length > 0);
  assert.ok(dict.language.length > 0);
  assert.ok(dict.language_title.length > 0);
  assert.ok(dict.language_description.length > 0);
  assert.ok(dict.home.length > 0);
  assert.ok(dict.import_notion.length > 0);
  assert.ok(dict.pages.length > 0);
  assert.ok(dict.unfiled.length > 0);
  assert.ok(dict.add_cover.length > 0);
  assert.ok(dict.change_cover.length > 0);
  assert.ok(dict.heading_1.length > 0);
  assert.ok(dict.heading_2.length > 0);
  assert.ok(dict.heading_3.length > 0);
  assert.ok(dict.text_paragraph.length > 0);
  assert.ok(dict.imported_from_notion.length > 0);
  assert.ok(dict.sort_manual.length > 0);
  assert.ok(dict.sort_name.length > 0);
  assert.ok(dict.sort_order_label.length > 0);
  assert.ok(dict.sort_manual_only_hint.length > 0);
  assert.ok(dict.search_cards.length > 0);
  assert.ok(dict.search_cards_placeholder.length > 0);
  assert.ok(dict.no_cards_found.length > 0);
  assert.ok(dict.cards_found_count.length > 0);
  assert.ok(dict.delete_selected_cards.length > 0);
  assert.ok(dict.confirm_delete_selected_cards.length > 0);
  assert.ok(dict.filter_placeholder.length > 0);
  assert.ok(dict.show_password.length > 0);
  assert.ok(dict.hide_password.length > 0);
  assert.ok(dict.page_purged.length > 0);
  assert.ok(dict.database_purged.length > 0);
  assert.ok(dict.notebook_purged.length > 0);
  assert.ok(dict.purge_failed.length > 0);
  assert.ok(dict.note_duplicated.length > 0);
  assert.ok(dict.account.length > 0);
  assert.ok(dict.align_left.length > 0);
  assert.ok(dict.display_name.length > 0);
  assert.ok(dict.display_name_placeholder.length > 0);
  assert.ok(dict.display_name_hint.length > 0);
  assert.ok(dict.name_required.length > 0);
  assert.ok(dict.name_too_long.length > 0);
  assert.ok(dict.save.length > 0);
  assert.ok(dict.name_updated.length > 0);
  assert.ok(dict.name_save_failed.length > 0);
  assert.ok(dict.lang_ar.length > 0);
  assert.ok(dict.accessibility.length > 0);
  assert.ok(dict.accessibility_description.length > 0);
  assert.ok(dict.high_contrast.length > 0);
  assert.ok(dict.high_contrast_desc.length > 0);
  assert.ok(dict.underline_links.length > 0);
  assert.ok(dict.underline_links_desc.length > 0);
  assert.ok(dict.dyslexic_font.length > 0);
  assert.ok(dict.dyslexic_font_desc.length > 0);
  assert.ok(dict.reduced_motion.length > 0);
  assert.ok(dict.reduced_motion_desc.length > 0);
  assert.ok(dict.enhanced_focus.length > 0);
  assert.ok(dict.enhanced_focus_desc.length > 0);
  assert.ok(dict.screen_reader.length > 0);
  assert.ok(dict.screen_reader_desc.length > 0);
  assert.ok(dict.speech_rate.length > 0);
  assert.ok(dict.libras_interpreter.length > 0);
  assert.ok(dict.libras_desc.length > 0);
  assert.ok(dict.keyboard_navigation_title.length > 0);
  assert.ok(dict.keyboard_navigation_desc.length > 0);
  assert.ok(dict.keyboard_next_element.length > 0);
  assert.ok(dict.keyboard_previous_element.length > 0);
  assert.ok(dict.keyboard_activate.length > 0);
  assert.ok(dict.keyboard_close_modal.length > 0);
  assert.ok(dict.read_note_aloud.length > 0);
  assert.ok(dict.libras_shortcut.length > 0);
  assert.ok(dict.focus_editor_shortcut.length > 0);
  assert.ok(dict.focus_title_shortcut.length > 0);
  assert.ok(dict.video_file.length > 0);
  assert.ok(dict.video_too_long.length > 0);
  assert.ok(dict.remove_audio.length > 0);
  assert.ok(dict.remove_video.length > 0);
  assert.ok(dict.audio_removed.length > 0);
  assert.ok(dict.video_removed.length > 0);
  assert.ok(dict.video_attached.length > 0);
  assert.ok(dict.video_too_large.length > 0);
  assert.ok(dict.slash_attachment_desc.length > 0);
  // O menu de anexo precisa citar vídeo em todos os idiomas.
  assert.ok(/vídeo|video|vidéo|видео|動画|视频|فيديو/i.test(dict.slash_attachment_desc));
}

// Concordância dos contadores da nota: nenhuma forma pode sair com o marcador
// de plural cru, e singular e plural precisam diferir onde o idioma flexiona.
const COUNT_KEYS: TranslationKey[] = [
  "editor_words_count",
  "editor_characters",
  "ai_words_count",
  "ai_tables_count",
  "ai_images_count",
  "ai_audio_video_count",
  "ai_pdf_count",
  "ai_avoid_duplicates_notice",
  "ai_duplicates_skipped",
  "cards_found_count",
  "confirm_delete_selected_cards",
];
const INFLECTED = ["pt", "en", "es", "fr", "it", "de", "ru", "ar"];

for (const code of expectedCodes) {
  const dict = TRANSLATIONS[code] as Record<TranslationKey, string>;
  for (const key of COUNT_KEYS) {
    const one = formatTranslation(dict[key], code, { count: 1 });
    const many = formatTranslation(dict[key], code, { count: 7 });
    assert.ok(one.length > 0 && !one.includes("{"), `${code}.${key} singular: ${one}`);
    assert.ok(many.length > 0 && !many.includes("{"), `${code}.${key} plural: ${many}`);
    const uninflected = key === "ai_pdf_count" || (key === "editor_characters" && code === "de");
    if (INFLECTED.includes(code) && !uninflected) {
      assert.notEqual(one, many, `${code}.${key} deveria flexionar`);
    }
  }
}

// Russo usa uma terceira forma a partir de cinco.
assert.equal(formatTranslation(TRANSLATIONS.ru.ai_words_count, "ru", { count: 1 }), "слово");
assert.equal(formatTranslation(TRANSLATIONS.ru.ai_words_count, "ru", { count: 3 }), "слова");
assert.equal(formatTranslation(TRANSLATIONS.ru.ai_words_count, "ru", { count: 7 }), "слов");
// Árabe volta ao singular depois de dez.
assert.equal(
  formatTranslation(TRANSLATIONS.ar.ai_images_count, "ar", { count: 1 }),
  formatTranslation(TRANSLATIONS.ar.ai_images_count, "ar", { count: 15 })
);
assert.equal(formatTranslation(TRANSLATIONS.pt.ai_audio_video_count, "pt", { count: 1 }), "áudio ou vídeo");
assert.equal(formatTranslation(TRANSLATIONS.pt.ai_audio_video_count, "pt", { count: 2 }), "áudios e vídeos");
assert.equal(
  formatTranslation(TRANSLATIONS.pt.ai_avoid_duplicates_notice, "pt", { count: 1 }),
  "A IA vai analisar 1 card já existente nesta nota e gerar apenas conteúdo novo."
);
assert.equal(
  formatTranslation(TRANSLATIONS.pt.ai_avoid_duplicates_notice, "pt", { count: 3 }),
  "A IA vai analisar 3 cards já existentes nesta nota e gerar apenas conteúdo novo."
);
assert.equal(
  formatTranslation(TRANSLATIONS.es.ai_avoid_duplicates_notice, "es", { count: 1 }),
  "La IA analizará 1 tarjeta ya existente en esta nota y generará solo contenido nuevo."
);
assert.equal(
  formatTranslation(TRANSLATIONS.fr.ai_avoid_duplicates_notice, "fr", { count: 1 }),
  "L'IA analysera 1 carte déjà présente dans cette note et ne générera que du contenu nouveau."
);
assert.equal(
  formatTranslation(TRANSLATIONS.it.ai_avoid_duplicates_notice, "it", { count: 1 }),
  "L'IA analizzerà 1 scheda già presente in questa nota e genererà solo contenuti nuovi."
);
assert.equal(
  formatTranslation(TRANSLATIONS.de.ai_avoid_duplicates_notice, "de", { count: 1 }),
  "Die KI prüft 1 bereits vorhandene Karte in dieser Notiz und erzeugt nur neue Inhalte."
);
assert.equal(
  formatTranslation(TRANSLATIONS.de.ai_avoid_duplicates_notice, "de", { count: 4 }),
  "Die KI prüft 4 bereits vorhandene Karten in dieser Notiz und erzeugt nur neue Inhalte."
);
for (const [count, form] of [
  [1, "карточку"],
  [2, "карточки"],
  [5, "карточек"],
  [11, "карточек"],
  [21, "карточку"],
] as const) {
  assert.ok(
    formatTranslation(TRANSLATIONS.ru.ai_avoid_duplicates_notice, "ru", { count }).includes(
      `${count} ${form}`
    ),
    `ru.ai_avoid_duplicates_notice com ${count} deveria usar "${form}"`
  );
}

assert.equal(
  formatTranslation(TRANSLATIONS.pt.confirm_delete_selected_cards, "pt", { count: 1 }),
  "Apagar 1 card selecionado? Esta ação não pode ser desfeita."
);
assert.equal(
  formatTranslation(TRANSLATIONS.pt.confirm_delete_selected_cards, "pt", { count: 6 }),
  "Apagar 6 cards selecionados? Esta ação não pode ser desfeita."
);
assert.equal(
  formatTranslation(TRANSLATIONS.de.confirm_delete_selected_cards, "de", { count: 1 }),
  "1 ausgewählte Karte löschen? Das lässt sich nicht rückgängig machen."
);
assert.ok(
  formatTranslation(TRANSLATIONS.ru.confirm_delete_selected_cards, "ru", { count: 2 }).includes(
    "2 выбранные карточки"
  )
);
assert.ok(
  formatTranslation(TRANSLATIONS.ru.confirm_delete_selected_cards, "ru", { count: 7 }).includes(
    "7 выбранных карточек"
  )
);

assert.equal(formatTranslation(TRANSLATIONS.pt.editor_characters, "pt", { count: 1 }), "caractere");
assert.equal(formatTranslation(TRANSLATIONS.pt.editor_characters, "pt", { count: 0 }), "caracteres");

const sevenHoursAgo = Date.now() - 7 * 3600 * 1000;
assert.equal(formatRelative(sevenHoursAgo, "pt"), "há 7 h");
assert.equal(formatRelative(sevenHoursAgo, "en"), "7h ago");
assert.equal(formatRelative(sevenHoursAgo, "es"), "hace 7 h");

const mockPage: Page = {
  id: "test_page_1",
  title: "Anotação em Português",
  icon: "📝",
  coverUrl: null,
  notebookId: null,
  parentPageId: null,
  path: [],
  favorite: false,
  archived: false,
  deletedAt: null,
  order: 0,
  blocks: [
    {
      id: "b1",
      type: "paragraph",
      richText: [
        { text: "Texto em negrito ", annotations: { bold: true } },
        { text: "e itálico", annotations: { italic: true } },
      ],
    },
    {
      id: "b2",
      type: "code",
      props: { language: "typescript" },
      richText: [{ text: "const x = 10;" }],
    },
    {
      id: "b3",
      type: "equation",
      props: { expression: "E = mc^2" },
    },
    {
      id: "b4",
      type: "todo",
      props: { checked: false },
      richText: [{ text: "Tarefa pendente" }],
    },
  ],
  plainText: "Anotação em Português",
  transcriptText: "",
  tags: ["trabalho"],
  outgoingLinks: [],
  backlinks: [],
  createdBy: "test_user",
  updatedBy: "test_user",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

assert.equal(mockPage.blocks.length, 4);

import { pickPreferences, DEFAULT_PREFERENCES } from "../src/lib/store/ui-store";

assert.equal(DEFAULT_PREFERENCES.language, "pt");

const pickedEn = pickPreferences({ language: "en", sidebarCollapsed: true });
assert.equal(pickedEn.language, "en");
assert.equal(pickedEn.sidebarCollapsed, true);

const pickedEs = pickPreferences({ language: "es" });
assert.equal(pickedEs.language, "es");

const defaultPreferences = { language: "pt" as const };
const existingPreferences = { language: "fr" as const, theme: "dark" as const };
const mergedWithDefaults = {
  ...defaultPreferences,
  ...existingPreferences,
};
assert.equal(mergedWithDefaults.language, "fr");

const newProfilePreferences = {
  language: "pt" as const,
  ...({} as { language?: SupportedLanguage }),
};
assert.equal(newProfilePreferences.language, "pt");

import {
  translateDatabaseText,
  formatRecordsProperties,
  isPlanningName,
} from "../src/components/database/database-i18n";

assert.equal(formatRecordsProperties(1, 3, "ar"), "1 سجل · 3 خصائص");
assert.equal(formatRecordsProperties(2, 4, "ar"), "2 سجلات · 4 خصائص");
assert.equal(translateDatabaseText("A fazer", "ar"), "للقيام به");
assert.equal(translateDatabaseText("Fazendo", "ar"), "قيد التنفيذ");
assert.equal(translateDatabaseText("Concluído", "ar"), "مكتمل");
assert.equal(translateDatabaseText("sem status", "ar"), "بدون حالة");
assert.equal(translateDatabaseText("Nome", "ar"), "الاسم");
assert.equal(translateDatabaseText("Status", "ar"), "الحالة");
assert.equal(translateDatabaseText("Data", "ar"), "التاريخ");
assert.equal(isPlanningName("التخطيط"), true);
assert.equal(isPlanningName("تخطيط"), true);
assert.equal(isPlanningName("Planejamento"), true);

console.log("all language and translation verification tests passed");
