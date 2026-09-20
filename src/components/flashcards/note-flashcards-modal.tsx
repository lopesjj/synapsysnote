"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Mic,
  Paperclip,
  Play,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Flashcard, Page, SupportedLanguage } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { extractComprehensiveNoteContent } from "@/lib/flashcards/extract-note-content";
import { transcribeAudioSource } from "@/lib/accessibility/audio-transcriber";
import { FlashcardStudySession } from "./flashcard-study-session";

interface NoteFlashcardsModalProps {
  page: Page;
  onClose: () => void;
}

type TabMode = "list" | "create" | "ai";

export function NoteFlashcardsModal({ page, onClose }: NoteFlashcardsModalProps) {
  const { adapter, flashcards } = useWorkspace();
  const { t, language } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabMode>("list");
  const [studying, setStudying] = useState(false);

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [creating, setCreating] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiFocus, setAiFocus] = useState("");
  const [aiCount, setAiCount] = useState<number | "max">(10);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("synapsys_flashcards_target_language") as SupportedLanguage | null;
      if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
        return saved;
      }
    }
    return language;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("synapsys_flashcards_target_language");
      if (!saved) {
        setTargetLanguage(language);
      }
    }
  }, [language]);

  const handleSelectTargetLanguage = (lang: SupportedLanguage) => {
    setTargetLanguage(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("synapsys_flashcards_target_language", lang);
    }
  };

  const [generatedCards, setGeneratedCards] = useState<
    { front: string; back: string; hint?: string; selected: boolean }[]
  >([]);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [detectedSummary, setDetectedSummary] = useState<{
    words: number;
    images: number;
    media: number;
    pdfs: number;
  } | null>(null);

  const noteCards = flashcards.filter((c) => c.pageId === page.id);

  useEffect(() => {
    let cancelled = false;
    async function scan() {
      try {
        const summary = await extractComprehensiveNoteContent(page);
        if (cancelled) return;
        const words = summary.textContent.trim().split(/\s+/).filter(Boolean).length;
        setDetectedSummary({
          words,
          images: summary.detectedImagesCount,
          media: summary.detectedMediaCount,
          pdfs: summary.detectedPdfsCount,
        });
      } catch {}
    }
    void scan();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreateManual = async () => {
    if (!front.trim() || !back.trim()) return;
    setCreating(true);
    try {
      let imageUrl: string | null = null;
      let imageStoragePath: string | null = null;

      const cardId = `fc_${Date.now()}`;

      if (imageFile) {
        const uploaded = await adapter.uploadFlashcardImage(page.id, cardId, imageFile);
        imageUrl = uploaded.url;
        imageStoragePath = uploaded.storagePath ?? null;
      }

      await adapter.createFlashcard({
        pageId: page.id,
        notebookId: page.notebookId,
        pageTitle: page.title || t("untitled"),
        front: front.trim(),
        back: back.trim(),
        hint: hint.trim() || undefined,
        imageUrl,
        imageStoragePath,
      });

      toast.success(t("card_saved"));
      setFront("");
      setBack("");
      setHint("");
      setImageFile(null);
      setImagePreview(null);
      setPreviewFlipped(false);
      setActiveTab("list");
    } catch {
      toast.error(t("saving_indicator_hint"));
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateAi = async () => {
    setAiLoading(true);
    setGenerationProgress(10);
    setGenerationStatus(t("ai_progress_reading_content"));
    let progressTimer: NodeJS.Timeout | null = null;
    try {
      const comprehensive = await extractComprehensiveNoteContent(page);

      if (comprehensive.pendingAudios?.length) {
        setGenerationProgress(30);
        setGenerationStatus(t("ai_progress_transcribing"));
        for (const pending of comprehensive.pendingAudios) {
          try {
            const transcriptText = await transcribeAudioSource(
              pending.url,
              null,
              undefined,
              language || "pt"
            );
            if (transcriptText?.trim()) {
              comprehensive.audioTranscripts.push(transcriptText.trim());
            }
          } catch {}
        }
      }

      setGenerationProgress(52);
      setGenerationStatus(t("ai_progress_synthesizing"));

      progressTimer = setInterval(() => {
        setGenerationProgress((prev) => (prev < 90 ? prev + (90 - prev) * 0.12 : prev));
      }, 400);

      const res = await fetch("/api/ai/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: page.title || t("untitled"),
          textContent: comprehensive.textContent,
          tablesContent: comprehensive.tablesContent,
          audioTranscripts: comprehensive.audioTranscripts,
          videoTranscripts: comprehensive.videoTranscripts,
          pdfTexts: comprehensive.pdfTexts,
          pdfDocuments: comprehensive.pdfDocuments,
          images: comprehensive.images,
          targetLanguage,
          count: aiCount,
          focus: aiFocus,
        }),
      });

      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      setGenerationProgress(95);
      setGenerationStatus(t("ai_progress_finalizing"));

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || t("ai_generation_error"));
      }

      const data = await res.json();
      const list = Array.isArray(data.flashcards)
        ? data.flashcards.map((c: any) => ({ ...c, selected: true }))
        : [];

      setGenerationProgress(100);

      if (list.length === 0) {
        toast.error(t("no_flashcards"));
      } else {
        setGeneratedCards(list);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ai_generation_error"));
    } finally {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      setAiLoading(false);
    }
  };

  const handleSaveGenerated = async () => {
    const selected = generatedCards.filter((c) => c.selected);
    if (selected.length === 0) return;
    setSavingGenerated(true);
    try {
      for (const card of selected) {
        await adapter.createFlashcard({
          pageId: page.id,
          notebookId: page.notebookId,
          pageTitle: page.title || t("untitled"),
          front: card.front,
          back: card.back,
          hint: card.hint,
        });
      }
      toast.success(`${selected.length} ${t("card_saved")}`);
      setGeneratedCards([]);
      setActiveTab("list");
    } catch {
      toast.error(t("saving_indicator_hint"));
    } finally {
      setSavingGenerated(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm(t("confirm_delete_card"))) return;
    try {
      await adapter.deleteFlashcard(cardId);
      toast.success(t("card_deleted"));
    } catch {
      toast.error(t("saving_indicator_hint"));
    }
  };

  if (studying && noteCards.length > 0) {
    return (
      <FlashcardStudySession
        cards={noteCards}
        onReview={async (cardId, rating) => {
          await adapter.reviewFlashcard(cardId, rating);
        }}
        onClose={() => setStudying(false)}
        title={page.title || t("untitled")}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-2 sm:p-4 overflow-y-auto select-none">
      <div className="relative w-full max-w-3xl min-h-[520px] max-h-[92vh] rounded-3xl border border-[var(--border)] bg-[var(--canvas)] p-4 sm:p-7 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.5)] flex flex-col justify-between overflow-hidden my-auto pb-safe">
        <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-sky-600 text-white shadow-xs">
              <GraduationCap className="size-5 sm:size-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base sm:text-lg font-extrabold text-ink tracking-tight">
                {t("note_flashcards")}
              </h2>
              <div className="flex items-center gap-2 truncate text-xs text-muted">
                <span className="truncate font-semibold">{page.title || t("untitled")}</span>
                <span>•</span>
                <span className="font-mono font-bold text-[var(--accent)]">
                  {noteCards.length} {t("cards_count_badge")}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-2xl hover:bg-[var(--surface-hover)] text-muted hover:text-ink transition active:scale-95 border border-transparent hover:border-[var(--border)] cursor-pointer"
            aria-label={t("close")}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--surface-2)] rounded-2xl border border-[var(--border)]/70 my-3.5">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer ${
              activeTab === "list"
                ? "bg-[var(--surface)] text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <BookOpen className="size-3.5 shrink-0" />
            <span className="truncate">
              {t("flashcards")} ({noteCards.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer ${
              activeTab === "create"
                ? "bg-[var(--surface)] text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">{t("create_manually")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer ${
              activeTab === "ai"
                ? "bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <Sparkles className="size-3.5 shrink-0 text-[var(--accent)]" />
            <span className="truncate">{t("generate_ai")}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-1 py-1 space-y-4">
          {activeTab === "list" ? (
            <div className="space-y-3">
              {noteCards.length > 0 ? (
                <div className="flex items-center justify-between gap-2 mb-1 px-1">
                  <span className="text-xs font-bold text-muted uppercase tracking-wider">
                    {noteCards.length} {t("cards_count_badge")}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-2 shadow-md font-bold bg-gradient-to-r from-[var(--accent)] to-sky-600 hover:brightness-105 rounded-2xl h-9 px-4 text-xs cursor-pointer active:scale-95 transition"
                    onClick={() => setStudying(true)}
                  >
                    <Play className="size-3.5 fill-current" />
                    <span>{t("study_this_note")}</span>
                  </Button>
                </div>
              ) : null}

              {noteCards.length === 0 ? (
                <div className="py-14 text-center flex flex-col items-center">
                  <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--accent)]/15 to-sky-500/10 text-[var(--accent)] mb-4 border border-[var(--accent)]/20 shadow-xs">
                    <GraduationCap className="size-8" />
                  </div>
                  <p className="font-extrabold text-ink text-base mb-1 tracking-tight">
                    {t("no_flashcards")}
                  </p>
                  <p className="text-xs text-muted max-w-sm mb-6 leading-relaxed">
                    {t("no_flashcards_desc")}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-2xl h-10 px-4 font-bold border border-[var(--border)] cursor-pointer"
                      onClick={() => setActiveTab("create")}
                    >
                      <Plus className="size-3.5 mr-1" />
                      <span>{t("create_manually")}</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="rounded-2xl h-10 px-4 gap-2 font-bold shadow-xs bg-gradient-to-r from-[var(--accent)] to-sky-600 cursor-pointer"
                      onClick={() => setActiveTab("ai")}
                    >
                      <Sparkles className="size-3.5" />
                      <span>{t("generate_ai")}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {noteCards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-xs flex flex-col justify-between gap-3 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-mono font-black bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                              Q
                            </span>
                            <p className="text-xs sm:text-sm font-bold text-ink leading-relaxed">
                              {card.front}
                            </p>
                          </div>

                          <div className="flex items-start gap-2.5 pt-0.5">
                            <span className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-mono font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              A
                            </span>
                            <p className="text-xs sm:text-sm text-muted leading-relaxed">
                              {card.back}
                            </p>
                          </div>

                          {card.hint ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold pt-1">
                              <Lightbulb className="size-3 text-amber-500" />
                              <span>{card.hint}</span>
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {card.imageUrl ? (
                            <img
                              src={card.imageUrl}
                              alt="Media"
                              className="size-14 rounded-2xl object-cover border border-[var(--border)] shadow-xs"
                            />
                          ) : null}
                          <button
                            onClick={() => void handleDeleteCard(card.id)}
                            className="flex size-8.5 items-center justify-center rounded-xl text-faint hover:text-red-500 hover:bg-red-500/10 transition active:scale-95 cursor-pointer"
                            aria-label={t("trash")}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "create" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider">
                    {t("card_front")} *
                  </label>
                  <textarea
                    value={front}
                    onChange={(e) => setFront(e.target.value)}
                    placeholder={t("card_front_placeholder")}
                    rows={3}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-ink outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 resize-none transition shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider">
                    {t("card_back")} *
                  </label>
                  <textarea
                    value={back}
                    onChange={(e) => setBack(e.target.value)}
                    placeholder={t("card_back_placeholder")}
                    rows={3}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-ink outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 resize-none transition shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">
                    {t("card_hint")}
                  </label>
                  <Input
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder={t("card_hint_placeholder")}
                    className="h-10 text-sm rounded-2xl border-[var(--border)] bg-[var(--surface)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">
                    {t("add_image")}
                  </label>
                  {imagePreview ? (
                    <div className="relative inline-block border border-[var(--border)] rounded-2xl overflow-hidden shadow-xs">
                      <img src={imagePreview} alt="Preview" className="h-24 w-auto object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                        className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black/90 transition cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] cursor-pointer text-xs text-muted transition w-fit shadow-2xs font-semibold">
                      <Upload className="size-4 text-[var(--accent)]" />
                      <span>{t("upload_image")}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageSelect(file);
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    onClick={() => void handleCreateManual()}
                    disabled={creating || !front.trim() || !back.trim()}
                    className="w-full h-11 text-xs sm:text-sm font-extrabold rounded-2xl gap-2 shadow-md bg-gradient-to-r from-[var(--accent)] to-sky-600 cursor-pointer"
                  >
                    {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    <span>{t("save_card")}</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-muted uppercase tracking-wider">
                    {t("card_preview")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewFlipped((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] font-bold hover:underline cursor-pointer"
                  >
                    <RotateCw className="size-3" />
                    <span>{t("flip_card")}</span>
                  </button>
                </div>

                <div
                  onClick={() => setPreviewFlipped((prev) => !prev)}
                  className="rounded-3xl border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] p-6 min-h-[220px] flex flex-col justify-between shadow-xs transition hover:border-[var(--border-strong)] cursor-pointer group select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-[var(--accent)]/15 text-[var(--accent)]">
                      {previewFlipped ? t("card_back") : t("card_front")}
                    </span>
                    <span className="text-[11px] text-faint flex items-center gap-1 group-hover:text-[var(--accent)] transition">
                      <RotateCw className="size-3" />
                      <span>{t("flip_card")}</span>
                    </span>
                  </div>

                  <div className="my-auto py-2 text-center">
                    <p className="text-base font-semibold text-ink leading-relaxed">
                      {previewFlipped
                        ? back || t("card_preview_answer")
                        : front || t("card_preview_question")}
                    </p>
                    {hint && !previewFlipped ? (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <Lightbulb className="size-3" />
                        <span>{hint}</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px] text-faint text-center pt-2 border-t border-[var(--border)]/40">
                    {page.title || t("untitled")}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "ai" ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)]/60 p-5 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-purple-600 text-white shadow-xs">
                    <Sparkles className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-ink">
                      {t("ai_generation_title")}
                    </h3>
                    <p className="text-xs text-muted">
                      {t("ai_generation_desc")}
                    </p>
                  </div>
                </div>

                {detectedSummary ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--canvas)] p-3 border border-[var(--border)] shadow-2xs">
                      <FileText className="size-4 text-[var(--accent)] shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-sm font-black text-ink font-mono">
                          {detectedSummary.words}
                        </span>
                        <span className="block text-[11px] text-faint truncate">
                          {t("ai_words_count")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--canvas)] p-3 border border-[var(--border)] shadow-2xs">
                      <ImageIcon className="size-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-sm font-black text-ink font-mono">
                          {detectedSummary.images}
                        </span>
                        <span className="block text-[11px] text-faint truncate">
                          {t("ai_images_count")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--canvas)] p-3 border border-[var(--border)] shadow-2xs">
                      <Mic className="size-4 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-sm font-black text-ink font-mono">
                          {detectedSummary.media}
                        </span>
                        <span className="block text-[11px] text-faint truncate">
                          {t("ai_audio_video_count")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--canvas)] p-3 border border-[var(--border)] shadow-2xs">
                      <Paperclip className="size-4 text-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-sm font-black text-ink font-mono">
                          {detectedSummary.pdfs}
                        </span>
                        <span className="block text-[11px] text-faint truncate">
                          {t("ai_pdf_count")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {generatedCards.length === 0 ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider">
                      {t("ai_cards_quantity")}
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {([5, 10, 15, 20, "max"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAiCount(opt)}
                          className={`py-2.5 text-xs font-black rounded-2xl border transition-all cursor-pointer ${
                            aiCount === opt
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-xs"
                              : "border-[var(--border)] bg-[var(--surface)] text-muted hover:text-ink hover:border-[var(--border-strong)]"
                          }`}
                        >
                          {opt === "max" ? t("ai_card_quantity_max") : opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="size-3.5 text-[var(--accent)]" />
                      <span>{t("ai_target_language")}</span>
                    </label>
                    <div className="relative">
                      <select
                        value={targetLanguage}
                        onChange={(e) => handleSelectTargetLanguage(e.target.value as SupportedLanguage)}
                        className="w-full h-11 px-3.5 pr-9 text-sm font-semibold rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-ink appearance-none cursor-pointer transition focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 shadow-2xs"
                      >
                        {SUPPORTED_LANGUAGES.map((langDef) => (
                          <option key={langDef.code} value={langDef.code} className="bg-[var(--surface)] text-ink">
                            {langDef.flag} {langDef.nativeName} ({langDef.name})
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted">
                        <ChevronDown className="size-4" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1.5">
                      {t("ai_focus_optional")}
                    </label>
                    <Input
                      value={aiFocus}
                      onChange={(e) => setAiFocus(e.target.value)}
                      placeholder={t("ai_focus_placeholder")}
                      className="h-11 text-sm rounded-2xl border-[var(--border)] bg-[var(--surface)]"
                    />
                  </div>

                  {aiLoading ? (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)]/30 p-3.5 space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-ink font-semibold min-w-0">
                          <Loader2 className="size-3.5 animate-spin text-[var(--accent)] shrink-0" />
                          <span className="truncate">{generationStatus || t("generating_cards")}</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-[var(--accent)] tabular-nums shrink-0 ml-2">
                          {Math.round(generationProgress)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--canvas)] border border-[var(--border)]/70">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--accent)] via-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                          style={{ width: `${Math.max(5, Math.min(100, generationProgress))}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <Button
                    variant="primary"
                    className="w-full h-12 text-sm font-extrabold shadow-md bg-gradient-to-r from-[var(--accent)] via-indigo-600 to-purple-600 hover:brightness-105 gap-2 rounded-2xl transition cursor-pointer"
                    onClick={() => void handleGenerateAi()}
                    disabled={aiLoading}
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>{t("generating_cards")}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        <span>{t("generate_cards_button")}</span>
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-extrabold text-ink uppercase tracking-wider">
                      {t("generated_cards_preview")} ({generatedCards.filter((c) => c.selected).length}/{generatedCards.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGeneratedCards([])}
                      className="text-xs h-8 px-3 rounded-xl text-muted hover:text-ink font-bold cursor-pointer"
                    >
                      {t("clear")}
                    </Button>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {generatedCards.map((card, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setGeneratedCards((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c))
                          );
                        }}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex items-start gap-3.5 select-none ${
                          card.selected
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs"
                            : "border-[var(--border)] bg-[var(--surface)] opacity-60 hover:opacity-90"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={card.selected}
                          readOnly
                          className="mt-1 size-4.5 rounded accent-[var(--accent)] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-xs sm:text-sm font-bold text-ink leading-snug">
                            Q: {card.front}
                          </p>
                          <p className="text-xs sm:text-sm text-muted leading-snug">
                            R: {card.back}
                          </p>
                          {card.hint ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] font-semibold">
                              <Lightbulb className="size-3 text-[var(--accent)]" />
                              <span>{card.hint}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="primary"
                    className="w-full font-extrabold gap-2 h-12 rounded-2xl shadow-md bg-gradient-to-r from-[var(--accent)] to-sky-600 cursor-pointer"
                    onClick={() => void handleSaveGenerated()}
                    disabled={savingGenerated || generatedCards.filter((c) => c.selected).length === 0}
                  >
                    {savingGenerated ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    <span>
                      {t("add_selected_cards")} ({generatedCards.filter((c) => c.selected).length})
                    </span>
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
