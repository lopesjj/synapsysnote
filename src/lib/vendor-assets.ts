export const PDF_WORKER_PATH = "/vendor/pdfjs/pdf.worker.min.mjs";
export const KATEX_CSS_PATH = "/vendor/katex/katex.min.css";

export function vendorUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
