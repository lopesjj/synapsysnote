"use client";

import { useState } from "react";
import {
  Check,
  Globe,
  Keyboard,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
  Type,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Input,
  Kbd,
  Switch,
} from "@/components/ui/primitives";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  UI_ZOOM_STEPS,
  UI_ZOOM_MOBILE_MAX,
  useUiStore,
  type EditorWidth,
  type NotesDensity,
  type NotesLayout,
  type NotesSortKey,
} from "@/lib/store/ui-store";
import { fontById, fontsByCategory } from "@/lib/typography";
import { cn, isMac } from "@/lib/utils";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";

type PreferenceTab = "appearance" | "language" | "typography" | "profile" | "shortcuts";

export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PreferenceTab>("appearance");

  const navItems: { id: PreferenceTab; label: string; icon: React.ReactNode }[] = [
    { id: "appearance", label: t("appearance"), icon: <Palette className="size-4" /> },
    { id: "language", label: t("language"), icon: <Globe className="size-4" /> },
    { id: "typography", label: t("typography"), icon: <Type className="size-4" /> },
    { id: "profile", label: t("profile"), icon: <User className="size-4" /> },
    { id: "shortcuts", label: t("shortcuts"), icon: <Keyboard className="size-4" /> },
  ];

  const getSectionTitle = () => {
    switch (activeTab) {
      case "appearance":
        return t("appearance");
      case "language":
        return t("language_title");
      case "typography":
        return t("typography");
      case "profile":
        return t("profile");
      case "shortcuts":
        return t("shortcuts");
    }
  };

  const getSectionDescription = () => {
    switch (activeTab) {
      case "appearance":
        return t("theme_hint");
      case "language":
        return t("language_description");
      default:
        return "";
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      showClose={false}
      className="h-[88dvh] max-h-[88dvh] sm:h-[85dvh] md:h-[620px] md:max-h-[88vh] w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-3xl p-0 gap-0 overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-float)] rounded-[var(--radius-xl)]"
    >
      <div className="flex flex-col md:flex-row h-full">
        <div className="w-full md:w-[210px] shrink-0 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--surface-2)]/35 flex flex-col justify-between p-2.5 sm:p-3 md:p-3.5">
          <div className="space-y-2 md:space-y-3">
            <div className="flex items-center justify-between px-1.5 py-0.5 md:px-2 md:py-1">
              <div className="flex items-center gap-2 md:gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-xs text-ink">
                  <Settings className="size-3.5" />
                </div>
                <h2 className="text-[13.5px] font-semibold text-ink tracking-tight">
                  {t("preferences")}
                </h2>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="md:hidden rounded-lg p-1.5 text-faint hover:bg-[var(--surface-hover)] hover:text-ink transition"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>

            <nav className="flex md:flex-col gap-1 overflow-x-auto no-scrollbar md:overflow-visible pb-0.5 md:pb-0 px-0.5">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:px-3 md:py-2 text-[12.5px] md:text-[13px] font-medium transition-all text-left shrink-0 md:shrink select-none",
                      active
                        ? "bg-[var(--surface)] text-ink font-semibold shadow-xs border border-[var(--border)]"
                        : "text-muted hover:text-ink hover:bg-[var(--surface-hover)] border border-transparent"
                    )}
                  >
                    <span
                      className={cn(
                        "transition-colors",
                        active ? "text-[var(--accent)]" : "text-faint"
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="hidden md:flex items-center justify-between px-2 pt-2 border-t border-[var(--border)]/60 text-[11px] text-faint">
            <span>Synapsys Note</span>
            <Kbd>Esc</Kbd>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 md:px-8 md:py-4 border-b border-[var(--border)] shrink-0">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] md:text-[16px] font-semibold text-ink tracking-tight truncate">
                {getSectionTitle()}
              </h3>
              {getSectionDescription() ? (
                <p className="mt-0.5 text-[11px] md:text-[11.5px] text-muted truncate">
                  {getSectionDescription()}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="hidden md:flex rounded-lg p-1.5 text-faint hover:bg-[var(--surface-hover)] hover:text-ink transition"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-6 space-y-5 sm:space-y-6 pb-8 md:pb-6 overscroll-contain">
            {activeTab === "appearance" && <AppearanceSection />}
            {activeTab === "language" && <LanguageSection />}
            {activeTab === "typography" && <TypographySection />}
            {activeTab === "profile" && <ProfileSection />}
            {activeTab === "shortcuts" && <ShortcutsSection />}
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

function PreferenceCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/25 divide-y divide-[var(--border)]/60 p-1",
        className
      )}
    >
      {children}
    </div>
  );
}

