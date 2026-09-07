import { common, createLowlight } from "lowlight";
import dart from "highlight.js/lib/languages/dart";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import elixir from "highlight.js/lib/languages/elixir";
import haskell from "highlight.js/lib/languages/haskell";
import http from "highlight.js/lib/languages/http";
import latex from "highlight.js/lib/languages/latex";
import nginx from "highlight.js/lib/languages/nginx";
import powershell from "highlight.js/lib/languages/powershell";
import scala from "highlight.js/lib/languages/scala";

export const editorLowlight = createLowlight(common);

editorLowlight.register({
  dart,
  dockerfile,
  elixir,
  haskell,
  http,
  latex,
  nginx,
  powershell,
  scala,
});

editorLowlight.registerAlias({
  xml: ["html", "svg", "xhtml"],
  javascript: ["js", "jsx", "node"],
  typescript: ["ts", "tsx"],
  python: ["py"],
  shell: ["bash", "sh", "zsh"],
  yaml: ["yml"],
  markdown: ["md"],
  csharp: ["cs"],
  cpp: ["c++", "cxx"],
});
