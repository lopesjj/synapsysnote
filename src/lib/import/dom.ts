export interface ParsedText {
  type: "text";
  value: string;
}

export interface ParsedElement {
  type: "element";
  name: string;
  attrs: Record<string, string>;
  children: ParsedNode[];
}

export type ParsedNode = ParsedText | ParsedElement;

export interface ParseOptions {
  xml?: boolean;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  "en-media",
  "en-todo",
]);

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

const CLOSES_PARAGRAPH = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const AUTO_CLOSE: Record<string, string[]> = {
  li: ["p", "li"],
  dt: ["p", "dt", "dd"],
  dd: ["p", "dt", "dd"],
  td: ["p", "td", "th"],
  th: ["p", "td", "th"],
  tr: ["p", "td", "th", "tr"],
  tbody: ["p", "td", "th", "tr", "thead", "tbody", "tfoot"],
  thead: ["p", "td", "th", "tr", "thead", "tbody", "tfoot"],
  tfoot: ["p", "td", "th", "tr", "thead", "tbody", "tfoot"],
  option: ["option"],
  p: ["p"],
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "‌",
  zwj: "‍",
  shy: "­",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  bull: "•",
  middot: "·",
  laquo: "«",
  raquo: "»",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  para: "¶",
  sect: "§",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  curren: "¤",
  iexcl: "¡",
  iquest: "¿",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  crarr: "↵",
  infin: "∞",
  ne: "≠",
  le: "≤",
  ge: "≥",
  radic: "√",
  sum: "∑",
  prod: "∏",
  int: "∫",
  part: "∂",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Omega: "Ω",
  aacute: "á",
  agrave: "à",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  iacute: "í",
  icirc: "î",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  ccedil: "ç",
  ntilde: "ñ",
  Aacute: "Á",
  Agrave: "À",
  Acirc: "Â",
  Atilde: "Ã",
  Auml: "Ä",
  Eacute: "É",
  Egrave: "È",
  Ecirc: "Ê",
  Iacute: "Í",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Ouml: "Ö",
  Uacute: "Ú",
  Uuml: "Ü",
  Ccedil: "Ç",
  Ntilde: "Ñ",
};

export function decodeEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.charCodeAt(0) === 35) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named ?? match;
  });
}

function createElement(name: string): ParsedElement {
  return { type: "element", name, attrs: {}, children: [] };
}

const ATTRIBUTE_PATTERN =
  /([^\s"'=/<>]+)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;

function parseAttributes(source: string, lowercase: boolean): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(source))) {
    const rawName = match[1];
    if (!rawName) continue;
    const name = lowercase ? rawName.toLowerCase() : rawName;
    const value = match[4] ?? match[5] ?? match[6] ?? "";
    if (attrs[name] === undefined) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

export function parseMarkup(input: string, options: ParseOptions = {}): ParsedElement {
  const xml = Boolean(options.xml);
  const root = createElement("#root");
  const stack: ParsedElement[] = [root];
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const lowerSource = xml ? source : source.toLowerCase();
  let index = 0;

  const top = () => stack[stack.length - 1];

  const pushText = (value: string) => {
    if (!value) return;
    top().children.push({ type: "text", value });
  };

  while (index < source.length) {
    const lt = source.indexOf("<", index);
    if (lt === -1) {
      pushText(decodeEntities(source.slice(index)));
      break;
    }
    if (lt > index) pushText(decodeEntities(source.slice(index, lt)));

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      pushText(source.slice(lt + 9, end === -1 ? source.length : end));
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<!", lt) || source.startsWith("<?", lt)) {
      const end = source.indexOf(">", lt + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    if (source.startsWith("</", lt)) {
      const end = source.indexOf(">", lt + 2);
      if (end === -1) {
        pushText(decodeEntities(source.slice(lt)));
        break;
      }
      const rawName = source.slice(lt + 2, end).trim();
      const name = xml ? rawName : rawName.toLowerCase();
      for (let depth = stack.length - 1; depth >= 1; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth;
          break;
        }
      }
      index = end + 1;
      continue;
    }

    const nameMatch = /^<([^\s/>]+)/.exec(source.slice(lt, lt + 200));
    if (!nameMatch) {
      pushText("<");
      index = lt + 1;
      continue;
    }

    let cursor = lt + nameMatch[0].length;
    let quote = "";
    while (cursor < source.length) {
      const char = source[cursor];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      cursor += 1;
    }
    if (cursor >= source.length) {
      pushText(decodeEntities(source.slice(lt)));
      break;
    }
    const end = cursor;

    const rawName = nameMatch[1];
    const name = xml ? rawName : rawName.toLowerCase();
    let attrSource = source.slice(lt + nameMatch[0].length, end);
    const selfClosing = /\/\s*$/.test(attrSource);
    if (selfClosing) attrSource = attrSource.replace(/\/\s*$/, "");

    if (!xml) {
      const closers = AUTO_CLOSE[name];
      if (closers) {
        while (stack.length > 1 && closers.includes(top().name)) stack.pop();
      } else if (CLOSES_PARAGRAPH.has(name)) {
        while (stack.length > 1 && top().name === "p") stack.pop();
      }
    }

    const element = createElement(name);
    element.attrs = parseAttributes(attrSource, !xml);
    top().children.push(element);
    index = end + 1;

    if (selfClosing || (!xml && VOID_ELEMENTS.has(name))) continue;

    if (!xml && RAW_TEXT_ELEMENTS.has(name)) {
      const closeIndex = lowerSource.indexOf(`</${name}`, index);
      const raw = source.slice(index, closeIndex === -1 ? source.length : closeIndex);
      if (raw) element.children.push({ type: "text", value: raw });
      if (closeIndex === -1) {
        index = source.length;
      } else {
        const closeEnd = source.indexOf(">", closeIndex);
        index = closeEnd === -1 ? source.length : closeEnd + 1;
      }
      continue;
    }

    stack.push(element);
  }

  return root;
}

export function isElement(node: ParsedNode | undefined | null): node is ParsedElement {
  return Boolean(node) && (node as ParsedNode).type === "element";
}

export function isText(node: ParsedNode | undefined | null): node is ParsedText {
  return Boolean(node) && (node as ParsedNode).type === "text";
}

export function childElements(element: ParsedElement, name?: string): ParsedElement[] {
  const out: ParsedElement[] = [];
  for (const child of element.children) {
    if (!isElement(child)) continue;
    if (name && child.name !== name) continue;
    out.push(child);
  }
  return out;
}

export function firstChildElement(element: ParsedElement, name: string): ParsedElement | null {
  for (const child of element.children) {
    if (isElement(child) && child.name === name) return child;
  }
  return null;
}

export function findDescendants(element: ParsedElement, name: string): ParsedElement[] {
  const out: ParsedElement[] = [];
  const walk = (node: ParsedElement) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (child.name === name) out.push(child);
      walk(child);
    }
  };
  walk(element);
  return out;
}

export function findFirstDescendant(element: ParsedElement, name: string): ParsedElement | null {
  for (const child of element.children) {
    if (!isElement(child)) continue;
    if (child.name === name) return child;
    const nested = findFirstDescendant(child, name);
    if (nested) return nested;
  }
  return null;
}

export function attr(element: ParsedElement, name: string): string | undefined {
  return element.attrs[name];
}

export function childText(element: ParsedElement, name: string): string {
  const child = firstChildElement(element, name);
  return child ? textContent(child) : "";
}

export function textContent(node: ParsedNode): string {
  if (isText(node)) return node.value;
  let out = "";
  for (const child of node.children) out += textContent(child);
  return out;
}
