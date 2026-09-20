"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Table2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Flashcard, Page, SupportedLanguage } from "@/types/models";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Input, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/data/provider";
import { useTranslation } from "@/lib/i18n/translations";
import { SUPPORTED_LANGUAGES, getLanguageDefinition } from "@/lib/i18n/languages";
import { extractComprehensiveNoteContent } from "@/lib/flashcards/extract-note-content";
import {
  cardImage,
  cardImagePatch,
  type CardSide,
} from "@/lib/flashcards/card-images";
import { transcribeAudioSource } from "@/lib/accessibility/audio-transcriber";
import { prepareEditorAttachment } from "@/lib/media/compress-attachment";
import { useFlashcardSettings } from "@/lib/flashcards/use-flashcard-settings";
import {
  FlashcardsIcon,
  HintIcon,
  RevealIcon,
  SparkIcon,
  StudyIcon,
} from "@/lib/icons/flashcard-icon";
import { FlashcardStudySession } from "./flashcard-study-session";

interface NoteFlashcardsModalProps {
  page: Page;
  onClose: () => void;
}

type TabMode = "list" | "editor" | "ai";

interface GeneratedCard {
  front: string;
  back: string;
  hint?: string;
  selected: boolean;
}

interface DetectedSummary {
  words: number;
  tables: number;
  images: number;
  media: number;
  pdfs: number;
}

const TARGET_LANGUAGE_KEY = "synapsys_flashcards_target_language";
const QUANTITY_OPTIONS = [5, 10, 15, 20, "max"] as const;

function readTargetLanguage(fallback: SupportedLanguage): SupportedLanguage {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(TARGET_LANGUAGE_KEY) as SupportedLanguage | null;
    if (saved && SUPPORTED_LANGUAGES.some((item) => item.code === saved)) return saved;
  } catch {}
  return fallback;
}

