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

function heuristicLanguage(code: string): string | null {
  const head = code.slice(0, 4000);
  if (/^#!/.test(head)) {
    if (/python/.test(head)) return "python";
    if (/node/.test(head)) return "javascript";
    if (/\b(bash|sh|zsh)\b/.test(head)) return "bash";
  }
  if (/^<!DOCTYPE html|<html[\s>]|<\/(html|body|div|span|section)>/i.test(head)) return "xml";
  if (/^\s*FROM\s+\S+/m.test(head) && /^(WORKDIR|COPY|RUN|CMD|EXPOSE)\b/m.test(head)) {
    return "dockerfile";
  }
  if (/^\s*(\$|[A-Za-z]+-[A-Za-z]+)\b/.test(head) && /\b(Get|Set|New|Write)-[A-Z]/.test(head)) {
    return "powershell";
  }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/i.test(head)) return "sql";
  if (/^\s*(\{|\[)/.test(head)) {
    try {
      JSON.parse(head);
      return "json";
    } catch {}
  }
  if (/^\s*(query|mutation|subscription|type|interface)\s+\w+/m.test(head) && /\{/.test(head)) {
    return "graphql";
  }
  if (/\\(begin|end|documentclass|usepackage)\{/.test(head)) return "latex";
  return null;
}

export function detectCodeLanguage(code: string): { language: string; confidence: number } {
  const sample = code.trim();
  if (sample.length < 8) return { language: "plaintext", confidence: 0 };

  const hinted = heuristicLanguage(sample);
  try {
    const result = editorLowlight.highlightAuto(sample);
    const data = result.data as { language?: string; relevance?: number } | undefined;
    const auto = data?.language ? normalizeLanguage(data.language) : "plaintext";
    const relevance = data?.relevance ?? 0;
    if (hinted && (relevance < 6 || auto === "plaintext")) {
      return { language: hinted, confidence: Math.max(relevance, 8) };
    }
    if (relevance >= 3 && auto !== "plaintext") {
      return { language: auto, confidence: relevance };
    }
    if (hinted) return { language: hinted, confidence: 5 };
    return { language: "plaintext", confidence: relevance };
  } catch {
    return { language: hinted ?? "plaintext", confidence: hinted ? 5 : 0 };
  }
}
