import assert from "node:assert/strict";
import { detectLanguage } from "../src/lib/ai/language-detect";
import { splitTextIntoSafeChunks } from "../src/lib/ai/text-chunks";

const samples: Record<string, string> = {
  pt: "Olá, pessoal, tudo joia? A nossa aula de agora é sobre Active Directory, um dos elementos principais da família Windows Server. Quase tudo está voltado para Active Directory e não é diferente com as provas de concurso, muita questão mesmo. Workgroup ou grupo de trabalho ele é indicado para redes pequenas. A gente vê em questões e até na literatura até 10 usuários.",
  es: "Hola a todos, ¿qué tal? La clase de ahora es sobre Active Directory, uno de los elementos principales de la familia Windows Server. Casi todo está orientado a Active Directory y no es diferente en los exámenes, hay muchas preguntas. El grupo de trabajo es indicado para redes pequeñas y lo vemos en las preguntas y también en la literatura.",
  en: "Hello everyone, how are you? This class is about Active Directory, one of the main elements of the Windows Server family. Almost everything is focused on Active Directory and it is not different with the exams, there are a lot of questions. A workgroup is recommended for small networks and we can see that in the questions and in the literature.",
  fr: "Bonjour à tous, ça va ? Le cours de maintenant est sur Active Directory, un des éléments principaux de la famille Windows Server. Presque tout est tourné vers Active Directory et ce n'est pas différent pour les concours, il y a beaucoup de questions. Le groupe de travail est indiqué pour les petits réseaux et nous le voyons dans les questions.",
  it: "Ciao a tutti, come va? La lezione di adesso è su Active Directory, uno degli elementi principali della famiglia Windows Server. Quasi tutto è rivolto ad Active Directory e non è diverso negli esami, ci sono molte domande. Il gruppo di lavoro è indicato per le reti piccole e lo vediamo anche nelle domande e nella letteratura.",
  de: "Hallo zusammen, wie geht es euch? Die Stunde jetzt ist über Active Directory, eines der wichtigsten Elemente der Windows Server Familie. Fast alles ist auf Active Directory ausgerichtet und das ist bei den Prüfungen nicht anders, es gibt sehr viele Fragen. Die Arbeitsgruppe wird für kleine Netzwerke empfohlen und wir sehen das auch in der Literatur.",
  ru: "Всем привет, как дела? Сегодняшний урок посвящён Active Directory, одному из главных элементов семейства Windows Server. Почти всё ориентировано на Active Directory, и на экзаменах это не иначе, вопросов очень много.",
  ja: "皆さん、こんにちは。今回の授業は Active Directory についてです。これは Windows Server ファミリーの主要な要素の一つです。試験でもほとんどの問題が Active Directory に関するものです。",
  zh: "大家好，今天这节课讲的是 Active Directory，它是 Windows Server 家族的主要组成部分之一。考试中几乎所有的问题都与 Active Directory 有关。",
  ar: "مرحباً بالجميع، كيف حالكم؟ درس اليوم عن أكتيف دايركتوري، وهو أحد العناصر الرئيسية في عائلة ويندوز سيرفر. تقريباً كل شيء موجه نحو أكتيف دايركتوري وهذا لا يختلف في الامتحانات.",
};

for (const [language, text] of Object.entries(samples)) {
  assert.equal(detectLanguage(text), language, `detecta ${language}`);
}
assert.equal(detectLanguage("ok"), null, "texto curto demais não decide");
assert.equal(detectLanguage(""), null, "texto vazio não decide");

const sentence = "Esta é uma frase de teste sobre o Active Directory. ";
const long = sentence.repeat(200).trim();
const chunks = splitTextIntoSafeChunks(long, 3000);
assert.ok(chunks.length > 1, "texto longo é dividido");
assert.ok(chunks.every((chunk) => chunk.length <= 3000), "nenhum trecho passa do teto");
assert.ok(chunks.every((chunk) => chunk.endsWith(".")), "o corte cai no fim de uma frase");
assert.equal(chunks.join(" ").replace(/\s+/g, " "), long, "nenhuma palavra se perde");

const noPunctuation = "palavra ".repeat(1000).trim();
const wordChunks = splitTextIntoSafeChunks(noPunctuation, 3000);
assert.ok(wordChunks.every((chunk) => !chunk.startsWith("alavra")), "sem pontuação, corta entre palavras");
assert.equal(wordChunks.join(" "), noPunctuation, "nenhuma palavra se perde sem pontuação");

console.log("verify:transcript-language OK");