function PreferenceRow({
  label,
  hint,
  children,
  className,
  layout = "auto",
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  layout?: "auto" | "horizontal" | "stacked";
}) {
  return (
    <div
      className={cn(
        "px-3.5 py-3",
        layout === "horizontal"
          ? "flex items-center justify-between gap-3"
          : layout === "stacked"
          ? "flex flex-col gap-2.5"
          : "flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink leading-tight">{label}</p>
        {hint ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{hint}</p> : null}
      </div>
      <div className={cn("shrink-0", layout === "auto" && "w-full sm:w-auto flex sm:justify-end")}>
        {children}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full sm:w-auto items-center rounded-lg bg-[var(--surface-2)] border border-[var(--border)]/60 p-0.5 overflow-x-auto no-scrollbar",
        className
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 sm:py-1 text-[11.5px] sm:text-[12px] font-medium transition-all select-none whitespace-nowrap",
              active
                ? "bg-[var(--surface)] text-ink shadow-xs border border-[var(--border)]/80 font-semibold"
                : "text-muted hover:text-ink"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DensityPreview({ density }: { density: NotesDensity }) {
  const compact = density === "compact";
  return (
    <div className={cn("flex w-32 flex-col", compact ? "gap-0.5" : "gap-1.5")} aria-hidden>
      <span className={cn("w-full rounded-full bg-[var(--text)]/20", compact ? "h-1" : "h-1.5")} />
      <span className={cn("w-4/5 rounded-full bg-[var(--text)]/15", compact ? "h-1" : "h-1.5")} />
      <span className={cn("w-3/5 rounded-full bg-[var(--text)]/10", compact ? "h-1" : "h-1.5")} />
    </div>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const notesLayout = useUiStore((state) => state.notesLayout);
  const notesSort = useUiStore((state) => state.notesSort);
  const notesDensity = useUiStore((state) => state.notesDensity);
  const showSaveIndicator = useUiStore((state) => state.showSaveIndicator);
  const zenMode = useUiStore((state) => state.zenMode);
  const uiZoom = useUiStore((state) => state.uiZoom);
  const autoCollapseSidebar = useUiStore((state) => state.autoCollapseSidebar);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const zoomOptions = UI_ZOOM_STEPS
    .filter((step) => !isMobile || step <= UI_ZOOM_MOBILE_MAX)
    .map((step) => ({
      value: String(step),
      label: `${Math.round(step * 100)}%`,
    }));

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-faint mb-2.5">
          {t("theme")}
        </label>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={cn(
              "group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-left transition-all",
              theme === "light"
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/20 ring-1 ring-[var(--accent)]/30 shadow-xs"
                : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            )}
          >
            <div className="w-full h-16 rounded-lg bg-slate-100 border border-slate-200 p-2 flex flex-col justify-between overflow-hidden shadow-xs">
              <div className="flex items-center gap-1">
                <div className="size-1.5 rounded-full bg-slate-300" />
                <div className="size-1.5 rounded-full bg-slate-300" />
                <div className="size-1.5 rounded-full bg-slate-300" />
              </div>
              <div className="space-y-1">
                <div className="w-3/4 h-1.5 rounded-full bg-slate-300" />
                <div className="w-1/2 h-1.5 rounded-full bg-slate-200" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <Sun className="size-3.5 text-amber-500" />
              <span>{t("light")}</span>
              {theme === "light" && <Check className="size-3.5 text-[var(--accent)] ml-auto" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={cn(
              "group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-left transition-all",
              theme === "dark"
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/20 ring-1 ring-[var(--accent)]/30 shadow-xs"
                : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            )}
          >
            <div className="w-full h-16 rounded-lg bg-slate-900 border border-slate-800 p-2 flex flex-col justify-between overflow-hidden shadow-xs">
              <div className="flex items-center gap-1">
                <div className="size-1.5 rounded-full bg-slate-700" />
                <div className="size-1.5 rounded-full bg-slate-700" />
                <div className="size-1.5 rounded-full bg-slate-700" />
              </div>
              <div className="space-y-1">
                <div className="w-3/4 h-1.5 rounded-full bg-slate-700" />
                <div className="w-1/2 h-1.5 rounded-full bg-slate-800" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <Moon className="size-3.5 text-indigo-400" />
              <span>{t("dark")}</span>
              {theme === "dark" && <Check className="size-3.5 text-[var(--accent)] ml-auto" />}
            </div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-faint mb-2.5">
          {t("appearance")}
        </label>
        <PreferenceCard>
          <PreferenceRow
            label={t("focus_mode")}
            hint={`${t("focus_mode_hint")} (${isMac() ? "⌘⇧F" : "Ctrl ⇧ F"})`}
            layout="horizontal"
          >
            <Switch
              checked={zenMode}
              onCheckedChange={(checked) => useUiStore.getState().setZenMode(checked)}
              aria-label={t("focus_mode")}
            />
          </PreferenceRow>

          <PreferenceRow
            label={t("auto_collapse_sidebar")}
            hint={t("auto_collapse_sidebar_hint")}
            layout="horizontal"
          >
            <Switch
              checked={autoCollapseSidebar}
              onCheckedChange={(checked) => useUiStore.getState().setAutoCollapseSidebar(checked)}
              aria-label={t("auto_collapse_sidebar")}
            />
          </PreferenceRow>

          <PreferenceRow
            label={t("saving_indicator")}
            hint={t("saving_indicator_hint")}
            layout="horizontal"
          >
            <Switch
              checked={showSaveIndicator}
              onCheckedChange={(checked) => useUiStore.getState().setShowSaveIndicator(checked)}
              aria-label={t("saving_indicator")}
            />
          </PreferenceRow>
        </PreferenceCard>
      </div>

      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-faint mb-2.5">
          {t("notes_layout")}
        </label>
        <PreferenceCard>
          <PreferenceRow label={t("notes_layout")} hint={t("notes_layout_hint")}>
            <SegmentedControl<NotesLayout>
              value={notesLayout}
              onChange={(value) => useUiStore.getState().setNotesLayout(value)}
              options={[
                { value: "list", label: t("layout_list") },
                { value: "cards", label: t("layout_cards") },
                { value: "split", label: t("layout_split") },
              ]}
            />
          </PreferenceRow>

          <PreferenceRow label={t("density")} hint={t("density_hint")}>
            <div className="flex flex-col items-end gap-2">
              <SegmentedControl<NotesDensity>
                value={notesDensity}
                onChange={(value) => useUiStore.getState().setNotesDensity(value)}
                options={[
                  { value: "comfortable", label: t("comfortable") },
                  { value: "compact", label: t("compact") },
                ]}
              />
              <DensityPreview density={notesDensity} />
            </div>
          </PreferenceRow>

          <PreferenceRow label={t("default_sorting")}>
            <SegmentedControl<NotesSortKey>
              value={notesSort}
              onChange={(value) => useUiStore.getState().setNotesSort(value)}
              options={[
                { value: "updated", label: t("sort_updated") },
                { value: "created", label: t("sort_created") },
                { value: "title", label: t("sort_title") },
              ]}
            />
          </PreferenceRow>

          <PreferenceRow label={t("ui_scale")} hint={t("ui_scale_hint")}>
            <SegmentedControl<string>
              value={String(uiZoom)}
              onChange={(value) => useUiStore.getState().setUiZoom(Number(value))}
              options={zoomOptions}
            />
          </PreferenceRow>
        </PreferenceCard>
      </div>
    </div>
  );
}

function LanguageSection() {
  const { t, language, setLanguage } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = lang.code === language;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              className={cn(
                "group relative flex items-center justify-between rounded-xl border p-3.5 text-left transition-all duration-150 select-none",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/20 shadow-xs ring-1 ring-[var(--accent)]/30"
                  : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]/70 bg-[var(--surface)]"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "size-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold tracking-wider shrink-0 transition-colors",
                    active
                      ? "bg-[var(--accent)] text-white shadow-xs"
                      : "bg-[var(--surface-2)] text-muted group-hover:text-ink border border-[var(--border)]"
                  )}
                >
                  {lang.code.toUpperCase()}
                </div>
                <div>
                  <span className="block text-[13.5px] font-medium text-ink leading-tight">
                    {lang.nativeName}
                  </span>
                  <span className="block text-[11.5px] text-muted leading-tight mt-0.5">
                    {t(`lang_${lang.code}` as TranslationKey)}
                  </span>
                </div>
              </div>
              <div
                className={cn(
                  "size-5 rounded-full flex items-center justify-center transition-colors shrink-0",
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] group-hover:border-[var(--border-strong)]"
                )}
              >
                {active ? <Check className="size-3" strokeWidth={3} /> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TypographySection() {
  const { t } = useTranslation();
  const editorFontId = useUiStore((state) => state.editorFontId);
  const editorFontSize = useUiStore((state) => state.editorFontSize);
  const editorWidth = useUiStore((state) => state.editorWidth);
  const selected = fontById(editorFontId);

  const getFontCategoryLabel = (category: string) => {
    switch (category) {
      case "sans":
        return t("category_sans");
      case "serif":
        return t("category_serif");
      case "mono":
        return t("category_mono");
      default:
        return category;
    }
  };

  const getFontNote = (fontId: string, defaultNote: string) => {
    const key = `font_note_${fontId.replace(/-/g, "_")}` as TranslationKey;
    const translated = t(key);
    return translated === key ? defaultNote : translated;
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-[12px] font-semibold uppercase tracking-wider text-faint mb-2.5">
          {t("editor_font")}
        </label>
        <div className="space-y-4">
          {fontsByCategory().map((group) => (
            <div key={group.category}>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
                {getFontCategoryLabel(group.category)}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.fonts.map((font) => {
                  const active = font.id === editorFontId;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => useUiStore.getState().setEditorFontId(font.id)}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]/20 shadow-xs ring-1 ring-[var(--accent)]/30"
                          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] bg-[var(--surface)]"
                      )}
                    >
                      <div
                        className={cn(
                          "size-8 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0 transition-colors",
                          active
                            ? "bg-[var(--accent)] text-white shadow-xs"
                            : "bg-[var(--surface-2)] text-muted group-hover:text-ink border border-[var(--border)]"
                        )}
                        style={{ fontFamily: font.stack }}
                      >
                        Aa
                      </div>
                      <div className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[13.5px] font-medium text-ink leading-tight"
                          style={{ fontFamily: font.stack }}
                        >
                          {font.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted leading-tight truncate">
                          {getFontNote(font.id, font.note)}
                        </span>
                      </div>
                      {active ? (
                        <Check className="size-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PreferenceCard>
        <PreferenceRow label={t("font_body_size")} hint={`${editorFontSize}px`}>
          <div className="flex w-full sm:w-auto items-center gap-2.5 sm:gap-3">
            <span className="text-[11px] text-faint font-mono shrink-0">{EDITOR_FONT_SIZE_MIN}px</span>
            <input
              type="range"
              min={EDITOR_FONT_SIZE_MIN}
              max={EDITOR_FONT_SIZE_MAX}
              value={editorFontSize}
              onChange={(event) =>
                useUiStore.getState().setEditorFontSize(Number(event.target.value))
              }
              className="flex-1 sm:w-44 accent-[var(--accent)] cursor-pointer"
              aria-label={t("font_body_size")}
            />
            <span className="text-[11px] text-faint font-mono shrink-0">{EDITOR_FONT_SIZE_MAX}px</span>
            <span className="text-[12px] font-semibold text-ink px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
              {editorFontSize}px
            </span>
          </div>
        </PreferenceRow>

        <PreferenceRow label={t("reading_width")} hint={t("reading_width_hint")}>
          <SegmentedControl<EditorWidth>
            value={editorWidth}
            onChange={(value) => useUiStore.getState().setEditorWidth(value)}
            options={[
              { value: "narrow", label: t("width_narrow") },
              { value: "normal", label: t("width_normal") },
              { value: "wide", label: t("width_wide") },
            ]}
          />
        </PreferenceRow>
      </PreferenceCard>

      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4 transition-all"
        style={{ fontFamily: selected.stack, fontSize: `${editorFontSize}px` }}
      >
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint mb-2">
          <Type className="size-3 text-[var(--accent)]" /> {t("preview")} · {selected.name}
        </div>
        <p className="leading-relaxed text-ink font-normal">
          &ldquo;{t("preview_quote")}&rdquo;
        </p>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { t } = useTranslation();
  const { user, mode } = useAuth();
  const { profile, rename } = useUserProfile();

  const [draft, setDraft] = useState<string | null>(null);
  const current = profile?.displayName ?? user?.displayName ?? "";
  const name = draft ?? current;
  const dirty = name.trim().length > 0 && name.trim() !== current;

  const providerLabels: Record<string, string> = {
    password: t("provider_password"),
    "google.com": "Google",
    "github.com": "GitHub",
    demo: t("provider_demo"),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
        <Avatar name={profile?.displayName ?? user?.displayName ?? ""} url={user?.photoURL} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">
            {profile?.displayName ?? user?.displayName}
          </p>
          <p className="truncate text-[12.5px] text-muted">{user?.email}</p>
          {profile?.phone ? (
            <p className="truncate text-[12px] text-muted mt-0.5">{profile.phone}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[12.5px] font-medium text-ink" htmlFor="display-name">
          {t("display_name")}
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            id="display-name"
            value={name}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("display_name_placeholder")}
            className="rounded-lg flex-1"
          />
          <Button
            variant="primary"
            disabled={!dirty || rename.isPending}
            onClick={() => {
              rename.mutate(name.trim(), {
                onSuccess: () => {
                  setDraft(null);
                  toast.success(t("name_updated"));
                },
                onError: () => toast.error(t("name_save_failed")),
              });
            }}
            className="shrink-0 rounded-lg w-full sm:w-auto justify-center"
          >
            {rename.isPending ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>

      <PreferenceCard>
        <PreferenceRow label={t("access_methods")} hint={t("access_methods_hint")} layout="auto">
          <div className="flex flex-wrap sm:justify-end gap-1.5">
            {(profile?.providers?.length ? profile.providers : ["-"]).map((provider) => (
              <span
                key={provider}
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-muted"
              >
                {providerLabels[provider] ?? provider}
              </span>
            ))}
          </div>
        </PreferenceRow>
      </PreferenceCard>

      {mode === "demo" ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3.5 py-3 text-[12px] text-[var(--accent)]">
          <Monitor className="mt-0.5 size-4 shrink-0" />
          <span className="leading-relaxed">{t("demo_session_notice")}</span>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-full object-cover border border-[var(--border)] shadow-xs"
      />
    );
  }
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[16px] font-bold text-[var(--accent)] border border-[var(--accent)]/20 shadow-xs">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function ShortcutsSection() {
  const { t } = useTranslation();
  const mod = isMac() ? "⌘" : "Ctrl";

  const shortcuts: { group: string; items: { keys: string[]; label: string }[] }[] = [
    {
      group: t("shortcut_global"),
      items: [
        { keys: ["mod", "K"], label: t("shortcut_search") },
        { keys: ["mod", "N"], label: t("new_note") },
        { keys: ["mod", "⇧", "N"], label: t("new_page") },
        { keys: ["mod", "B"], label: t("shortcut_collapse_sidebar") },
        { keys: ["mod", "\\"], label: t("shortcut_collapse_sidebar_typing") },
        { keys: ["mod", "⇧", "F"], label: t("shortcut_toggle_focus") },
        { keys: ["mod", ","], label: t("preferences") },
        { keys: ["Esc"], label: t("shortcut_exit_focus") },
      ],
    },
    {
      group: t("shortcut_editor"),
      items: [
        { keys: ["/"], label: t("shortcut_block_menu") },
        { keys: ["@"], label: t("shortcut_mention") },
        { keys: ["mod", "B"], label: t("bold") },
        { keys: ["mod", "I"], label: t("italic") },
        { keys: ["mod", "U"], label: t("underline") },
        { keys: ["mod", "⇧", "X"], label: t("strikethrough") },
        { keys: ["mod", "E"], label: t("code_inline") },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {shortcuts.map((section) => (
        <div key={section.group}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
            {section.group}
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/25 divide-y divide-[var(--border)]/50 overflow-hidden">
            {section.items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-left hover:bg-[var(--surface-hover)]/50 transition-colors"
              >
                <span className="text-[12.5px] font-medium text-ink">{item.label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {item.keys.map((key, index) => (
                    <Kbd key={`${item.label}-${index}`}>{key === "mod" ? mod : key}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
