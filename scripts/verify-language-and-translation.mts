import assert from "node:assert/strict";
import { SUPPORTED_LANGUAGES, getLanguageDefinition } from "../src/lib/i18n/languages";
import { TRANSLATIONS } from "../src/lib/i18n/translations";
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
];

assert.equal(SUPPORTED_LANGUAGES.length, 9);

for (const code of expectedCodes) {
  const def = getLanguageDefinition(code);
  assert.equal(def.code, code);
  assert.ok(def.name.length > 0);
  assert.ok(def.nativeName.length > 0);
  assert.ok(def.flag.length > 0);

  const dict = TRANSLATIONS[code];
  assert.ok(dict, `Dicionário para ${code} deve existir`);
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
  assert.ok(dict.filter_placeholder.length > 0);
  assert.ok(dict.note_duplicated.length > 0);
  assert.ok(dict.account.length > 0);
  assert.ok(dict.align_left.length > 0);
}

const sevenHoursAgo = Date.now() - 7 * 3600 * 1000;
assert.equal(formatRelative(sevenHoursAgo, "pt"), "há 7 h");
assert.equal(formatRelative(sevenHoursAgo, "en"), "7h ago");
assert.equal(formatRelative(sevenHoursAgo, "es"), "hace 7 h");

const mockPage: Page = {
  id: "test_page_1",
  workspaceId: "ws_1",
  title: "Anotação em Português",
  icon: "📝",
  favorite: false,
  archived: false,
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
  tags: ["trabalho"],
  outgoingLinks: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

assert.equal(mockPage.blocks.length, 4);

console.log("all language and translation verification tests passed");
