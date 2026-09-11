import { editorLowlight } from "./lowlight";

export interface CodeLanguage {
  id: string;
  label: string;
  aliases?: string[];
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: "plaintext", label: "Texto simples" },
  { id: "typescript", label: "TypeScript", aliases: ["ts", "tsx"] },
  { id: "javascript", label: "JavaScript", aliases: ["js", "jsx"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "java", label: "Java" },
  { id: "csharp", label: "C#", aliases: ["cs"] },
  { id: "cpp", label: "C++", aliases: ["c++"] },
  { id: "c", label: "C" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "dart", label: "Dart" },
  { id: "scala", label: "Scala" },
  { id: "elixir", label: "Elixir" },
  { id: "haskell", label: "Haskell" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML", aliases: ["xml"] },
  { id: "xml", label: "XML / HTML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
  { id: "bash", label: "Bash", aliases: ["sh", "shell", "zsh"] },
  { id: "powershell", label: "PowerShell", aliases: ["ps1"] },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "nginx", label: "Nginx" },
  { id: "http", label: "HTTP" },
  { id: "graphql", label: "GraphQL" },
  { id: "latex", label: "LaTeX" },
  { id: "ini", label: "INI / TOML" },
  { id: "diff", label: "Diff" },
  { id: "lua", label: "Lua" },
  { id: "r", label: "R" },
  { id: "perl", label: "Perl" },
  { id: "makefile", label: "Makefile" },
];

const ALIAS_TO_ID: Record<string, string> = {};
for (const language of CODE_LANGUAGES) {
  ALIAS_TO_ID[language.id] = language.id;
  for (const alias of language.aliases ?? []) ALIAS_TO_ID[alias] = language.id;
}

const HIGHLIGHT_ID: Record<string, string> = {
  html: "xml",
  bash: "bash",
  shell: "bash",
};

export function normalizeLanguage(id: string | null | undefined): string {
  if (!id || id === "auto") return "plaintext";
  const catalog = ALIAS_TO_ID[id.toLowerCase()] ?? id.toLowerCase();
  const highlightId = HIGHLIGHT_ID[catalog] ?? catalog;
  return editorLowlight.registered(highlightId) ? highlightId : "plaintext";
}

export function languageLabel(id: string | null | undefined): string {
  if (!id || id === "auto") return "Detectar automaticamente";
  const catalog = ALIAS_TO_ID[id.toLowerCase()] ?? id;
  return CODE_LANGUAGES.find((language) => language.id === catalog)?.label ?? id;
}

interface Rule {
  pattern: RegExp;
  score: number;
}

interface LanguageDef {
  id: string;
  rules: Rule[];
  antiRules?: Rule[];
}

const LANGUAGE_RULES: LanguageDef[] = [
  {
    id: "python",
    rules: [
      { pattern: /^\s*def\s+[a-zA-Z_]\w*\s*\(.*?\)\s*:/m, score: 35 },
      { pattern: /^\s*class\s+[a-zA-Z_]\w*(\s*\(.*?\))?\s*:/m, score: 30 },
      { pattern: /^\s*(from\s+[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*\s+import\s+([a-zA-Z_]\w*|\*))/m, score: 30 },
      { pattern: /^\s*import\s+[a-zA-Z_]\w*(\s+as\s+[a-zA-Z_]\w*)?$/m, score: 25 },
      { pattern: /\bprint\s*\(/, score: 20 },
      { pattern: /^\s*elif\s+.*?:/m, score: 25 },
      { pattern: /^\s*if\s+.*?:$/m, score: 20 },
      { pattern: /^\s*for\s+[a-zA-Z_]\w*\s+in\s+.*?:/m, score: 25 },
      { pattern: /^\s*except(\s+[a-zA-Z_]\w*)?\s*:/m, score: 25 },
      { pattern: /__name__\s*==\s*['"]__main__['"]/, score: 35 },
      { pattern: /\bself\.[a-zA-Z_]\w*/, score: 20 },
      { pattern: /^#!.*python/m, score: 50 },
    ],
    antiRules: [
      { pattern: /;\s*$/, score: 15 },
      { pattern: /[{}]/, score: 20 },
      { pattern: /\bfunction\b/, score: 30 },
      { pattern: /\bpublic\s+(class|void|static)\b/, score: 35 },
    ],
  },
  {
    id: "scss",
    rules: [
      { pattern: /^\s*\$[a-zA-Z_-][\w-]*\s*:\s*[^;]+;/m, score: 40 },
      { pattern: /@mixin\s+[\w-]+/, score: 40 },
      { pattern: /@include\s+[\w-]+/, score: 35 },
      { pattern: /@extend\s+[\w.-]+/, score: 30 },
    ],
  },
  {
    id: "css",
    rules: [
      { pattern: /[.#][a-zA-Z_-][\w-]*\s*\{[^}]*?\b(color|background|display|margin|padding|font-size|border|width|height|flex|grid):[^;]+;/, score: 35 },
      { pattern: /@media\s*\(.*?\)\s*\{/, score: 30 },
      { pattern: /@keyframes\s+[\w-]+\s*\{/, score: 30 },
    ],
    antiRules: [
      { pattern: /\$[a-zA-Z_-][\w-]*\s*:/, score: 25 },
      { pattern: /@mixin|@include/, score: 35 },
      { pattern: /^\s*def\s+/, score: 50 },
      { pattern: /\bprint\s*\(/, score: 50 },
      { pattern: /^\s*public\s+/, score: 50 },
    ],
  },
  {
    id: "typescript",
    rules: [
      { pattern: /^\s*interface\s+[A-Z]\w*(\s*<.*?>)?\s*\{/m, score: 40 },
      { pattern: /^\s*type\s+[A-Z]\w*(\s*<.*?>)?\s*=/m, score: 35 },
      { pattern: /:\s*(string|number|boolean|any|unknown|never|void|Record<.*?>|Array<.*?>)\b/, score: 25 },
      { pattern: /\bas\s+(const|[A-Z]\w*)\b/, score: 20 },
      { pattern: /<[A-Z]\w*>\s*\(/, score: 20 },
      { pattern: /:\s*React\.(FC|ReactNode|CSSProperties)\b/, score: 35 },
    ],
  },
  {
    id: "javascript",
    rules: [
      { pattern: /\bconsole\.(log|error|warn|info)\s*\(/, score: 25 },
      { pattern: /^\s*(const|let|var)\s+[a-zA-Z_$]\w*\s*=/m, score: 20 },
      { pattern: /^\s*function\s+[a-zA-Z_$]\w*\s*\(.*?\)\s*\{/m, score: 25 },
      { pattern: /^\s*export\s+(default\s+)?(function|class|const|let)\b/m, score: 25 },
      { pattern: /^\s*import\s+.*?\s+from\s+['"].*?['"]/m, score: 25 },
      { pattern: /=>\s*\{?/, score: 15 },
      { pattern: /\b(document|window)\./, score: 20 },
      { pattern: /^#!.*node/m, score: 50 },
    ],
  },
  {
    id: "html",
    rules: [
      { pattern: /<!DOCTYPE\s+html/i, score: 50 },
      { pattern: /<\/?(html|head|body|div|span|p|a|button|table|tr|td|ul|li|section|header|footer|nav|main|h[1-6])\b/i, score: 30 },
      { pattern: /<[a-z0-9-]+(\s+[a-z0-9-]+(=".*?")?)*\s*\/?>/i, score: 20 },
      { pattern: /class="[^"]*"/, score: 10 },
    ],
  },
  {
    id: "java",
    rules: [
      { pattern: /\bpublic\s+class\s+[A-Z]\w*/, score: 35 },
      { pattern: /\bpublic\s+static\s+void\s+main\s*\(\s*String/, score: 45 },
      { pattern: /\bSystem\.(out|err)\.println\s*\(/, score: 40 },
      { pattern: /^\s*import\s+java\.[a-z.]+;/m, score: 35 },
      { pattern: /@Override\b/, score: 25 },
    ],
    antiRules: [
      { pattern: /\busing\s+System;/, score: 50 },
      { pattern: /\bConsole\.WriteLine/, score: 50 },
    ],
  },
  {
    id: "csharp",
    rules: [
      { pattern: /^\s*using\s+System(\.[A-Za-z.]+)?;\s*$/m, score: 40 },
      { pattern: /\bConsole\.(WriteLine|Write)\s*\(/, score: 40 },
      { pattern: /^\s*namespace\s+[\w.]+(\s*\{|;)/m, score: 30 },
      { pattern: /\bpublic\s+async\s+Task(<.*?>)?\b/, score: 30 },
    ],
    antiRules: [
      { pattern: /\bimport\s+java\./, score: 50 },
      { pattern: /\bSystem\.out\./, score: 50 },
    ],
  },
  {
    id: "cpp",
    rules: [
      { pattern: /#\s*include\s*<[a-z_0-9.]+>/, score: 35 },
      { pattern: /\bstd::(cout|cin|endl|vector|string|map|unique_ptr|shared_ptr)\b/, score: 40 },
      { pattern: /\bcout\s*<</, score: 35 },
      { pattern: /\bcin\s*>>/, score: 35 },
      { pattern: /\bnullptr\b/, score: 20 },
      { pattern: /#\s*include\s*"[a-z_0-9.]+"/, score: 25 },
      { pattern: /\b(printf|scanf)\s*\(/, score: 30 },
    ],
  },
  {
    id: "go",
    rules: [
      { pattern: /^\s*package\s+[a-z_0-9]+/m, score: 40 },
      { pattern: /^\s*func\s+(\(\s*\w+\s+\*?\w+\s*\)\s*)?[a-zA-Z_]\w*\s*\(.*?\)/m, score: 35 },
      { pattern: /\bfmt\.(Println|Printf|Print|Sprintf)\s*\(/, score: 40 },
      { pattern: /:=/, score: 15 },
      { pattern: /^\s*import\s+(\(\s*".*?"\s*\)|".*?")/m, score: 30 },
    ],
  },
  {
    id: "rust",
    rules: [
      { pattern: /^\s*fn\s+[a-zA-Z_]\w*\s*\(.*?\)/m, score: 35 },
      { pattern: /\bprintln!\s*\(/, score: 40 },
      { pattern: /^\s*let\s+(mut\s+)?[a-zA-Z_]\w*/m, score: 20 },
      { pattern: /^\s*pub\s+(fn|struct|enum|mod|trait)\b/m, score: 30 },
      { pattern: /^\s*impl(\s+.*?\s+for)?\s+[A-Z]\w*/m, score: 30 },
      { pattern: /^\s*use\s+std::/m, score: 30 },
    ],
  },
  {
    id: "php",
    rules: [
      { pattern: /<\?php/, score: 50 },
      { pattern: /\$[a-zA-Z_]\w*\s*=/, score: 20 },
      { pattern: /\becho\s+['"]/, score: 25 },
    ],
  },
  {
    id: "ruby",
    rules: [
      { pattern: /^\s*def\s+[a-zA-Z_]\w*(\s*\(.*?\))?\s*$/m, score: 30 },
      { pattern: /\bputs\s+["']/, score: 25 },
      { pattern: /\brequire\s+["']/, score: 25 },
      { pattern: /\battr_(accessor|reader|writer)\b/, score: 30 },
    ],
  },
  {
    id: "sql",
    rules: [
      { pattern: /\b(SELECT\s+.*?\s+FROM|INSERT\s+INTO\s+\w+|UPDATE\s+\w+\s+SET|DELETE\s+FROM\s+\w+)\b/i, score: 40 },
      { pattern: /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|VIEW|DATABASE)\b/i, score: 40 },
      { pattern: /\b(WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|INNER\s+JOIN|LEFT\s+JOIN)\b/i, score: 20 },
    ],
  },
  {
    id: "dockerfile",
    rules: [
      { pattern: /^\s*FROM\s+\S+/m, score: 40 },
      { pattern: /^\s*(WORKDIR|COPY|RUN|CMD|EXPOSE|ENV|ENTRYPOINT)\b/m, score: 25 },
    ],
  },
  {
    id: "bash",
    rules: [
      { pattern: /^#!\s*\/bin\/(ba)?sh/m, score: 50 },
      { pattern: /^\s*(npm|pnpm|yarn|bun)\s+(run|install|build|dev|start|test)\b/m, score: 35 },
      { pattern: /^\s*git\s+(commit|checkout|branch|push|pull|status|add|merge|rebase)\b/m, score: 35 },
      { pattern: /^\s*(cd|mkdir|rm\s+-rf|chmod|chown|curl|wget)\s+/m, score: 25 },
    ],
  },
  {
    id: "markdown",
    rules: [
      { pattern: /^#{1,6}\s+\S+/m, score: 25 },
      { pattern: /^\s*[-*+]\s+\[[ x]\]\s+/m, score: 35 },
      { pattern: /\[.*?\]\(https?:\/\/.*?\)/, score: 25 },
      { pattern: /```[a-z]*\n[\s\S]*?```/, score: 35 },
    ],
  },
  {
    id: "powershell",
    rules: [
      { pattern: /^\s*(\$|[A-Za-z]+-[A-Za-z]+)\b/m, score: 20 },
      { pattern: /\b(Get|Set|New|Write)-[A-Z]\w*/, score: 35 },
      { pattern: /\bWrite-Host\b/, score: 40 },
    ],
  },
  {
    id: "graphql",
    rules: [
      { pattern: /^\s*(query|mutation|subscription)\s+[a-zA-Z_]\w*\s*(\(.*?\))?\s*\{/m, score: 40 },
    ],
  },
  {
    id: "latex",
    rules: [
      { pattern: /\\(begin|end|documentclass|usepackage)\{/, score: 40 },
    ],
  },
];

function scoreLanguage(code: string): { language: string; score: number } | null {
  const sample = code.trim();
  if (sample.length < 5) return null;

  if (/^\s*(\{|\[)/.test(sample)) {
    try {
      JSON.parse(sample);
      return { language: "json", score: 50 };
    } catch {}
  }

  let bestLang: string | null = null;
  let bestScore = 0;

  for (const def of LANGUAGE_RULES) {
    let score = 0;
    for (const rule of def.rules) {
      if (rule.pattern.test(sample)) {
        score += rule.score;
      }
    }
    for (const anti of def.antiRules ?? []) {
      if (anti.pattern.test(sample)) {
        score -= anti.score;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = def.id;
    }
  }

  if (bestLang && bestScore >= 20) {
    return { language: bestLang, score: bestScore };
  }

  return null;
}

export function detectCodeLanguage(code: string): { language: string; confidence: number } {
  const sample = code.trim();
  if (sample.length < 5) return { language: "plaintext", confidence: 0 };

  const scored = scoreLanguage(sample);
  if (scored && scored.score >= 20) {
    return { language: normalizeLanguage(scored.language), confidence: scored.score };
  }

  try {
    const result = editorLowlight.highlightAuto(sample);
    const data = result.data as { language?: string; relevance?: number } | undefined;
    const auto = data?.language ? normalizeLanguage(data.language) : "plaintext";
    const relevance = data?.relevance ?? 0;

    if (auto === "scss" || auto === "css") {
      if (!/[{}]/.test(sample) || !/:[^;]+;/.test(sample)) {
        return { language: scored ? normalizeLanguage(scored.language) : "plaintext", confidence: scored?.score ?? 0 };
      }
    }
    if (auto === "diff" && !/^[\s]*[+-]/m.test(sample)) {
      return { language: scored ? normalizeLanguage(scored.language) : "plaintext", confidence: scored?.score ?? 0 };
    }

    if (relevance >= 6 && auto !== "plaintext") {
      return { language: auto, confidence: relevance };
    }
    if (scored) return { language: normalizeLanguage(scored.language), confidence: scored.score };
    return { language: "plaintext", confidence: relevance };
  } catch {
    return { language: scored ? normalizeLanguage(scored.language) : "plaintext", confidence: scored?.score ?? 0 };
  }
}
