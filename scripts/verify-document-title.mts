import assert from "node:assert/strict";
import { formatTabTitle, APP_NAME } from "../src/lib/document-title";

assert.equal(formatTabTitle(), APP_NAME);
assert.equal(formatTabTitle(null), APP_NAME);
assert.equal(formatTabTitle(""), APP_NAME);
assert.equal(formatTabTitle("   "), APP_NAME);

assert.equal(formatTabTitle("Início"), "Synapsys Note | Início");
assert.equal(formatTabTitle("Meu Caderno"), "Synapsys Note | Meu Caderno");
assert.equal(formatTabTitle("Minha Nota Importante"), "Synapsys Note | Minha Nota Importante");

assert.equal(
  formatTabTitle("Minha Nota Importante de Trabalho"),
  "Synapsys Note | Minha Nota Importante..."
);

assert.equal(
  formatTabTitle("SPTC - Perito Criminal de São Paulo"),
  "Synapsys Note | SPTC - Perito..."
);

assert.equal(
  formatTabTitle("  Uma   duas  três   quatro  cinco "),
  "Synapsys Note | Uma duas três..."
);

console.log("all document-title tests passed");
