"use client";

import { useMemo, useRef, useState } from "react";
import { ImageOff, ImagePlus, LayoutGrid, Loader2, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { COVER_PRESETS, coverPresetById, type CoverCategory, type CoverImageTheme } from "@/lib/covers/presets";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { useTranslation } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export function CoverPicker({
  coverUrl,
  onChange,
  onUploadImage,
}: {
  coverUrl?: string | null;
  onChange: (coverUrl: string | null) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<CoverCategory>("images");
  const [activeTheme, setActiveTheme] = useState<CoverImageTheme | "all">("all");

  const preset = coverPresetById(coverUrl);

  const imagePresets = useMemo(() => {
    return COVER_PRESETS.filter((item) => item.category === "images");
  }, []);

  const gradientPresets = useMemo(() => {
    return COVER_PRESETS.filter((item) => item.category === "gradients");
  }, []);

  const patternPresets = useMemo(() => {
    return COVER_PRESETS.filter((item) => item.category === "patterns");
  }, []);

  const displayedImages = useMemo(() => {
    if (activeTheme === "all") return imagePresets;
    return imagePresets.filter((item) => item.theme === activeTheme);
  }, [imagePresets, activeTheme]);

  const upload = async (file: File) => {
    if (!onUploadImage) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) {
      toast.error(t("choose_image_file"));
      return;
    }
    setUploading(true);
    try {
      onChange(await onUploadImage(file));
      toast.success(t("cover_updated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("cover_upload_failed"));
    } finally {
      setUploading(false);
    }
  };

  const swatches = (
    <div className="flex w-[320px] sm:w-[380px] flex-col gap-2 p-2.5">
      <div className="flex items-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setActiveTab("images")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] py-1.5 text-[11.5px] font-medium transition",
            activeTab === "images"
              ? "bg-[var(--surface)] text-ink shadow-sm"
              : "text-muted hover:text-ink"
          )}
        >
          <Sparkles className="size-3" />
          {t("cover_tab_gallery")}
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setActiveTab("gradients")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] py-1.5 text-[11.5px] font-medium transition",
            activeTab === "gradients"
              ? "bg-[var(--surface)] text-ink shadow-sm"
              : "text-muted hover:text-ink"
          )}
        >
          <Palette className="size-3" />
          {t("cover_tab_gradients")}
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setActiveTab("patterns")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] py-1.5 text-[11.5px] font-medium transition",
            activeTab === "patterns"
              ? "bg-[var(--surface)] text-ink shadow-sm"
              : "text-muted hover:text-ink"
          )}
        >
          <LayoutGrid className="size-3" />
          {t("cover_tab_patterns")}
        </button>
      </div>

      {activeTab === "images" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setActiveTheme("all")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 font-medium transition",
                activeTheme === "all"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
              )}
            >
              {t("cover_filter_all")}
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setActiveTheme("nature")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 font-medium transition",
                activeTheme === "nature"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
              )}
            >
              {t("cover_cat_nature")}
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setActiveTheme("architecture")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 font-medium transition",
                activeTheme === "architecture"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
              )}
            >
              {t("cover_cat_architecture")}
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setActiveTheme("art")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 font-medium transition",
                activeTheme === "art"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
              )}
            >
              {t("cover_cat_art")}
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setActiveTheme("editorial")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 font-medium transition",
                activeTheme === "editorial"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
              )}
            >
              {t("cover_cat_editorial")}
            </button>
          </div>

          <div className="grid max-h-60 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
            {displayedImages.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => onChange(item.id)}
                className={cn(
                  "group/thumb relative h-16 overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)] transition-all hover:scale-[1.02] active:scale-95",
                  coverUrl === item.id && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-1)] border-transparent"
                )}
                style={{
                  backgroundImage: `url('${item.thumbnailUrl || item.imageUrl || ""}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundColor: "#0f172a",
                }}
              >
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 text-left opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100">
                  <span className="block truncate text-[10px] font-medium text-white">
                    {item.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "gradients" ? (
        <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
          {gradientPresets.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => onChange(item.id)}
              className={cn(
                "h-12 overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)] transition-all hover:scale-105 active:scale-95",
                coverUrl === item.id && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-1)] border-transparent",
                item.className
              )}
              style={item.style}
            />
          ))}
        </div>
      ) : null}

      {activeTab === "patterns" ? (
        <div className="grid max-h-60 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
          {patternPresets.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => onChange(item.id)}
              className={cn(
                "h-14 overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)] transition-all hover:scale-105 active:scale-95",
                coverUrl === item.id && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-1)] border-transparent",
                item.className
              )}
              style={item.style}
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-1.5 border-t border-[var(--border)] pt-2">
        <button
          type="button"
          title={t("no_cover")}
          onClick={() => onChange(null)}
          className="flex items-center gap-1.5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11.5px] text-faint transition hover:border-[var(--border-strong)] hover:text-ink"
        >
          <ImageOff className="size-3" />
          {t("no_cover")}
        </button>

        {onUploadImage ? (
          <button
            type="button"
            disabled={uploading}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-[var(--radius-xs)] border border-dashed border-[var(--border-strong)] px-2.5 py-1 text-[11.5px] text-muted transition hover:border-[var(--accent)] hover:text-ink disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
            {uploading ? t("uploading") : t("upload_image")}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {onUploadImage ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      ) : null}

      {!coverUrl ? (
        <div className="mx-auto flex w-full max-w-[var(--reading-width,64rem)] justify-end px-2 pt-1 sm:px-6 sm:pt-4 md:px-8">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[12px] text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink"
              >
                <ImagePlus className="size-3.5" /> {t("add_cover")}
              </button>
            </MenuTrigger>
            <MenuContent align="end" className="min-w-0 p-0 shadow-2xl border border-[var(--border)]">
              {swatches}
            </MenuContent>
          </Menu>
        </div>
      ) : (
        <div className="group/cover relative z-0 w-full overflow-hidden">
          <div className="h-[28vh] max-h-[360px] min-h-[200px] w-full bg-[var(--surface-2)] md:min-h-[240px]">
            {preset ? (
              <div
                className={cn("h-full w-full transition-all duration-300", preset.className)}
                style={preset.style}
              />
            ) : (
              <img src={coverUrl} alt={t("change_cover")} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="absolute top-12 right-3 z-20 flex items-center gap-1.5 opacity-100 pointer-events-auto transition-opacity duration-200 sm:top-14 sm:right-6 md:right-8 md:opacity-0 md:pointer-events-none md:group-hover/cover:opacity-100 md:group-hover/cover:pointer-events-auto md:focus-within:opacity-100 md:focus-within:pointer-events-auto">
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11.5px] font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-black/75 active:scale-95"
                >
                  <ImagePlus className="size-3" /> {t("change_cover")}
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="min-w-0 p-0 shadow-2xl border border-[var(--border)]">
                {swatches}
              </MenuContent>
            </Menu>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11.5px] font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-black/75 active:scale-95"
            >
              <ImageOff className="size-3" /> {t("remove_cover")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