export function NoteFlashcardsModal({ page, onClose }: NoteFlashcardsModalProps) {
  const { adapter, flashcards } = useWorkspace();
  const { t, language } = useTranslation();
  const { settings } = useFlashcardSettings();

  const [tab, setTab] = useState<TabMode>("list");
  const [studying, setStudying] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");
  const [imageFiles, setImageFiles] = useState<Record<CardSide, File | null>>({
    front: null,
    back: null,
  });
  const [imagePreviews, setImagePreviews] = useState<Record<CardSide, string | null>>({
    front: null,
    back: null,
  });
  const [imagePreparing, setImagePreparing] = useState<Record<CardSide, boolean>>({
    front: false,
    back: false,
  });
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiFocus, setAiFocus] = useState("");
  const [aiCount, setAiCount] = useState<number | "max">(10);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(() =>
    readTargetLanguage(language)
  );
  const [generated, setGenerated] = useState<GeneratedCard[]>([]);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [detected, setDetected] = useState<DetectedSummary | null>(null);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const noteCards = useMemo(
    () => flashcards.filter((c) => c.pageId === page.id),
    [flashcards, page.id]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await extractComprehensiveNoteContent(page, {
          includeAttachments: false,
        });
        if (cancelled) return;
        setDetected({
          words: summary.textContent.trim().split(/\s+/).filter(Boolean).length,
          tables: summary.detectedTablesCount,
          images: summary.detectedImagesCount,
          media: summary.detectedMediaCount,
          pdfs: summary.detectedPdfsCount,
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(
    () => () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    },
    []
  );

  const selectTargetLanguage = (lang: SupportedLanguage) => {
    setTargetLanguage(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TARGET_LANGUAGE_KEY, lang);
    }
  };

  const toggleRevealed = (cardId: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const allRevealed = noteCards.length > 0 && noteCards.every((c) => revealed.has(c.id));

  const resetEditor = () => {
    setEditingId(null);
    setFront("");
    setBack("");
    setHint("");
    setImageFiles({ front: null, back: null });
    setImagePreviews({ front: null, back: null });
    setImagePreparing({ front: false, back: false });
    setPreviewFlipped(false);
  };

  const startEdit = (card: Flashcard) => {
    setEditingId(card.id);
    setFront(card.front);
    setBack(card.back);
    setHint(card.hint ?? "");
    setImageFiles({ front: null, back: null });
    setImagePreparing({ front: false, back: false });
    setImagePreviews({
      front: cardImage(card, "front").url,
      back: cardImage(card, "back").url,
    });
    setPreviewFlipped(false);
    setTab("editor");
  };

  const handleImageSelect = async (side: CardSide, file: File) => {
    setImagePreparing((prev) => ({ ...prev, [side]: true }));
    try {
      // Comprime ja na escolha, e nao no envio: a previa passa a mostrar
      // exatamente o arquivo que sera gravado, e o trabalho pesado acontece
      // enquanto o usuario ainda esta escrevendo.
      const prepared = await prepareEditorAttachment(file);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(prepared);
      });
      setImageFiles((prev) => ({ ...prev, [side]: prepared }));
      setImagePreviews((prev) => ({ ...prev, [side]: dataUrl }));
    } catch {
      toast.error(t("image_upload_failed"));
    } finally {
      setImagePreparing((prev) => ({ ...prev, [side]: false }));
    }
  };

  // Uma face vale por texto OU por imagem: um card so de imagens e valido.
  const sideHasImage = (side: CardSide) =>
    Boolean(imageFiles[side] || imagePreviews[side]);
  const preparingImage = imagePreparing.front || imagePreparing.back;
  const canSave =
    !preparingImage &&
    (front.trim().length > 0 || sideHasImage("front")) &&
    (back.trim().length > 0 || sideHasImage("back"));

  const clearImage = (side: CardSide) => {
    setImageFiles((prev) => ({ ...prev, [side]: null }));
    setImagePreviews((prev) => ({ ...prev, [side]: null }));
    setImagePreparing((prev) => ({ ...prev, [side]: false }));
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);

    const sides: CardSide[] = ["front", "back"];
    // Tudo que subiu neste envio, para poder limpar caso a gravacao falhe.
    const uploaded: string[] = [];

    try {
      if (editingId) {
        const current = noteCards.find((c) => c.id === editingId);
        const patch: Partial<Flashcard> = {
          front: front.trim(),
          back: back.trim(),
          hint: hint.trim() || undefined,
        };
        const obsolete: string[] = [];

        for (const side of sides) {
          const file = imageFiles[side];
          const preview = imagePreviews[side];
          const previous = current ? cardImage(current, side) : { url: null, storagePath: null };

          if (file) {
            const up = await adapter.uploadFlashcardImage(page.id, editingId, file);
            if (up.storagePath) uploaded.push(up.storagePath);
            Object.assign(patch, cardImagePatch(side, {
              url: up.url,
              storagePath: up.storagePath ?? null,
            }));
            if (previous.storagePath) obsolete.push(previous.storagePath);
          } else if (!preview && previous.url) {
            Object.assign(patch, cardImagePatch(side, { url: null, storagePath: null }));
            if (previous.storagePath) obsolete.push(previous.storagePath);
          }
        }

        await adapter.updateFlashcard(editingId, patch);

        // So depois da gravacao confirmada: se falhasse antes, o card ficaria
        // apontando para um arquivo ja apagado.
        const stillUsed = new Set(uploaded);
        const toRemove = obsolete.filter((path) => !stillUsed.has(path));
        if (toRemove.length > 0) await adapter.deleteMedia(toRemove).catch(() => {});

        toast.success(t("card_updated"));
      } else {
        const draftId = `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const patch: Partial<Flashcard> = {};

        for (const side of sides) {
          const file = imageFiles[side];
          if (!file) continue;
          const up = await adapter.uploadFlashcardImage(page.id, draftId, file);
          if (up.storagePath) uploaded.push(up.storagePath);
          Object.assign(patch, cardImagePatch(side, {
            url: up.url,
            storagePath: up.storagePath ?? null,
          }));
        }

        await adapter.createFlashcard({
          pageId: page.id,
          notebookId: page.notebookId,
          pageTitle: page.title || t("untitled"),
          front: front.trim(),
          back: back.trim(),
          hint: hint.trim() || undefined,
          frontImageUrl: patch.frontImageUrl ?? null,
          frontImageStoragePath: patch.frontImageStoragePath ?? null,
          backImageUrl: patch.backImageUrl ?? null,
          backImageStoragePath: patch.backImageStoragePath ?? null,
        });
        toast.success(t("card_saved"));
      }

      resetEditor();
      setTab("list");
    } catch {
      // A gravacao falhou: o que ja subiu nao pertence a card nenhum.
      if (uploaded.length > 0) await adapter.deleteMedia(uploaded).catch(() => {});
      toast.error(t("saving_indicator_hint"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cardId: string) => {
    try {
      // A limpeza das imagens fica no adapter, que le o documento antes de
      // apaga-lo: e o unico ponto que enxerga o card em qualquer origem.
      await adapter.deleteFlashcard(cardId);
      toast.success(t("card_deleted"));
      if (editingId === cardId) resetEditor();
    } catch {
      toast.error(t("saving_indicator_hint"));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      // Uma chamada so: o adapter apaga os documentos em lote e junta as
      // imagens de todos os cards numa unica limpeza de storage.
      const removed = await adapter.deleteFlashcardsByPage(page.id);
      toast.success(t("cards_deleted_count", { count: removed }));
      setConfirmDeleteAll(false);
      resetEditor();
    } catch {
      toast.error(t("saving_indicator_hint"));
    } finally {
      setDeletingAll(false);
    }
  };

  const handleGenerate = async () => {
    setAiLoading(true);
    setProgress(10);
    setProgressStatus(t("ai_progress_reading_content"));

    try {
      const comprehensive = await extractComprehensiveNoteContent(page);
      const pending = comprehensive.pendingMedia;

      if (pending.length > 0) {
        setProgressStatus(t("ai_progress_transcribing"));
        for (let index = 0; index < pending.length; index++) {
          const item = pending[index];
          const fallbackName = t(item.kind === "video" ? "media_video" : "media_audio");
          setProgress(18 + Math.round((index / pending.length) * 30));
          setProgressStatus(
            t("ai_progress_transcribing_item", {
              current: index + 1,
              total: pending.length,
              name: item.name || fallbackName,
            })
          );
          if (!item.url) continue;
          try {
            const transcript = await transcribeAudioSource(
              item.url,
              null,
              undefined,
              language || "pt"
            );
            if (transcript?.trim()) {
              const bucket =
                item.kind === "video"
                  ? comprehensive.videoTranscripts
                  : comprehensive.audioTranscripts;
              bucket.push({ name: item.name || fallbackName, text: transcript.trim() });
            }
          } catch {}
        }
      }

      setProgress(52);
      setProgressStatus(t("ai_progress_synthesizing"));

      progressTimerRef.current = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + (90 - prev) * 0.12 : prev));
      }, 400);

      const res = await fetch("/api/ai/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: page.title || t("untitled"),
          textContent: comprehensive.textContent,
          ocrText: comprehensive.ocrText,
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

      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      setProgress(95);
      setProgressStatus(t("ai_progress_finalizing"));

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || t("ai_generation_error"));
      }

      const data = await res.json();
      const list: GeneratedCard[] = Array.isArray(data.flashcards)
        ? data.flashcards.map((card: Omit<GeneratedCard, "selected">) => ({
            ...card,
            selected: true,
          }))
        : [];

      setProgress(100);

      if (list.length === 0) toast.error(t("ai_no_cards_generated"));
      else setGenerated(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("ai_generation_error"));
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setAiLoading(false);
    }
  };

  const handleSaveGenerated = async () => {
    const selected = generated.filter((c) => c.selected);
    if (selected.length === 0) return;
    setSavingGenerated(true);
    const persisted = new Set<GeneratedCard>();
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
        persisted.add(card);
      }
      toast.success(t("cards_added_count", { count: persisted.size }));
      setGenerated([]);
      setTab("list");
    } catch {
      if (persisted.size > 0) toast.warning(t("cards_partially_added", { count: persisted.size }));
      else toast.error(t("saving_indicator_hint"));
      // Mantem apenas o que ainda nao foi gravado, para nao duplicar nem perder cards.
      setGenerated((prev) => prev.filter((card) => !persisted.has(card)));
    } finally {
      setSavingGenerated(false);
    }
  };

  if (studying && noteCards.length > 0) {
    return (
      <FlashcardStudySession
        cards={noteCards}
        title={page.title || t("untitled")}
        intervalModifier={settings.intervalModifier}
        onReview={async (cardId, rating) => {
          await adapter.reviewFlashcard(cardId, rating, settings.intervalModifier);
        }}
        onClose={() => setStudying(false)}
      />
    );
  }

  const selectedGeneratedCount = generated.filter((c) => c.selected).length;
  const activeLanguage = getLanguageDefinition(targetLanguage);

  const tabs: { id: TabMode; label: string; icon: React.ReactNode }[] = [
    {
      id: "list",
      label: t("cards_count", { count: noteCards.length }),
      icon: <FlashcardsIcon className="size-3.5" />,
    },
    {
      id: "editor",
      label: editingId ? t("edit_card") : t("create_manually"),
      icon: editingId ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />,
    },
    { id: "ai", label: t("generate_ai"), icon: <SparkIcon className="size-3.5" /> },
  ];

  return (
    <DialogShell
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="max-w-3xl"
      closeAriaLabel={t("close")}
    >
      <DialogHeader
        title={t("note_flashcards")}
        description={
          <span className="flex items-center gap-1.5">
            <span className="truncate">{page.title || t("untitled")}</span>
            <span aria-hidden="true">&middot;</span>
            <span className="font-medium text-ink tabular-nums">
              {t("cards_count", { count: noteCards.length })}
            </span>
          </span>
        }
        icon={<FlashcardsIcon className="size-[18px]" />}
        iconClassName="border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)] shadow-none"
      />

      <div className="shrink-0 border-b border-[var(--border)] px-5 pt-3">
        <div className="flex gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id !== "editor") resetEditor();
                setTab(item.id);
              }}
              aria-current={tab === item.id}
              className={cn(
                "relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[12.5px] font-medium transition-colors",
                tab === item.id ? "text-ink" : "text-muted hover:text-ink"
              )}
            >
              <span className={tab === item.id ? "text-[var(--accent)]" : undefined}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
              {tab === item.id ? (
                <span className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-[var(--accent)]" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[22rem] flex-1 overflow-y-auto px-5 py-4">
        {tab === "list" ? (
          noteCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="mb-4 flex size-12 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent)]">
                <FlashcardsIcon className="size-6" />
              </span>
              <h3 className="text-[14.5px] font-semibold text-ink">{t("no_flashcards")}</h3>
              <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
                {t("no_note_flashcards_desc")}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setTab("editor")}>
                  <Plus className="size-3.5" />
                  {t("create_manually")}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="font-semibold"
                  onClick={() => setTab("ai")}
                >
                  <SparkIcon className="size-3.5" />
                  {t("generate_ai")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRevealed(allRevealed ? new Set() : new Set(noteCards.map((c) => c.id)))
                  }
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
                >
                  <RevealIcon className="size-3.5" />
                  {allRevealed ? t("hide_all_answers") : t("show_all_answers")}
                </button>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-faint hover:text-[var(--danger)]"
                    onClick={() => setConfirmDeleteAll(true)}
                  >
                    <Trash2 className="size-3.5" />
                    {t("delete_all_cards")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-1.5 font-semibold"
                    onClick={() => setStudying(true)}
                  >
                    <StudyIcon className="size-3" />
                    {t("study_this_note")}
                  </Button>
                </div>
              </div>

              {confirmDeleteAll ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--danger)_25%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-3 py-2">
                  <span className="text-[12px] text-ink">
                    {t("confirm_delete_all_cards", { count: noteCards.length })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingAll}
                      onClick={() => setConfirmDeleteAll(false)}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="font-semibold"
                      disabled={deletingAll}
                      onClick={() => void handleDeleteAll()}
                    >
                      {deletingAll ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      {t("delete_all_cards")}
                    </Button>
                  </div>
                </div>
              ) : null}

              <ul className="space-y-1.5">
                {noteCards.map((card, position) => {
                  const isOpen = revealed.has(card.id);
                  return (
                    <li
                      key={card.id}
                      className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]"
                    >
                      <div className="flex items-start gap-3 p-3">
                        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-[var(--surface-2)] text-[10.5px] font-semibold text-faint tabular-nums">
                          {position + 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleRevealed(card.id)}
                          aria-expanded={isOpen}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block text-[13px] font-medium leading-snug text-ink">
                            {card.front.trim() || t("untitled")}
                          </span>
                          <span
                            className={cn(
                              "mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium transition-colors",
                              isOpen ? "text-muted" : "text-[var(--accent)]"
                            )}
                          >
                            <ChevronDown
                              className={cn(
                                "size-3 transition-transform duration-200",
                                isOpen && "rotate-180"
                              )}
                            />
                            {isOpen ? t("hide_answer") : t("reveal_answer")}
                          </span>
                        </button>

                        {(cardImage(card, "front").url ?? cardImage(card, "back").url) ? (
                          <img
                            src={(cardImage(card, "front").url ?? cardImage(card, "back").url) as string}
                            alt=""
                            className="size-10 shrink-0 rounded-[var(--radius-xs)] border border-[var(--border)] object-cover"
                          />
                        ) : null}

                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-faint hover:text-ink"
                            onClick={() => startEdit(card)}
                            aria-label={t("edit_card")}
                            title={t("edit_card")}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-faint hover:text-[var(--danger)]"
                            onClick={() => setConfirmDeleteId(card.id)}
                            aria-label={t("delete_card")}
                            title={t("delete_card")}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {isOpen ? (
                        <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2.5 pl-11">
                          <p className="text-[12.5px] leading-relaxed text-ink">{card.back}</p>
                          {card.hint ? (
                            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                              <HintIcon className="size-3 text-[var(--warning)]" />
                              {card.hint}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {confirmDeleteId === card.id ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color-mix(in_oklab,var(--danger)_25%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-3 py-2">
                          <span className="text-[12px] text-ink">{t("confirm_delete_card")}</span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              {t("cancel")}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="font-semibold"
                              onClick={() => void handleDelete(card.id)}
                            >
                              {t("delete_card")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        ) : null}

        {tab === "editor" ? (
          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
            <div className="space-y-3.5">
              <div>
                <label
                  htmlFor="flashcard-front"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-faint"
                >
                  {t("card_front")}
                </label>
                <Textarea
                  id="flashcard-front"
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  placeholder={t("card_front_placeholder")}
                  rows={3}
                  className="text-[13px]"
                />
              </div>

              <div>
                <label
                  htmlFor="flashcard-back"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-faint"
                >
                  {t("card_back")}
                </label>
                <Textarea
                  id="flashcard-back"
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  placeholder={t("card_back_placeholder")}
                  rows={3}
                  className="text-[13px]"
                />
              </div>

              <div>
                <label
                  htmlFor="flashcard-hint"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-faint"
                >
                  {t("card_hint")}
                </label>
                <Input
                  id="flashcard-hint"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder={t("card_hint_placeholder")}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                  {t("add_image")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(["front", "back"] as CardSide[]).map((side) => (
                    <ImageSlot
                      key={side}
                      label={side === "front" ? t("card_front_image") : t("card_back_image")}
                      preview={imagePreviews[side]}
                      preparing={imagePreparing[side]}
                      onSelect={(file) => void handleImageSelect(side, file)}
                      onClear={() => clearImage(side)}
                      removeLabel={t("remove_image")}
                      uploadLabel={t("upload_image")}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1 gap-2 font-semibold"
                  onClick={() => void handleSubmit()}
                  disabled={saving || !canSave}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editingId ? (
                    <Check className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  <span>{editingId ? t("save_changes") : t("save_card")}</span>
                </Button>
                {editingId ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      resetEditor();
                      setTab("list");
                    }}
                  >
                    {t("cancel")}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                  {t("card_preview")}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewFlipped((prev) => !prev)}
                  className="text-[12px] font-medium text-[var(--accent)] transition hover:underline"
                >
                  {t("flip_card")}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPreviewFlipped((prev) => !prev)}
                className="relative flex min-h-[210px] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-[var(--shadow-panel)] transition hover:border-[var(--border-strong)]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 top-0 h-[3px]",
                    previewFlipped ? "bg-[var(--success)]" : "bg-[var(--accent)]"
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.09em]",
                    previewFlipped ? "text-[var(--success)]" : "text-[var(--accent)]"
                  )}
                >
                  {previewFlipped ? t("card_back_short") : t("card_front_short")}
                </span>

                <span className="flex flex-1 flex-col items-center justify-center gap-2.5 py-3 text-center">
                  <span className="text-[15px] font-medium leading-snug text-ink">
                    {previewFlipped
                      ? back || t("card_preview_answer")
                      : front || t("card_preview_question")}
                  </span>
                  {imagePreviews[previewFlipped ? "back" : "front"] ? (
                    <img
                      src={imagePreviews[previewFlipped ? "back" : "front"] as string}
                      alt=""
                      className="max-h-24 w-auto max-w-full rounded-[var(--radius-xs)] border border-[var(--border)] object-contain"
                    />
                  ) : null}
                </span>

                {hint && !previewFlipped ? (
                  <span className="inline-flex items-center gap-1.5 self-center text-[11.5px] text-muted">
                    <HintIcon className="size-3 text-[var(--warning)]" />
                    {hint}
                  </span>
                ) : null}

                <span className="mt-3 border-t border-[var(--border)] pt-2.5 text-center text-[11px] text-faint">
                  {page.title || t("untitled")}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {tab === "ai" ? (
          <div className="space-y-5">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]/45 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]">
                  <SparkIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
                    {t("ai_generation_title")}
                  </h3>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {t("ai_generation_desc")}
                  </p>
                </div>
              </div>

              {detected ? (
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <DetectedChip
                    icon={<FileText className="size-3.5" />}
                    value={detected.words}
                    label={t("ai_words_count")}
                  />
                  <DetectedChip
                    icon={<Table2 className="size-3.5" />}
                    value={detected.tables}
                    label={t("ai_tables_count")}
                  />
                  <DetectedChip
                    icon={<ImageIcon className="size-3.5" />}
                    value={detected.images}
                    label={t("ai_images_count")}
                  />
                  <DetectedChip
                    icon={<Mic className="size-3.5" />}
                    value={detected.media}
                    label={t("ai_audio_video_count")}
                  />
                  <DetectedChip
                    icon={<Paperclip className="size-3.5" />}
                    value={detected.pdfs}
                    label={t("ai_pdf_count")}
                  />
                </div>
              ) : null}
            </div>

            {generated.length === 0 ? (
              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                    {t("ai_cards_quantity")}
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {QUANTITY_OPTIONS.map((option) => (
                      <button
                        key={String(option)}
                        type="button"
                        onClick={() => setAiCount(option)}
                        aria-pressed={aiCount === option}
                        className={cn(
                          "h-9 rounded-[var(--radius-sm)] border text-[12.5px] font-semibold transition tabular-nums",
                          aiCount === option
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
                            : "border-[var(--border)] bg-[var(--surface-2)] text-muted hover:border-[var(--border-strong)] hover:text-ink"
                        )}
                      >
                        {option === "max" ? t("ai_card_quantity_max") : option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                      <Globe className="size-3.5" />
                      {t("ai_target_language")}
                    </span>
                    <Menu>
                      <MenuTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-ink outline-none transition hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
                        >
                          <span className="truncate font-medium">{activeLanguage.nativeName}</span>
                          <ChevronDown className="size-3.5 shrink-0 text-faint" />
                        </button>
                      </MenuTrigger>
                      <MenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
                        {SUPPORTED_LANGUAGES.map((item) => (
                          <MenuItem
                            key={item.code}
                            onSelect={() => selectTargetLanguage(item.code)}
                            className="justify-between"
                          >
                            <span className="truncate">{item.nativeName}</span>
                            {item.code === targetLanguage ? (
                              <Check className="size-3.5 text-[var(--accent)]" />
                            ) : null}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                  </div>

                  <div>
                    <label
                      htmlFor="flashcard-focus"
                      className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-faint"
                    >
                      {t("ai_focus_optional")}
                    </label>
                    <Input
                      id="flashcard-focus"
                      value={aiFocus}
                      onChange={(e) => setAiFocus(e.target.value)}
                      placeholder={t("ai_focus_placeholder")}
                    />
                  </div>
                </div>

                {aiLoading ? (
                  <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <div className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                        <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--accent)]" />
                        <span className="truncate">
                          {progressStatus || t("generating_cards")}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-[var(--accent)] tabular-nums">
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--canvas)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <Button
                  variant="primary"
                  size="lg"
                  className="h-11 w-full gap-2 font-semibold"
                  onClick={() => void handleGenerate()}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <SparkIcon className="size-4" />
                  )}
                  <span>{aiLoading ? t("generating_cards") : t("generate_cards_button")}</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                    {t("generated_cards_preview")}
                    <span className="ml-1.5 text-ink tabular-nums">
                      {selectedGeneratedCount}/{generated.length}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setGenerated((prev) => {
                          const allOn = prev.every((c) => c.selected);
                          return prev.map((c) => ({ ...c, selected: !allOn }));
                        })
                      }
                    >
                      {generated.every((c) => c.selected) ? t("deselect_all") : t("select_all")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setGenerated([])}>
                      {t("clear")}
                    </Button>
                  </div>
                </div>

                <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {generated.map((card, idx) => (
                    <li key={`${idx}-${card.front.slice(0, 24)}`}>
                      <button
                        type="button"
                        aria-pressed={card.selected}
                        onClick={() =>
                          setGenerated((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, selected: !item.selected } : item
                            )
                          )
                        }
                        className={cn(
                          "flex w-full items-start gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition",
                          card.selected
                            ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                            : "border-[var(--border)] bg-[var(--surface-2)]/40 opacity-60 hover:opacity-100"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border transition",
                            card.selected
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : "border-[var(--border-strong)] bg-[var(--surface)]"
                          )}
                        >
                          {card.selected ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block text-[12.5px] font-medium leading-snug text-ink">
                            {card.front}
                          </span>
                          <span className="block text-[12px] leading-snug text-muted">
                            {card.back}
                          </span>
                          {card.hint ? (
                            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                              <HintIcon className="size-3 text-[var(--warning)]" />
                              {card.hint}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="primary"
                  size="lg"
                  className="h-11 w-full gap-2 font-semibold"
                  onClick={() => void handleSaveGenerated()}
                  disabled={savingGenerated || selectedGeneratedCount === 0}
                >
                  {savingGenerated ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  <span>{t("add_selected_cards_count", { count: selectedGeneratedCount })}</span>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </DialogShell>
  );
}

function ImageSlot({
  label,
  preview,
  preparing,
  onSelect,
  onClear,
  removeLabel,
  uploadLabel,
}: {
  label: string;
  preview: string | null;
  preparing: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
  removeLabel: string;
  uploadLabel: string;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block truncate text-[11px] font-medium text-muted">{label}</span>
      {preparing ? (
        <div className="flex h-20 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
          <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
        </div>
      ) : preview ? (
        <div className="relative overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)]">
          <img src={preview} alt="" className="h-20 w-full object-contain" />
          <button
            type="button"
            onClick={onClear}
            aria-label={removeLabel}
            title={removeLabel}
            className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white transition hover:bg-black/90"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-2 text-center text-[11.5px] font-medium text-muted transition hover:border-[var(--border-strong)] hover:text-ink">
          <UploadCloud className="size-4" />
          <span className="truncate">{uploadLabel}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelect(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function DetectedChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11.5px]",
        value > 0 ? "bg-[var(--surface)]" : "bg-transparent opacity-55"
      )}
    >
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="font-semibold text-ink tabular-nums">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
