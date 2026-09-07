"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImageOff, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceIcon, firstCustomIcon, isIconUrl } from "@/lib/icons/workspace-icon";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(file.name);
}

export function IconPicker({
  icons,
  current,
  fallback,
  onSelect,
  onUploadImage,
  uploading = false,
  onRequestUpload,
}: {
  icons: readonly string[];
  current?: string | null;
  fallback: string;
  onSelect: (icon: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  uploading?: boolean;
  onRequestUpload?: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return icons;
    if (q === "br" || q === "brasil" || q === "brazil" || q.includes("bandeira")) {
      return icons.filter((icon) => icon.includes("🇧🇷") || icon === "🇧🇷");
    }
    return icons.filter((icon) => icon.toLowerCase().includes(q));
  }, [icons, query]);

  const applyCustom = () => {
    const next = firstCustomIcon(custom);
    if (!next) return;
    onSelect(next);
    setCustom("");
  };

  return (
    <div className="w-[280px] p-1.5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Buscar ou cole 🇧🇷 / BR"
        className="mb-1.5 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[11.5px] text-ink outline-none placeholder:text-faint focus:border-[var(--accent)]"
      />
      <div className="grid max-h-72 grid-cols-8 gap-0.5 overflow-y-auto pr-0.5">
        {visible.map((icon) => {
          const selected =
            (current ?? fallback) === icon ||
            ((current === "BR" || current === "br") && icon === "🇧🇷");
          return (
            <button
              key={icon}
              type="button"
              onClick={() => onSelect(icon)}
              className="flex items-center justify-center rounded p-1.5 transition hover:bg-[var(--surface-hover)] data-[selected=true]:bg-[var(--accent-soft)]"
              data-selected={selected}
              aria-label={`Ícone ${icon}`}
            >
              <WorkspaceIcon icon={icon} fallback={fallback} size={18} />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 space-y-1.5 border-t border-[var(--border)] pt-1.5">
        {onUploadImage ? (
          <button
            type="button"
            disabled={uploading}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onRequestUpload}
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-[11.5px] text-muted transition hover:border-[var(--accent)] hover:text-ink disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            {uploading ? "Enviando…" : "Enviar imagem"}
          </button>
        ) : null}
        {current && isIconUrl(current) ? (
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelect(fallback);
              toast.success("Logo removido");
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[11.5px] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink"
          >
            <ImageOff className="size-3.5" />
            Remover logo
          </button>
        ) : null}
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              applyCustom();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder="Cole um emoji, BR ou URL da imagem"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[11.5px] text-ink outline-none placeholder:text-faint focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}

export function IconPickerMenu({
  trigger,
  icons,
  current,
  fallback,
  onSelect,
  onUploadImage,
  className,
}: {
  trigger: ReactNode;
  icons: readonly string[];
  current?: string | null;
  fallback: string;
  onSelect: (icon: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const holdOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const release = () => {
      window.setTimeout(() => {
        holdOpen.current = false;
      }, 400);
    };
    window.addEventListener("focus", release);
    return () => window.removeEventListener("focus", release);
  }, []);

  const apply = (icon: string) => {
    onSelect(icon);
    setOpen(false);
  };

  const upload = async (file: File) => {
    if (!onUploadImage || !isImageFile(file)) {
      toast.error("Escolha um arquivo de imagem");
      return;
    }
    setUploading(true);
    holdOpen.current = true;
    try {
      apply(await onUploadImage(file));
      toast.success("Ícone atualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a imagem");
    } finally {
      holdOpen.current = false;
      setUploading(false);
    }
  };

  return (
    <div className={cn("inline-flex shrink-0 self-center leading-none", className)}>
      {onUploadImage ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      ) : null}
      <Menu
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (!next && (holdOpen.current || uploading)) return;
          setOpen(next);
        }}
      >
        <MenuTrigger asChild>{trigger}</MenuTrigger>
        <MenuContent align="start" className="min-w-0 overflow-y-auto p-0">
          <IconPicker
            icons={icons}
            current={current}
            fallback={fallback}
            onSelect={apply}
            onUploadImage={onUploadImage}
            uploading={uploading}
            onRequestUpload={() => {
              holdOpen.current = true;
              fileRef.current?.click();
            }}
          />
        </MenuContent>
      </Menu>
    </div>
  );
}
