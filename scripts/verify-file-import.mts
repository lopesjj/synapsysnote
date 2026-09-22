import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { attr, childElements, parseMarkup, textContent } from "../src/lib/import/dom";
import { createStyleResolver, normalizeColor, parseLengthPx, parseStyleSheet } from "../src/lib/import/css";
import { htmlToBlocks, normalizeHref, spansPlainText } from "../src/lib/import/html-blocks";
import { md5Hex } from "../src/lib/import/md5";
import { parseEnex } from "../src/lib/import/enex";
import { parseDocx } from "../src/lib/import/docx";
import { parseHtmlDocument, looksLikeGoogleDocsExport } from "../src/lib/import/html-import";
import { extractGoogleDocId } from "../src/lib/import/google-docs";
import { applyResolvedAssets, countAssetReferences, stripPendingMedia } from "../src/lib/import/run-import";
import { base64ToBytes, decodeText, sanitizeFileName } from "../src/lib/import/binary";
import { ASSET_URL_PREFIX } from "../src/lib/import/types";
import { docToBlocks, blocksToDoc } from "../src/components/editor/serializer";
import type { AppBlock } from "../src/types/models";

function flat(blocks: AppBlock[]): AppBlock[] {
  const out: AppBlock[] = [];
  const walk = (list: AppBlock[]) => {
    for (const block of list) {
      out.push(block);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return out;
}

function textOf(block: AppBlock | undefined): string {
  return spansPlainText(block?.richText).trim();
}

function parseHtml(html: string): AppBlock[] {
  return htmlToBlocks(parseMarkup(html, { xml: false }));
}

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

run("markup parser handles void elements, auto close and entities", () => {
  const root = parseMarkup(
    `<div><p>um<br>dois<p>tres</div><ul><li>a<li>b</ul><span>&amp;&#65;&nbsp;</span>`,
    { xml: false }
  );
  const div = childElements(root, "div")[0];
  assert.equal(childElements(div, "p").length, 2);
  const list = childElements(root, "ul")[0];
  assert.equal(childElements(list, "li").length, 2);
  const span = childElements(root, "span")[0];
  assert.equal(textContent(span), "&A ");
});

run("markup parser keeps xml case and reads cdata", () => {
  const root = parseMarkup(`<?xml version="1.0"?><w:tbl><w:tblGrid a="1"/><x><![CDATA[<b>oi</b>]]></x></w:tbl>`, {
    xml: true,
  });
  const table = childElements(root, "w:tbl")[0];
  assert.ok(table);
  assert.equal(childElements(table, "w:tblGrid").length, 1);
  assert.equal(attr(childElements(table, "w:tblGrid")[0], "a"), "1");
  assert.equal(textContent(childElements(table, "x")[0]), "<b>oi</b>");
});

run("markup parser ignores script and style bodies as raw text", () => {
  const root = parseMarkup(`<style>.a{color:red}</style><script>if (1 < 2) {}</script><p>fim</p>`, {
    xml: false,
  });
  assert.equal(textContent(childElements(root, "style")[0]), ".a{color:red}");
  assert.equal(childElements(root, "p").length, 1);
});

run("css parser resolves classes, inline styles and colors", () => {
  const rules = parseStyleSheet(
    `@import url('https://fonts.example/css?kit=abc');@charset "utf-8";` +
      `.c1{font-weight:700;color:#ff0000}p{margin-left:48px}@font-face{font-family:X}@media print{.c2{font-style:italic}}`
  );
  const resolve = createStyleResolver(rules);
  const root = parseMarkup(`<p class="c1 c2" style="color:#00ff00">x</p>`, { xml: false });
  const paragraph = childElements(root, "p")[0];
  const computed = resolve(paragraph);
  assert.equal(computed["font-weight"], "700");
  assert.equal(computed["font-style"], "italic");
  assert.equal(computed["margin-left"], "48px");
  assert.equal(normalizeColor(computed.color), "#00FF00");
  assert.equal(normalizeColor("rgb(255, 0, 0)"), "#FF0000");
  assert.equal(normalizeColor("rgba(0,0,0,0)"), null);
  assert.equal(normalizeColor("#abc"), "#AABBCC");
  assert.equal(Math.round(parseLengthPx("36pt") ?? 0), 48);
});

run("html converter keeps headings, marks, alignment and links", () => {
  const blocks = parseHtml(
    `<h1>Titulo</h1><p style="text-align:center">a <b>b</b> <i>c</i> <u>d</u> <s>e</s> <code>f</code></p>` +
      `<p><a href="https://www.google.com/url?q=https%3A%2F%2Fexemplo.com&amp;sa=D">link</a></p>`
  );
  assert.equal(blocks[0].type, "heading_1");
  assert.equal(textOf(blocks[0]), "Titulo");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(blocks[1].props?.textAlign, "center");
  const spans = blocks[1].richText ?? [];
  assert.ok(spans.some((span) => span.annotations?.bold));
  assert.ok(spans.some((span) => span.annotations?.italic));
  assert.ok(spans.some((span) => span.annotations?.underline));
  assert.ok(spans.some((span) => span.annotations?.strikethrough));
  assert.ok(spans.some((span) => span.annotations?.code));
  assert.equal(blocks[2].richText?.[0]?.href, "https://exemplo.com");
  assert.equal(normalizeHref("javascript:alert(1)"), undefined);
});

run("paragraphs without alignment are imported as left aligned", () => {
  const blocks = parseHtml(`<p>texto</p>`);
  assert.equal(blocks[0].props?.textAlign, "left");
});

run("html converter nests lists and detects checkboxes", () => {
  const blocks = parseHtml(
    `<ul><li>um<ul><li>um.um</li></ul></li><li>dois</li></ul>` +
      `<ol><li>a</li></ol>` +
      `<ul><li><input type="checkbox" checked>feito</li></ul>`
  );
  assert.equal(blocks[0].type, "bulleted_list_item");
  assert.equal(textOf(blocks[0]), "um");
  assert.equal(blocks[0].children?.[0]?.type, "bulleted_list_item");
  assert.equal(textOf(blocks[0].children?.[0]), "um.um");
  assert.equal(blocks[1].type, "bulleted_list_item");
  assert.equal(blocks[2].type, "numbered_list_item");
  assert.equal(blocks[3].type, "todo");
  assert.equal(blocks[3].props?.checked, true);
});

run("html converter builds tables with spans and header", () => {
  const blocks = parseHtml(
    `<table><thead><tr><th>A</th><th>B</th></tr></thead>` +
      `<tbody><tr><td colspan="2">juntas</td></tr><tr><td>x</td><td>y</td></tr></tbody></table>`
  );
  const table = blocks[0];
  assert.equal(table.type, "table");
  assert.equal(table.props?.hasColumnHeader, true);
  const rows = table.props?.tableRows ?? [];
  assert.equal(rows.length, 3);
  assert.equal(rows[0].cells.length, 2);
  assert.equal(spansPlainText(rows[0].cells[0].spans), "A");
  assert.equal(spansPlainText(rows[1].cells[0].spans), "juntas");
  assert.equal(spansPlainText(rows[1].cells[1].spans), "");
  assert.equal(spansPlainText(rows[2].cells[1].spans), "y");
});

run("table cells inherit alignment from their inner paragraph", () => {
  const blocks = parseHtml(
    `<table><tr><td><p style="text-align:center">meio</p></td><td valign="bottom"><p>base</p></td></tr></table>`
  );
  const rows = blocks[0].props?.tableRows ?? [];
  assert.equal(rows[0].cells[0].horizontalAlign, "center");
  assert.equal(rows[0].cells[1].verticalAlign, "bottom");
});

run("html converter keeps rowspan grid aligned", () => {
  const blocks = parseHtml(
    `<table><tr><td rowspan="2">L</td><td>a</td></tr><tr><td>b</td></tr></table>`
  );
  const rows = blocks[0].props?.tableRows ?? [];
  assert.equal(rows.length, 2);
  assert.equal(spansPlainText(rows[0].cells[0].spans), "L");
  assert.equal(spansPlainText(rows[0].cells[1].spans), "a");
  assert.equal(spansPlainText(rows[1].cells[1].spans), "b");
});

run("deeply nested markup keeps its text instead of being dropped", () => {
  const deep = "<div>".repeat(400) + "conteudo profundo" + "</div>".repeat(400);
  const blocks = parseHtml(deep);
  assert.ok(blocks.length >= 1);
  assert.equal(textOf(blocks[0]), "conteudo profundo");
});

run("html converter maps quotes, code, divider and details", () => {
  const blocks = parseHtml(
    `<blockquote>citado</blockquote><pre class="language-ts">const a = 1;\nconst b = 2;</pre><hr>` +
      `<details open><summary>resumo</summary><p>corpo</p></details>`
  );
  assert.equal(blocks[0].type, "quote");
  assert.equal(blocks[1].type, "code");
  assert.equal(blocks[1].props?.language, "ts");
  assert.equal(textOf(blocks[1]), "const a = 1;\nconst b = 2;");
  assert.equal(blocks[2].type, "divider");
  assert.equal(blocks[3].type, "toggle");
  assert.equal(textOf(blocks[3]), "resumo");
  assert.equal(blocks[3].props?.open, true);
  assert.equal(textOf(blocks[3].children?.[0]), "corpo");
});

run("blank lines become empty paragraphs and inner ones survive", () => {
  const blocks = parseHtml(`<p>a</p><div><br></div><p>&nbsp;</p><p>b</p>`);
  assert.equal(blocks.length, 4);
  assert.equal(textOf(blocks[0]), "a");
  assert.deepEqual(blocks[1].richText, []);
  assert.deepEqual(blocks[2].richText, []);
  assert.equal(textOf(blocks[3]), "b");
  const withBreak = parseHtml(`<p>linha um<br>linha dois</p>`);
  assert.equal(spansPlainText(withBreak[0].richText), ["linha um", "linha dois"].join("\n"));
});

run("html converter inherits block styles and indentation", () => {
  const blocks = parseHtml(
    `<div style="text-align:right"><div>linha</div></div><p style="margin-left:96px">recuado</p>`
  );
  assert.equal(blocks[0].props?.textAlign, "right");
  assert.equal(blocks[1].props?.indent, 2);
});

run("html converter snaps colors to the editor palette", () => {
  const blocks = parseHtml(`<p><span style="color:#ff0000;background-color:#ffff00">cor</span></p>`);
  const span = blocks[0].richText?.[0];
  assert.equal(span?.annotations?.color, "#DC2626");
  assert.equal(span?.annotations?.highlight, "#FDE68A");
});

run("html converter drops pure black text color", () => {
  const blocks = parseHtml(`<p><span style="color:#000000">preto</span></p>`);
  assert.equal(blocks[0].richText?.[0]?.annotations?.color, undefined);
});

run("md5 matches known vectors", () => {
  const encoder = new TextEncoder();
  assert.equal(md5Hex(encoder.encode("")), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5Hex(encoder.encode("abc")), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(
    md5Hex(encoder.encode("The quick brown fox jumps over the lazy dog")),
    "9e107d9d372bb6826bd81d3542a419d6"
  );
  assert.equal(md5Hex(encoder.encode("a".repeat(64))), "014842d480b571495a4a0363793f7367");
});

run("base64 and text decoding round trip", () => {
  const bytes = base64ToBytes("aGVsbG8=");
  assert.equal(decodeText(bytes), "hello");
  assert.equal(sanitizeFileName(' bad/name:*?.png '), "bad_name___.png");
});

const PNG_BYTES = base64ToBytes(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
);

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

run("enex import keeps titles, tags, todos and resources", () => {
  const hash = md5Hex(PNG_BYTES);
  const enex = `<?xml version="1.0" encoding="UTF-8"?>
<en-export>
  <note>
    <title>Nota do Evernote</title>
    <created>20240115T101500Z</created>
    <tag>estudo</tag>
    <tag>ideias</tag>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<en-note>
  <div><b>Negrito</b> e <i>italico</i></div>
  <div><en-todo checked="true"/>Tarefa feita</div>
  <div><en-todo/>Tarefa aberta</div>
  <div style="--en-codeblock:true"><div>linha 1</div><div>linha 2</div></div>
  <en-media hash="${hash}" type="image/png" width="120"/>
  <ul><li>item</li></ul>
</en-note>]]></content>
    <resource>
      <data encoding="base64">${toBase64(PNG_BYTES)}</data>
      <mime>image/png</mime>
      <resource-attributes><file-name>foto.png</file-name></resource-attributes>
    </resource>
  </note>
</en-export>`;

  const notes = parseEnex(enex, "caderno.enex");
  assert.equal(notes.length, 1);
  const note = notes[0];
  assert.equal(note.title, "Nota do Evernote");
  assert.deepEqual(note.tags, ["estudo", "ideias"]);
  assert.equal(note.source, "evernote");
  assert.equal(note.createdAt, Date.UTC(2024, 0, 15, 10, 15, 0));
  assert.equal(note.assets.length, 1);
  assert.equal(note.assets[0].mimeType, "image/png");

  const blocks = flat(note.blocks);
  assert.equal(textOf(blocks[0]), "Negrito e italico");
  assert.ok(blocks[0].richText?.[0]?.annotations?.bold);
  const todos = blocks.filter((block) => block.type === "todo");
  assert.equal(todos.length, 2);
  assert.equal(todos[0].props?.checked, true);
  assert.equal(todos[1].props?.checked, false);
  const code = blocks.find((block) => block.type === "code");
  assert.equal(textOf(code), "linha 1\nlinha 2");
  const image = blocks.find((block) => block.type === "image");
  assert.ok(image?.media?.url.startsWith(ASSET_URL_PREFIX));
  assert.equal(image?.media?.width, 120);
  assert.equal(countAssetReferences(note.blocks), 1);
});

run("enex import falls back when the media hash does not match", () => {
  const enex = `<en-export><note><title>Sem hash</title>
  <content>&lt;en-note&gt;&lt;en-media type="image/png"/&gt;&lt;/en-note&gt;</content>
  <resource><data encoding="base64">${toBase64(PNG_BYTES)}</data><mime>image/png</mime></resource>
  </note></en-export>`;
  const [note] = parseEnex(enex, "sem-hash.enex");
  const image = flat(note.blocks).find((block) => block.type === "image");
  assert.ok(image, "a imagem deveria ser reconstruida pela ordem dos recursos");
  assert.equal(note.assets.length, 1);
});

function buildDocx(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, value] of Object.entries(files)) {
    entries[path] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(entries);
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Ttulo2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Citao"><w:name w:val="Quote"/></w:style>
</w:styles>`;

const DOCX_NUMBERING = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="·"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val=""/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://exemplo.com/destino" TargetMode="External"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

const DOCX_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Relatorio</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Negrito </w:t></w:r>
      <w:r><w:rPr><w:i/><w:color w:val="FF0000"/></w:rPr><w:t>vermelho</w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/><w:highlight w:val="yellow"/></w:rPr><w:t> marcado</w:t></w:r>
    </w:p>
    <w:p><w:hyperlink r:id="rId1"><w:r><w:t>site</w:t></w:r></w:hyperlink></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>item um</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>sub item</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>numerado</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>tarefa</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Citao"/></w:pPr><w:r><w:t>citacao</w:t></w:r></w:p>
    <w:p><w:pPr><w:ind w:left="1440"/></w:pPr><w:r><w:t>recuado</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:tbl>
      <w:tblGrid><w:gridCol w:w="1440"/><w:gridCol w:w="2880"/></w:tblGrid>
      <w:tr><w:trPr><w:tblHeader/></w:trPr>
        <w:tc><w:p><w:r><w:t>Coluna A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Coluna B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>mesclada</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="476250"/>
      <wp:docPr id="1" name="Imagem 1" descr="grafico"/>
      <a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill>
      </pic:pic></a:graphicData></a:graphic>
    </wp:inline></w:drawing></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

run("docx import keeps headings, marks, lists, tables and images", () => {
  const bytes = buildDocx({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": DOCX_DOCUMENT,
    "word/styles.xml": DOCX_STYLES,
    "word/numbering.xml": DOCX_NUMBERING,
    "word/_rels/document.xml.rels": DOCX_RELS,
    "word/media/image1.png": PNG_BYTES,
    "docProps/core.xml":
      '<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>Relatorio anual</dc:title></cp:coreProperties>',
  });

  const note = parseDocx(bytes, "relatorio.docx");
  assert.equal(note.title, "Relatorio anual");
  assert.equal(note.source, "docx");

  const blocks = note.blocks;
  assert.equal(blocks[0].type, "heading_1");
  assert.equal(textOf(blocks[0]), "Relatorio");

  const formatted = blocks[1];
  assert.equal(formatted.props?.textAlign, "center");
  assert.ok(formatted.richText?.[0]?.annotations?.bold);
  assert.equal(formatted.richText?.[1]?.annotations?.italic, true);
  assert.equal(formatted.richText?.[1]?.annotations?.color, "#DC2626");
  assert.equal(formatted.richText?.[2]?.annotations?.underline, true);
  assert.ok(formatted.richText?.[2]?.annotations?.highlight);

  assert.equal(blocks[2].richText?.[0]?.href, "https://exemplo.com/destino");

  const bullet = blocks[3];
  assert.equal(bullet.type, "bulleted_list_item");
  assert.equal(textOf(bullet), "item um");
  assert.equal(bullet.children?.[0]?.type, "bulleted_list_item");
  assert.equal(textOf(bullet.children?.[0]), "sub item");

  const all = flat(blocks);
  assert.ok(all.some((block) => block.type === "numbered_list_item" && textOf(block) === "numerado"));
  const todo = all.find((block) => block.type === "todo");
  assert.equal(textOf(todo), "tarefa");
  assert.equal(todo?.props?.checked, false);
  assert.ok(all.some((block) => block.type === "quote" && textOf(block) === "citacao"));
  const indented = all.find((block) => textOf(block) === "recuado");
  assert.equal(indented?.props?.indent, 2);
  assert.ok(all.some((block) => block.type === "divider"));

  const table = all.find((block) => block.type === "table");
  assert.equal(table?.props?.hasColumnHeader, true);
  assert.deepEqual(table?.props?.colWidths, [96, 192]);
  const rows = table?.props?.tableRows ?? [];
  assert.equal(spansPlainText(rows[0].cells[0].spans), "Coluna A");
  assert.equal(spansPlainText(rows[1].cells[0].spans), "mesclada");
  assert.equal(rows[1].cells.length, 2);

  const image = all.find((block) => block.type === "image");
  assert.ok(image?.media?.url.startsWith(ASSET_URL_PREFIX));
  assert.equal(image?.media?.width, 100);
  assert.equal(image?.media?.height, 50);
  assert.equal(note.assets.length, 1);
});

run("docx alternate content and text boxes keep their content", () => {
  const document = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><mc:AlternateContent>
      <mc:Choice Requires="wps"><w:drawing><wp:inline><wp:extent cx="190500" cy="190500"/>
        <a:graphic><a:graphicData><pic:pic xmlns:pic="p"><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>
      </wp:inline></w:drawing></mc:Choice>
      <mc:Fallback><w:pict><v:shape><v:imagedata r:id="rId2"/></v:shape></w:pict></mc:Fallback>
    </mc:AlternateContent></w:r></w:p>
    <w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><wps:wsp xmlns:wps="w">
      <wps:txbx><w:txbxContent><w:p><w:r><w:t>texto da caixa</w:t></w:r></w:p></w:txbxContent></wps:txbx>
    </wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
  </w:body>
</w:document>`;

  const bytes = buildDocx({
    "word/document.xml": document,
    "word/styles.xml": DOCX_STYLES,
    "word/_rels/document.xml.rels": DOCX_RELS,
    "word/media/image1.png": PNG_BYTES,
  });

  const note = parseDocx(bytes, "caixas.docx");
  const images = flat(note.blocks).filter((block) => block.type === "image");
  assert.equal(images.length, 1);
  assert.equal(note.assets.length, 1);
  assert.ok(flat(note.blocks).some((block) => textOf(block) === "texto da caixa"));
});

run("google docs html import keeps structure and identifies the source", () => {
  const html = `<html><head><title>Plano de aula - Google Docs</title>
    <style>.c1{font-weight:700}.c2{color:#1155cc;text-decoration:underline}.c3{margin-left:36pt}</style></head>
    <body class="c9"><div class="doc-content">
    <h1 class="c4"><span class="c1">Plano</span></h1>
    <p class="c3"><span>recuado</span></p>
    <p><a class="c2" href="https://www.google.com/url?q=https%3A%2F%2Fdocs.exemplo.com&amp;sa=D">doc</a></p>
    <ul class="lst-kix_abc-0"><li><span>alpha</span></li></ul>
    </div></body></html>`;

  assert.equal(looksLikeGoogleDocsExport(html), true);
  const note = parseHtmlDocument(html, { sourceFileName: "plano.html" });
  assert.equal(note.title, "Plano de aula");
  assert.equal(note.source, "google-docs");
  assert.equal(note.blocks[0].type, "heading_1");
  assert.ok(note.blocks[0].richText?.[0]?.annotations?.bold);
  assert.equal(note.blocks[1].props?.indent, 1);
  assert.equal(note.blocks[2].richText?.[0]?.href, "https://docs.exemplo.com");
  assert.equal(note.blocks[3].type, "bulleted_list_item");
});

run("google docs title styles become headings and hidden blocks are skipped", () => {
  const blocks = parseHtml(
    `<p class="title"><span>Titulo</span></p><p class="subtitle"><span>Sub</span></p>` +
      `<hr style="page-break-before:always;display:none"><p style="visibility:hidden">oculto</p><p>visivel</p>`
  );
  assert.equal(blocks[0].type, "heading_1");
  assert.equal(textOf(blocks[0]), "Titulo");
  assert.equal(blocks[1].type, "heading_2");
  assert.equal(blocks.length, 3);
  assert.equal(textOf(blocks[2]), "visivel");
});

run("google docs html import decodes inline images", () => {
  const html = `<html><body><p><img src="data:image/png;base64,${toBase64(PNG_BYTES)}" alt="grafico"></p></body></html>`;
  const note = parseHtmlDocument(html, { sourceFileName: "doc.html" });
  assert.equal(note.assets.length, 1);
  const image = flat(note.blocks).find((block) => block.type === "image");
  assert.ok(image?.media?.url.startsWith(ASSET_URL_PREFIX));
  assert.equal(note.assets[0].mimeType, "image/png");
});

run("remote images are kept as media so they can be rehosted", () => {
  const note = parseHtmlDocument(
    `<html><body><p><img src="//lh7-rt.googleusercontent.com/docsz/exemplo" alt="grafico"></p>` +
      `<p><img src="https://cdn.exemplo.com/foto.png"></p></body></html>`,
    { sourceFileName: "doc.html" }
  );
  const images = flat(note.blocks).filter((block) => block.type === "image");
  assert.equal(images.length, 2);
  assert.equal(images[0].media?.url, "https://lh7-rt.googleusercontent.com/docsz/exemplo");
  assert.equal(images[1].media?.url, "https://cdn.exemplo.com/foto.png");
  assert.ok(note.warnings.includes("remote_asset"));
  assert.equal(note.assets.length, 0);
});

run("google docs urls are recognised", () => {
  assert.equal(
    extractGoogleDocId("https://docs.google.com/document/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWxYz/edit#gid=0"),
    "1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWxYz"
  );
  assert.equal(
    extractGoogleDocId("https://docs.google.com/document/u/1/d/e/2PACX-1vT0000000000000000000/pub"),
    "2PACX-1vT0000000000000000000"
  );
  assert.equal(extractGoogleDocId("https://exemplo.com/nada"), null);
});

run("import runner strips and restores media placeholders", () => {
  const blocks: AppBlock[] = [
    { id: "b1", type: "paragraph", richText: [{ text: "antes" }] },
    { id: "b2", type: "image", media: { url: `${ASSET_URL_PREFIX}a1`, name: "foto.png" } },
    {
      id: "b3",
      type: "bulleted_list_item",
      richText: [{ text: "lista" }],
      children: [{ id: "b4", type: "image", media: { url: `${ASSET_URL_PREFIX}a2`, name: "sub.png" } }],
    },
  ];

  assert.equal(countAssetReferences(blocks), 2);
  const stripped = stripPendingMedia(blocks);
  assert.equal(stripped.length, 2);
  assert.equal(stripped[1].children, undefined);

  const resolved = new Map([["a1", { url: "https://cdn/foto.png", storagePath: "w/1" }]]);
  const applied = applyResolvedAssets(blocks, resolved);
  assert.equal(applied.length, 3);
  assert.equal(applied[1].media?.url, "https://cdn/foto.png");
  assert.equal(applied[1].media?.storagePath, "w/1");
  assert.equal(applied[2].children, undefined);
});

run("imported blocks survive the editor serializer round trip", () => {
  const html =
    `<h2>Sub</h2><p style="text-align:right">texto <b>forte</b></p>` +
    `<ul><li>um<ul><li>dois</li></ul></li></ul>` +
    `<table><tr><th>h</th></tr><tr><td>c</td></tr></table><hr>`;
  const blocks = parseHtml(html);
  const round = docToBlocks(blocksToDoc(blocks));
  assert.equal(round[0].type, "heading_2");
  assert.equal(round[1].type, "paragraph");
  assert.equal(round[1].props?.textAlign, "right");
  assert.ok(round.some((block) => block.type === "bulleted_list_item"));
  assert.ok(round.some((block) => block.type === "table"));
  assert.ok(round.some((block) => block.type === "divider"));
  const nested = round.find((block) => block.type === "bulleted_list_item");
  assert.equal(nested?.children?.[0]?.type, "bulleted_list_item");
});

console.log("all file import verification tests passed");
