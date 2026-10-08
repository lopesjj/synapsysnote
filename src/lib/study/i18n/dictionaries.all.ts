import { pt, type StudyStrings } from "./pt";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { de } from "./de";
import { ru } from "./ru";
import { ja } from "./ja";
import { zh } from "./zh";
import { ar } from "./ar";

/**
 * Os dez dicionários de uma vez, para a varredura que compara as chaves de cada
 * idioma com as do português (`verify:study`).
 *
 * O app NÃO usa este módulo: importá-lo joga os dez para dentro do pacote do
 * navegador. Em tela, use `studyDictionary` de `./dictionaries`, que carrega
 * só o idioma em uso.
 */
export const STUDY_DICTIONARIES: Record<string, StudyStrings> = {
  pt,
  en,
  es,
  fr,
  it,
  de,
  ru,
  ja,
  zh,
  ar,
};
