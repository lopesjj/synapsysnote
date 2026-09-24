function splitParagraph(paragraph: string, maxChunkLength: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > maxChunkLength) {
    const window = rest.slice(0, maxChunkLength);
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
      window.lastIndexOf("。"),
      window.lastIndexOf("؟ ")
    );
    if (cut < maxChunkLength / 2) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = maxChunkLength - 1;
    pieces.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) pieces.push(rest.trim());
  return pieces;
}

export function splitTextIntoSafeChunks(text: string, maxChunkLength = 3000): string[] {
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of text.split(/\n\n+/)) {
    for (const piece of splitParagraph(para, maxChunkLength)) {
      if ((current ? current.length + 2 : 0) + piece.length > maxChunkLength) push();
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  push();
  return chunks.length > 0 ? chunks : [text];
}
