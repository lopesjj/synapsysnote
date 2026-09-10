"use client";

import { useState } from "react";
import { Check, Globe, Loader2, Monitor, Moon, Settings2, Sun, Type } from "lucide-react";
import { toast } from "sonner";
import { DialogHeader, DialogShell } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Input,
  Kbd,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
import { useTranslation } from "@/lib/i18n/translations";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";

export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader
        icon={<Settings2 className="size-4" />}
        title={t("preferences")}
        description={t("preferences_description")}
      />
      <Tabs defaultValue="appearance">
        <div className="border-b border-[var(--border)] px-5 pt-3">
          <TabsList>
            <TabsTrigger value="appearance">{t("appearance")}</TabsTrigger>
            <TabsTrigger value="language">{t("language")}</TabsTrigger>
            <TabsTrigger value="typography">{t("typography")}</TabsTrigger>
            <TabsTrigger value="profile">{t("profile")}</TabsTrigger>
            <TabsTrigger value="shortcuts">{t("shortcuts")}</TabsTrigger>
          </TabsList>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          <TabsContent value="appearance" className="space-y-5 outline-none">
            <AppearanceSection />
          </TabsContent>
          <TabsContent value="language" className="space-y-5 outline-none">
            <LanguageSection />
          </TabsContent>
          <TabsContent value="typography" className="space-y-5 outline-none">
            <TypographySection />
          </TabsContent>
          <TabsContent value="profile" className="space-y-5 outline-none">
            <ProfileSection />
          </TabsContent>
          <TabsContent value="shortcuts" className="outline-none">
            <ShortcutsSection />
          </TabsContent>
        </div>
      </Tabs>
    </DialogShell>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition",
            value === option.value
              ? "bg-[var(--surface)] text-ink shadow-sm"
              : "text-muted hover:text-ink"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DensityPreview({ density }: { density: NotesDensity }) {
  const compact = density === "compact";
  return (
    <div className={cn("flex w-36 flex-col", compact ? "gap-0.5" : "gap-1.5")} aria-hidden>
      <span className={cn("w-full rounded-full bg-[var(--text)]/25", compact ? "h-1" : "h-1.5")} />
      <span className={cn("w-5/6 rounded-full bg-[var(--text)]/18", compact ? "h-1" : "h-1.5")} />
      <span className={cn("w-2/3 rounded-full bg-[var(--text)]/12", compact ? "h-1" : "h-1.5")} />
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
    <>
      <Row label={t("theme")} hint={t("theme_hint")}>
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: t("light"), icon: <Sun className="size-3.5" /> },
            { value: "dark", label: t("dark"), icon: <Moon className="size-3.5" /> },
          ]}
        />
      </Row>
      <Separator />
      <Row
        label={t("focus_mode")}
        hint={`${t("focus_mode_hint")} ${t("focus_mode_shortcut_hint", {
          shortcut: isMac() ? "⌘⇧F" : "Ctrl ⇧ F",
        })}`}
      >
        <Switch
          checked={zenMode}
          onCheckedChange={(checked) => useUiStore.getState().setZenMode(checked)}
          aria-label={t("focus_mode")}
        />
      </Row>
      <Separator />
      <Row label={t("notes_layout")} hint={t("notes_layout_hint")}>
        <SegmentedControl<NotesLayout>
          value={notesLayout}
          onChange={(value) => useUiStore.getState().setNotesLayout(value)}
          options={[
            { value: "list", label: t("layout_list") },
            { value: "cards", label: t("layout_cards") },
            { value: "split", label: t("layout_split") },
          ]}
        />
      </Row>
      <Row
        label={t("density")}
        hint={t("density_hint")}
      >
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
      </Row>
      <Row label={t("default_sorting")}>
        <SegmentedControl<NotesSortKey>
          value={notesSort}
          onChange={(value) => useUiStore.getState().setNotesSort(value)}
          options={[
            { value: "updated", label: t("sort_updated") },
            { value: "created", label: t("sort_created") },
            { value: "title", label: t("sort_title") },
          ]}
        />
      </Row>
      <Separator />
      <Row
        label={t("saving_indicator")}
        hint={t("saving_indicator_hint")}
      >
        <Switch
          checked={showSaveIndicator}
          onCheckedChange={(checked) => useUiStore.getState().setShowSaveIndicator(checked)}
          aria-label={t("saving_indicator")}
        />
      </Row>
      <Separator />
      <Row
        label={t("ui_scale")}
        hint={t("ui_scale_hint")}
      >
        <SegmentedControl<string>
          value={String(uiZoom)}
          onChange={(value) => useUiStore.getState().setUiZoom(Number(value))}
          options={zoomOptions}
        />
      </Row>
      <Separator />
      <Row
        label={t("auto_collapse_sidebar")}
        hint={t("auto_collapse_sidebar_hint")}
      >
        <Switch
          checked={autoCollapseSidebar}
          onCheckedChange={(checked) => useUiStore.getState().setAutoCollapseSidebar(checked)}
          aria-label={t("auto_collapse_sidebar")}
        />
      </Row>
    </>
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
    const key = `font_note_${fontId.replace(/-/g, "_")}` as any;
    const translated = t(key);
    return translated === key ? defaultNote : translated;
  };

  return (
    <>
      <div>
        <p className="text-[13px] font-medium text-ink">{t("editor_font")}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {t("editor_font_hint")}
        </p>

        <div className="mt-3 space-y-4">
          {fontsByCategory().map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
                {getFontCategoryLabel(group.category)}
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.fonts.map((font) => {
                  const active = font.id === editorFontId;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => useUiStore.getState().setEditorFontId(font.id)}
                      className={cn(
                        "flex items-start gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[13.5px] text-ink"
                          style={{ fontFamily: font.stack }}
                        >
                          {font.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                          {getFontNote(font.id, font.note)}
                        </span>
                      </span>
                      {active ? (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <Row label={t("font_body_size")} hint={`${editorFontSize}px`}>
        <input
          type="range"
          min={EDITOR_FONT_SIZE_MIN}
          max={EDITOR_FONT_SIZE_MAX}
          value={editorFontSize}
          onChange={(event) =>
            useUiStore.getState().setEditorFontSize(Number(event.target.value))
          }
          className="w-40 accent-[var(--accent)]"
          aria-label={t("font_body_size")}
        />
      </Row>

      <Row label={t("reading_width")} hint={t("reading_width_hint")}>
        <SegmentedControl<EditorWidth>
          value={editorWidth}
          onChange={(value) => useUiStore.getState().setEditorWidth(value)}
          options={[
            { value: "narrow", label: t("width_narrow") },
            { value: "normal", label: t("width_normal") },
            { value: "wide", label: t("width_wide") },
          ]}
        />
      </Row>

      <div
        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
        style={{ fontFamily: selected.stack, fontSize: `${editorFontSize}px` }}
      >
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
          <Type className="size-3" /> {t("preview")} · {selected.name}
        </p>
        <p className="mt-1.5 leading-relaxed text-ink">
          {t("preview_quote")}
        </p>
      </div>
    </>
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
    <>
      <div className="flex items-center gap-3">
        <Avatar name={profile?.displayName ?? user?.displayName ?? ""} url={user?.photoURL} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">
            {profile?.displayName ?? user?.displayName}
          </p>
          <p className="truncate text-[12px] text-muted">{user?.email}</p>
          {profile?.phone ? (
            <p className="truncate text-[12px] text-muted">{profile.phone}</p>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted" htmlFor="display-name">
          {t("display_name")}
        </label>
        <div className="flex gap-2">
          <Input
            id="display-name"
            value={name}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("display_name_placeholder")}
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
          >
            {rename.isPending ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </div>
        <p className="text-[11px] text-faint">
          {t("display_name_hint")}
        </p>
      </div>

      <Separator />

      <Row label={t("access_methods")} hint={t("access_methods_hint")}>
        <div className="flex flex-wrap justify-end gap-1.5">
          {(profile?.providers?.length ? profile.providers : ["-"]).map((provider) => (
            <span
              key={provider}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted"
            >
              {providerLabels[provider] ?? provider}
            </span>
          ))}
        </div>
      </Row>

      {mode === "demo" ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-[11.5px] text-[var(--accent)]">
          <Monitor className="mt-0.5 size-3.5 shrink-0" />
          {t("demo_session_notice")}
        </p>
      ) : null}
    </>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[15px] font-semibold text-[var(--accent)]">
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
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
            {section.group}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 rounded-[var(--radius-xs)] px-1 py-1"
              >
                <span className="text-[12.5px] text-muted">{item.label}</span>
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

function LanguageSection() {
  const { t, language, setLanguage } = useTranslation();

  return (
    <div>
      <p className="text-[13px] font-medium text-ink">{t("language_title")}</p>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {t("language_description")}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = lang.code === language;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              className={cn(
                "flex items-center justify-between rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[18px] leading-none" role="img" aria-label={lang.name}>
                  {lang.flag}
                </span>
                <div>
                  <span className="block text-[13px] font-medium text-ink">
                    {lang.nativeName}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {t(`lang_${lang.code}` as any)}
                  </span>
                </div>
              </div>
              {active ? (
                <Check className="size-4 shrink-0 text-[var(--accent)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

