"use client";

import { useRef, useState } from "react";
import { ImageOff, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { COVER_PRESETS, coverPresetById } from "@/lib/covers/presets";
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
  const preset = coverPresetById(coverUrl);

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
    <div className="w-[248px] p-1.5">
      <div className="grid max-h-64 grid-cols-4 gap-1 overflow-y-auto pr-0.5">
        <button
          type="button"
          title={t("no_cover")}
          onClick={() => onChange(null)}
          className="flex h-11 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-2)] text-[10px] text-faint"
        >
          {t("no_cover")}
        </button>
        {COVER_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onChange(item.id)}
            className={cn(
              "h-11 overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border)]",
              coverUrl === item.id && "ring-2 ring-[var(--accent)]",
              item.className
            )}
            style={item.style}
          />
        ))}
      </div>
      {onUploadImage ? (
        <button
          type="button"
          disabled={uploading}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-[11.5px] text-muted transition hover:border-[var(--accent)] hover:text-ink disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {uploading ? t("uploading") : t("upload_image")}
        </button>
      ) : null}
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
            <MenuContent align="end" className="min-w-0 p-0">
              {swatches}
            </MenuContent>
          </Menu>
        </div>
      ) : (
        <div className="group/cover relative z-0 w-full overflow-hidden">
          <div className="h-[28vh] max-h-[360px] min-h-[200px] w-full md:min-h-[240px]">
            {preset ? (
              <div className={cn("h-full w-full", preset.className)} style={preset.style} />
            ) : (
              <img src={coverUrl} alt={t("change_cover")} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="absolute top-12 right-3 sm:top-14 sm:right-6 md:right-8 z-20 flex items-center gap-1.5 opacity-100 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover/cover:opacity-100 md:group-hover/cover:pointer-events-auto md:focus-within:opacity-100 md:focus-within:pointer-events-auto transition-opacity duration-200">
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11.5px] font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-black/75 active:scale-95"
                >
                  <ImagePlus className="size-3" /> {t("change_cover")}
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="min-w-0 p-0">
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
