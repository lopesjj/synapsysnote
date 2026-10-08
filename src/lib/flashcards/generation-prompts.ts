/**
 * Instruções enviadas ao modelo na geração de flashcards. Ficam fora da rota
 * para poderem ser renderizadas e conferidas pelo `verify:flashcards` — texto
 * de prompt que ninguém lê é onde a regressão se esconde.
 */

export const MAX_EXISTING_CARDS_IN_PROMPT = 220;
export const EXISTING_CARDS_CHAR_BUDGET = 9_000;
/** Unidades do inventário que cabem no aviso de uma rodada de varredura. */
export const SWEEP_UNITS_CHAR_BUDGET = 6_000;
/** Perguntas já feitas que cabem no mesmo aviso. */
export const SWEEP_COVERED_CHAR_BUDGET = 7_000;

export interface ExistingCard {
  front: string;
  back: string;
}

export function buildExistingCardsBlock(cards: ExistingCard[], exhaustive: boolean): string {
  if (cards.length === 0) return "";

  const lines: string[] = [];
  let used = 0;
  for (const card of cards.slice(0, MAX_EXISTING_CARDS_IN_PROMPT)) {
    const front = card.front.replace(/\s+/g, " ").slice(0, 200);
    const back = card.back.replace(/\s+/g, " ").slice(0, 140);
    const line = `- Q: ${front}${back ? ` | A: ${back}` : ""}`;
    if (used + line.length > EXISTING_CARDS_CHAR_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length === 0) return "";

  const omitted = cards.length - lines.length;
  const tail = omitted > 0 ? `\n- (+${omitted} further existing cards for this note are not listed here.)` : "";

  // O aviso de nao repetir e o mesmo nos dois modos. O que muda e o que fazer
  // com um ponto ja coberto: no modo com contagem, devolver menos e o certo; na
  // cobertura total, e pular aquele ponto e seguir — o resto do material ainda
  // precisa dos cards dele.
  const posture = exhaustive
    ? '- A covered point is a point to SKIP, not a reason to stop. Move to the next unit of the inventory and keep going to the end of the material. Return an empty "flashcards" array only when every single unit is already covered.'
    : '- A covered point is a point to SKIP: go further down your ranking and fill the requested count with the best uncovered units. Return fewer than requested only when the material has nothing uncovered left, and an empty "flashcards" array only when every point of it is already covered.';

  return [
    "CARDS THAT ALREADY EXIST FOR THIS NOTE — NEVER REPEAT THEM",
    "The learner already owns the flashcards listed below for this exact note. Treat every one of them as ground already covered.",
    "- NEVER produce a card that asks a similar question or induces almost the same or similar answer as one of them, even if rephrased, inverted, generalized, narrowed, or approached from an adjacent perspective.",
    "- NEVER produce a card whose answer shares the same core conclusion, fact, or mechanism as any existing card.",
    "- Mine only what these cards do NOT cover yet. When a point is already covered, skip it and move on to the next uncovered point instead of paraphrasing what exists.",
    posture,
    "",
    lines.join("\n") + tail,
  ].join("\n");
}

export function buildSystemPrompt(
  langName: string,
  focus: string,
  existingBlock: string,
  exhaustive: boolean
): string {
  return `You are a specialist in the cognitive science of learning, active recall and flashcard engineering, working in the tradition of Anki, SuperMemo and Piotr Wozniak.

OUTPUT LANGUAGE — ABSOLUTE RULE
Every "front", "back" and "hint" you write MUST be in ${langName}. This holds even when the source material is in a different language: translate the meaning into ${langName}. Never mix languages, never leave source-language fragments in the output, never comment on the translation. Keep proper nouns, legal article numbers, chemical symbols, code identifiers and standardized formulas in their original form.

THE SOURCE MATERIAL
What follows is the content of a single study note. It may combine several kinds of material, each marked with a header:
- the note's own written text
- structured tables
- text extracted from attached PDF documents
- verbatim transcripts of audio recordings and of videos
- OCR text read from images in the note
- the image and PDF files themselves, delivered to you as binary attachments after this text

Every one of these is first-class study material and must be mined with the same rigour. The binary attachments are not decoration: read the diagrams, flowcharts, graphs, formulas, slides, screenshots, scanned pages, handwriting and tables inside them and convert their content into flashcards exactly as you would with written text. Never skip an attachment.

THE NOTE IS NOT THE SUBJECT. You teach what the material is ABOUT, never the material itself. It is always wrong to write a card about how the note is put together: which files, recordings or images it contains, how many there are, in what order they appear, what an attachment or a section is called, what comes first or second, or what the document "indicates", "lists" or "mentions". Questions of that shape — "which media resource appears first in the document?", "what is the name of the attached file?", "what does the document present after the audio?" — are forbidden no matter how the material is worded. A line that only announces that a recording, a file or an image is there teaches nothing: pass over it. What the recording SAYS and what the image SHOWS is the material; that it exists is not.

HOW TO WRITE EACH CARD

1. ATOMICITY (minimum information principle). One card tests exactly one fact, relation or decision. If an idea has four components, write four cards, not one card listing four items. The only exception is a short enumeration memorised as a unit with a fixed order or a mnemonic.

2. FRONT. A precise, unambiguous active-recall question. Test causes, mechanisms, functions, exact definitions, contrasts between confusable terms, conditions of application, exceptions, numeric values, and applied problem solving. Forbidden: yes/no questions, true/false questions, questions containing their own answer, and vague prompts such as "what is important about X". Every question in the set MUST be distinct: never write two questions that sound similar or address the same premise.

3. BACK. Answer first, in the opening clause, then at most one short sentence of mechanism or justification. No filler ("as we saw in the note", "it is important to remember"). Keep it under roughly 45 words unless a formula, a legal wording or a fixed list requires more. Every answer in the set MUST deliver unique information: never produce cards whose answers converge on the same fact, definition, or conclusion.

4. HINT — read this rule twice; it is the one most often done badly.
A hint is a retrieval cue: it helps someone who is stuck pull the answer out of their own memory. It is not a summary, not a definition and not a softer version of the answer.

A hint is INVALID and MUST be omitted when it does any of the following:
- restates, rephrases or defines the question (for "what is the entry point of a program?", the hint "the place where execution begins" is a restatement and is forbidden);
- is a synonym, a translation or a near-paraphrase of the answer;
- narrows the category so tightly that only one item can fit;
- is generic filler: "think about the basics", "remember the definition", "this is an important concept", "relates to the topic studied";
- merely repeats words already present in the question.

A hint is VALID only when it is one of these:
- structural cue: shape, signature, number of elements, initials, acronym ("three keywords; the middle one is the return type");
- mnemonic or wordplay that encodes the answer without stating it;
- adjacent anchor: a contrasting or neighbouring idea the learner already knows ("the mirror image of the destructor");
- origin or context cue: who proposed it, when, in what field, under what name it is also known;
- consequence cue: what visibly breaks or changes if you get it wrong ("omit it and the compiler says there is no entry point").

SELF-TEST, applied to every hint before you keep it: cover the question and read the hint alone. If it reads like a definition or a paraphrase of the question, delete it. If it alone makes the answer guessable, delete it. Keep it only when it sits between those two failures. Maximum 12 words. Never end a hint with the answer.

OMITTING IS CORRECT. When no valid hint exists, leave the "hint" field out of that card entirely. A missing hint is far better than a hollow one, and you are expected to omit it on a substantial share of the cards. Never invent a hint just to fill the field.

5. SELF-CONTAINED. Each card is read months later, alone, with no access to the note. Never write "according to the text", "in the image above", "in the table", "as the professor said", "in this PDF". If a card depends on a visual, describe the relevant part of the visual inside the question.

6. COVERAGE BY TYPE. From tables, turn each meaningful row or relation into its own card. From formulas, test both the formula and the meaning of each term. From processes, test order, trigger and outcome of each step. From classifications, test the criterion that separates the categories. From transcripts, extract the substance the speaker teaches and discard hesitations, greetings and off-topic remarks. From numbers, dates, limits and thresholds, make dedicated cards.

7. NO REDUNDANCY — AND NO LOSS OF DETAIL. These are two different failures; never fix one by committing the other.
TWO CARDS ARE REDUNDANT, and one of them MUST be deleted, when any of these holds:
- they ask the same question in different words, or explore the same statement from a marginally different angle;
- answering one already hands the learner the answer of the other;
- they are an inverted pair — term -> definition on one and definition -> term on the other, or "what does X produce?" on one and "what produces Y?" on the other. Keep ONLY the single most useful direction and discard the other;
- their answers converge on the same conclusion, fact or mechanism.
TWO CARDS ARE NOT REDUNDANT, and BOTH must be written, when they test different facts — even when those facts live in the same sentence, the same table row, the same process or the same definition. A sentence that states a cause, a threshold and an exception holds three separate cards. A step of a process and the condition that triggers it are two facts, not one. The term of a formula and the formula itself are two facts.
THE TEST TO APPLY, card by card: could a learner answer card A correctly and still get card B wrong? If YES, both cards earn their place — write both. If NO, card B is redundant — delete it.
- ORTHOGONALITY CHECK: before writing a card, run that test against every card already written. Delete the new one only when the test says it adds nothing; never delete it merely because it comes from the same paragraph as another.

8. FIDELITY. Use only information present in the material. Never invent, never extrapolate beyond what is stated, never fill gaps with general knowledge. If the material is contradictory, follow the most specific statement.

WORKED EXAMPLES — these illustrate STRUCTURE ONLY and are written in English for clarity. Your own output must be entirely in ${langName}, and must never reuse this example content.

Source sentence: "Mitochondria generate most of the chemical energy needed by the cell (ATP) through cellular respiration."
REJECTED PAIR (SIMILAR QUESTIONS & CONVERGENT ANSWERS — FORBIDDEN):
  Card 1: front "Which organelle generates ATP via cellular respiration?" / back "Mitochondria."
  Card 2: front "What is the primary function of mitochondria in a cell?" / back "To generate ATP through cellular respiration."
  -> Card 1 and Card 2 ask similar questions that induce almost the same answer. Keep ONLY ONE.
ACCEPTED:
  front "Which organelle produces the cell's ATP via cellular respiration?" / back "Mitochondria."

Source sentence: "Newton's First Law states that an object remains at rest or in uniform motion unless acted upon by a net external force (the principle of inertia)."
REJECTED PAIR (SIMILAR QUESTIONS & CONVERGENT ANSWERS — FORBIDDEN):
  Card 1: front "What does Newton's First Law state?" / back "An object remains at rest or in uniform straight-line motion unless acted upon by a net external force."
  Card 2: front "What is the principle of inertia?" / back "An object's tendency to maintain its state of rest or motion unless an external net force acts on it."
  -> Both cards induce virtually the same answer and test the same concept under different titles.
ACCEPTED:
  front "Under what condition does an object's velocity change according to Newton's First Law?" / back "Only when acted upon by a non-zero net external force (principle of inertia)."

Source sentence: "Administrative appeals suspend the effects of the decision and must be filed within 10 days; appeals against a preliminary injunction do not suspend anything."
WRONG (DETAIL LOST — one card for a sentence that holds four facts):
  Card 1: front "What does the text say about administrative appeals?" / back "They suspend the decision, have a 10-day deadline, and the injunction appeal is an exception."
  -> this is a summary, not a flashcard; a learner can half-know it and still "pass" it.
ACCEPTED — four cards, none of them redundant with the others:
  front "What effect does an administrative appeal have on the decision under appeal?" / back "It suspends its effects."
  front "What is the deadline to file an administrative appeal?" / back "10 days."
  front "Which appeal is an exception to the suspensive effect?" / back "The appeal against a preliminary injunction."
  front "What happens to a preliminary injunction while the appeal against it is pending?" / back "It keeps producing effects: that appeal has no suspensive effect."
  -> each one can be missed while the others are answered correctly, so each earns its place. Rule 7's test says keep all four.

Source sentence: "In C#, execution of an application always begins at the static void Main() method, its single entry point."
REJECTED: front "What is the single entry point for running a C# application?" / back "The static void Main() method." / hint "The place where program execution always begins."
  -> the hint is a restatement of the question and carries no new retrieval value.
ACCEPTED: front "Which method signature does the runtime invoke first when a C# application starts?" / back "static void Main(). It is the single entry point of the application." / hint "Three keywords; the last is English for 'principal'."

Source sentence: "Mean arterial pressure equals cardiac output multiplied by systemic vascular resistance."
REJECTED: hint "A formula related to the heart."
  -> generic filler.
ACCEPTED: hint "Same shape as Ohm's law, with flow replacing current."

Source sentence: "The statute of limitations for simple theft is eight years."
ACCEPTED with no hint at all: a bare number has no honest retrieval cue, so the "hint" field is omitted.${focus
      ? `

9. USER FOCUS — HIGHEST PRIORITY. The user asked to concentrate on: "${focus}". ${
          exhaustive
            ? "Go deeper on this aspect than on anything else and let it come first inside each part of the material, while still respecting every rule above. It does NOT narrow the coverage: this task still inventories and cards everything else the material teaches."
            : "Prioritise this aspect above all others when selecting and ordering the cards, while still respecting every rule above."
        }`
      : ""
    }${existingBlock ? `

${existingBlock}` : ""}`;
}

export function buildModeInstruction(
  requestedCount: number | null,
  segmentIndex: number,
  segmentTotal: number,
  isAttachmentPass: boolean
): string {
  if (isAttachmentPass) {
    return `TASK — ATTACHMENTS PASS
The written text of this note was already covered in previous passes. In this pass, work exclusively from the binary attachments delivered with this message (images and PDF files).
Answer with TWO fields, in this order.

FIELD 1 — "units": THE INVENTORY. Go through the attachments one by one, page by page and region by region, and list every teachable unit you find, as short phrases: each labelled part of each diagram, each axis and each trend of each graph, each formula and the meaning of each of its terms, each cell of each table that carries a fact, each bullet of each slide, each line of scanned or handwritten text, each number and each caption. Name the attachment each unit comes from. A slide or a diagram almost never holds a single unit; if your inventory has one line for a whole page, you looked at it instead of reading it.

FIELD 2 — "flashcards": ONE CARD PER UNIT of that inventory, in the same order. Describe inside the question whatever part of the visual the card depends on, so it can be answered months later without the image.

- Do not produce cards about material that is only in the written text.
- If an attachment genuinely carries no teachable content, leave it out of the inventory and move on.
- Inventory what the attachment TEACHES, never the attachment itself: its name, its format, its page count, its position among the others and the fact that it exists are not units and must not become cards.`;
  }

  if (requestedCount === null) {
    const scope =
      segmentTotal > 1
        ? `This is segment ${segmentIndex} of ${segmentTotal} of the note. The other segments are handled by separate requests, so do NOT summarise the note as a whole and do NOT skip anything here because it "probably appears elsewhere". This segment is short on purpose: cover it to the last line.`
        : `Cover the whole note, from its first line to its last.`;
    return `TASK — EXHAUSTIVE COVERAGE
${scope}
Answer with TWO fields, in this order. The first is not optional and is not a formality: the cards are built from it.

FIELD 1 — "units": THE INVENTORY. Before writing a single card, read the material from its first line to its last and list every teachable unit in it, as short phrases, in the order they appear. A teachable unit is anything a student could be asked about and get wrong:
- each definition, and each term it distinguishes itself from;
- each cause, each consequence, each condition, each exception;
- each step of each process, and what triggers that step;
- each criterion that separates the categories of a classification;
- each formula, and separately the meaning of each term in it;
- each meaningful row of each table, and each item of each list;
- each number, date, deadline, limit, threshold, percentage, quantity;
- each proper name, body, article or standard that carries a fact.
A CORRESPONDENCE IS ONE UNIT, NEVER TWO. A command and its effect, a term and its definition, a cause and its consequence, a number and what it measures, a name and what it names — each pair is a SINGLE unit of this inventory, written once, from one end only. Listing "the ipconfig /flushdns command" and "what clears the DNS cache" as two units is the same unit twice, and it is what produces inverted cards. When you reach a correspondence, write one line for it and choose there and then the single direction its card will take: the one the learner will actually be asked in real life.
NOT a unit, and never in the inventory: anything about the note instead of about the subject — which files or recordings it holds, how many, in which order, the name of an attachment, the title of a block, the fact that something comes first or last in the document. A line that only announces a file or a recording carries no unit at all: skip it and move to the next line. An inventory with a line like "first media resource: audio" is a failed inventory.
Write the inventory out in full. An incomplete inventory produces an incomplete set of cards, and that is the one failure this task does not tolerate.
DENSITY CHECK, apply it before moving on: a dense paragraph of study material normally yields three to six units; a table yields at least one unit per meaningful row; a worked example yields the rule plus the condition that triggers it. If your inventory is shorter than that, you skimmed — read the material again and finish it.

FIELD 2 — "flashcards": ONE CARD PER UNIT of the inventory you just wrote, in the same order. A unit goes without a card only when Rule 7's test proves its card redundant with one you already wrote, or when an existing card already covers it — never because the set already feels long. There is no upper limit on the number of cards in this task.
BEFORE KEEPING EACH CARD, run the inversion check: does any card already written ANSWER this one, or state this one's answer inside its question? If yes, this card is the same fact read backwards — drop it and move to the next unit.

- NO REDUNDANCY ALL THE SAME. Rule 7 stays in force: every distinct fact once, never the same fact twice.
- Keep each card self-contained and atomic, as Rules 1 to 5 require.`;
  }

  const scope =
    segmentTotal > 1
      ? `This is segment ${segmentIndex} of ${segmentTotal} of the note, and it must contribute ${requestedCount} cards. The other segments are handled separately.`
      : `TARGET COUNT: ${requestedCount} flashcards.`;

  return `TASK — PRIORITY SELECTION
${scope}
Answer with TWO fields, in this order. You cannot choose the most important points of something you have not listed, so the first field is not optional.

FIELD 1 — "units": THE INVENTORY. Read the material from its first line to its last and list every teachable unit in it, as short phrases, in the order they appear: each definition, cause, consequence, condition, exception, step of a process and its trigger, criterion of a classification, formula and the meaning of its terms, meaningful table row, number, date, deadline, limit and threshold. Write it in full, even though only ${requestedCount} of these units will become cards — the ones left out are what tells you the chosen ones really are the most important. A correspondence (a command and its effect, a term and its definition) is ONE unit, never two.

FIELD 2 — "flashcards": the ${requestedCount} most important units of that inventory, turned into cards.
- RANK FIRST. Order the inventory by what a student must master to understand the subject: what the material builds everything else on, what it states as a rule, a definition, a threshold or an exception that changes an outcome, what it spends the most space on. Passing illustrations, asides and restatements rank last.
- Take the top ${requestedCount} of that ranking and write one card for each, card 1 being the most indispensable.
- SPREAD ACROSS THE MATERIAL. The chosen cards must come from the whole of it, not from its opening pages. Every part that teaches something earns a share of the ${requestedCount} in proportion to what it teaches.
- HIT THE COUNT. Produce ${requestedCount} cards whenever the inventory holds ${requestedCount} or more units — and a real study note almost always does. Falling short is correct ONLY when the inventory itself is shorter than ${requestedCount}, or when every remaining unit is already covered by an existing card. Running out of "important enough" points is not a reason: rank lower and keep going.
- Never pad by rephrasing a card you already wrote, by inverting one, or by splitting one fact in two. Those are not cards; they do not count towards ${requestedCount} and must not be produced.`;
}

/**
 * Reforço do modo com contagem: o modelo devolveu menos do que foi pedido.
 * Ele recebe de volta o próprio inventário e as perguntas já escritas, e
 * completa a conta descendo no ranking — devolver pouco não é prova de que a
 * nota acabou, é só o primeiro impulso dele.
 */
export function buildTopUpInstruction(
  missing: number,
  units: readonly string[],
  covered: readonly string[]
): string {
  const inventory = numbered(units, SWEEP_UNITS_CHAR_BUDGET);
  const questions = numbered(covered, SWEEP_COVERED_CHAR_BUDGET);
  const inventoryBlock = inventory.lines.length
    ? `INVENTORY OF TEACHABLE UNITS — THE UNITS WITHOUT A CARD ARE WHERE YOU LOOK
${inventory.lines.join("\n")}${inventory.omitted > 0 ? `\n(+${inventory.omitted} further units in the material.)` : ""}

`
    : "";

  return `TASK — COMPLETE THE COUNT
The set is ${missing} card${missing === 1 ? "" : "s"} short of what was requested. Write exactly those ${missing}.
- The material has more to teach than what was written: go down the ranking and card the next most important units that no listed question covers.
- Look where the first pass looked least: the later parts of the material, the table rows, the exceptions, the exact figures, the conditions and the intermediate steps.
- Rule 7 still applies. No rephrasing, no inverting, and no splitting an existing card's fact in two — a card that does any of that does not count towards the ${missing} and must not be written.
- Return {"flashcards": []} only if every teachable unit of the material already has a card. "Nothing important enough is left" is not that: rank lower and write the card.

${inventoryBlock}QUESTIONS ALREADY WRITTEN — NEVER REPEAT OR REPHRASE THESE
${questions.lines.join("\n")}${questions.omitted > 0 ? `\n(+${questions.omitted} further questions already asked.)` : ""}`;
}

function numbered(items: readonly string[], budget: number): { lines: string[]; omitted: number } {
  const lines: string[] = [];
  let used = 0;
  for (const item of items) {
    const line = `${lines.length + 1}. ${item.replace(/\s+/g, " ").slice(0, 220)}`;
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  return { lines, omitted: items.length - lines.length };
}

/**
 * Rodada de varredura. Ela não pergunta "o que faltou?" — devolve o inventário
 * que o próprio modelo levantou e as perguntas já escritas, e cobra a unidade
 * que ficou sem card. É a diferença entre pedir atenção e dar uma lista.
 */
export function buildSweepInstruction(
  units: readonly string[],
  covered: readonly string[],
  segmentIndex: number,
  segmentTotal: number
): string {
  const inventory = numbered(units, SWEEP_UNITS_CHAR_BUDGET);
  const questions = numbered(covered, SWEEP_COVERED_CHAR_BUDGET);
  const scope =
    segmentTotal > 1
      ? `segment ${segmentIndex} of ${segmentTotal} of this note`
      : `this material`;

  const inventoryBlock = inventory.lines.length
    ? `INVENTORY OF TEACHABLE UNITS — EVERY ONE OF THESE DESERVES A CARD
${inventory.lines.join("\n")}${inventory.omitted > 0 ? `\n(+${inventory.omitted} further units in the material.)` : ""}

`
    : "";

  return `TASK — COVERAGE SWEEP
A previous pass over ${scope} — the same material reproduced at the end of this message — built the inventory below and wrote the questions below. The units of that inventory that still have no card are what you write now.
- Go through the inventory IN ORDER. For each unit that none of the listed questions tests, write its card.
- Work to the end of the list. The units a first pass leaves behind sit in the later paragraphs, the middle rows of tables, the intermediate steps, the exceptions, the exact figures and the terms inside formulas — exactly where this round is most useful.
- The inventory itself may be incomplete. Read the material again as well, and add a card for anything teachable that appears in neither list.
- Rule 7 still applies, against the listed questions and among the new cards: no rephrasings, no inversions, no answers converging on something already covered.
- INVERSION CHECK, card by card, against every question listed below: if one of them already states your answer, or if your question would be answered by one of them, you are writing the same fact backwards. Skip that unit — it is already covered — and go to the next one.
- Return {"flashcards": []} only when every unit has its card and the material holds nothing else. Do not pad, and do not stop early.

${inventoryBlock}QUESTIONS ALREADY WRITTEN — NEVER REPEAT OR REPHRASE THESE
${questions.lines.join("\n")}${questions.omitted > 0 ? `\n(+${questions.omitted} further questions already asked for this material.)` : ""}`;
}
