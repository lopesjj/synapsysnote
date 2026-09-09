"use client";

import { useState } from "react";
import { Check, Loader2, Monitor, Moon, Settings2, Sun, Type } from "lucide-react";
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
  useUiStore,
  type EditorWidth,
  type NotesDensity,
  type NotesLayout,
  type NotesSortKey,
} from "@/lib/store/ui-store";
import { fontById, fontsByCategory } from "@/lib/typography";
import { cn, isMac } from "@/lib/utils";

export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader
        icon={<Settings2 className="size-4" />}
        title="Preferências"
        description="Aparência, tipografia e atalhos. Suas escolhas acompanham a conta."
      />
      <Tabs defaultValue="appearance">
        <div className="border-b border-[var(--border)] px-5 pt-3">
          <TabsList>
            <TabsTrigger value="appearance">Aparência</TabsTrigger>
            <TabsTrigger value="typography">Tipografia</TabsTrigger>
            <TabsTrigger value="profile">Perfil</TabsTrigger>
            <TabsTrigger value="shortcuts">Atalhos</TabsTrigger>
          </TabsList>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          <TabsContent value="appearance" className="space-y-5 outline-none">
            <AppearanceSection />
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
  const { theme, setTheme } = useTheme();
  const notesLayout = useUiStore((state) => state.notesLayout);
  const notesSort = useUiStore((state) => state.notesSort);
  const notesDensity = useUiStore((state) => state.notesDensity);
  const showSaveIndicator = useUiStore((state) => state.showSaveIndicator);
  const zenMode = useUiStore((state) => state.zenMode);

  return (
    <>
      <Row label="Tema" hint="O modo escuro usa tons de grafite azulado; o claro, cinzas sutis.">
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Claro", icon: <Sun className="size-3.5" /> },
            { value: "dark", label: "Escuro", icon: <Moon className="size-3.5" /> },
          ]}
        />
      </Row>
      <Separator />
      <Row
        label="Modo foco"
        hint={`Esconde a barra lateral e as barras de ferramentas. ${
          isMac() ? "⌘⇧F" : "Ctrl ⇧ F"
        } alterna, Esc sai.`}
      >
        <Switch
          checked={zenMode}
          onCheckedChange={(checked) => useUiStore.getState().setZenMode(checked)}
          aria-label="Modo foco"
        />
      </Row>
      <Separator />
      <Row label="Layout da lista de notas" hint="Vale para a visão “Todas as notas” e para as tags.">
        <SegmentedControl<NotesLayout>
          value={notesLayout}
          onChange={(value) => useUiStore.getState().setNotesLayout(value)}
          options={[
            { value: "list", label: "Lista" },
            { value: "cards", label: "Cartões" },
            { value: "split", label: "Painel duplo" },
          ]}
        />
      </Row>
      <Row
        label="Densidade"
        hint="Aperta a lista de notas, a barra lateral e o espaçamento do editor."
      >
        <div className="flex flex-col items-end gap-2">
          <SegmentedControl<NotesDensity>
            value={notesDensity}
            onChange={(value) => useUiStore.getState().setNotesDensity(value)}
            options={[
              { value: "comfortable", label: "Confortável" },
              { value: "compact", label: "Compacta" },
            ]}
          />
          <DensityPreview density={notesDensity} />
        </div>
      </Row>
      <Row label="Ordenação padrão">
        <SegmentedControl<NotesSortKey>
          value={notesSort}
          onChange={(value) => useUiStore.getState().setNotesSort(value)}
          options={[
            { value: "updated", label: "Modificação" },
            { value: "created", label: "Criação" },
            { value: "title", label: "Título" },
          ]}
        />
      </Row>
      <Separator />
      <Row
        label="Indicador de salvamento"
        hint="Mostra “Salvando… / Salvo” no cabeçalho da página."
      >
        <Switch
          checked={showSaveIndicator}
          onCheckedChange={(checked) => useUiStore.getState().setShowSaveIndicator(checked)}
          aria-label="Indicador de salvamento"
        />
      </Row>
    </>
  );
}

function TypographySection() {
  const editorFontId = useUiStore((state) => state.editorFontId);
  const editorFontSize = useUiStore((state) => state.editorFontSize);
  const editorWidth = useUiStore((state) => state.editorWidth);
  const selected = fontById(editorFontId);

  return (
    <>
      <div>
        <p className="text-[13px] font-medium text-ink">Fonte do editor</p>
        <p className="mt-0.5 text-[11.5px] text-muted">
          Todas as famílias são auto-hospedadas - nenhuma requisição sai do seu domínio.
        </p>

        <div className="mt-3 space-y-4">
          {fontsByCategory().map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
                {group.label}
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
                          {font.note}
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

      <Row label="Corpo do texto" hint={`${editorFontSize}px`}>
        <input
          type="range"
          min={EDITOR_FONT_SIZE_MIN}
          max={EDITOR_FONT_SIZE_MAX}
          value={editorFontSize}
          onChange={(event) =>
            useUiStore.getState().setEditorFontSize(Number(event.target.value))
          }
          className="w-40 accent-[var(--accent)]"
          aria-label="Tamanho do corpo do texto"
        />
      </Row>

      <Row label="Largura de leitura" hint="Quantos caracteres cabem por linha.">
        <SegmentedControl<EditorWidth>
          value={editorWidth}
          onChange={(value) => useUiStore.getState().setEditorWidth(value)}
          options={[
            { value: "narrow", label: "Estreita" },
            { value: "normal", label: "Normal" },
            { value: "wide", label: "Larga" },
          ]}
        />
      </Row>

      <div
        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
        style={{ fontFamily: selected.stack, fontSize: `${editorFontSize}px` }}
      >
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
          <Type className="size-3" /> Prévia · {selected.name}
        </p>
        <p className="mt-1.5 leading-relaxed text-ink">
          O conhecimento não se acumula, se conecta. Cada nota é um nó da rede.
        </p>
      </div>
    </>
  );
}

function ProfileSection() {
  const { user, mode } = useAuth();
  const { profile, rename } = useUserProfile();

  const [draft, setDraft] = useState<string | null>(null);
  const current = profile?.displayName ?? user?.displayName ?? "";
  const name = draft ?? current;
  const dirty = name.trim().length > 0 && name.trim() !== current;

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
          Nome de exibição
        </label>
        <div className="flex gap-2">
          <Input
            id="display-name"
            value={name}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Como te chamamos?"
          />
          <Button
            variant="primary"
            disabled={!dirty || rename.isPending}
            onClick={() => {
              rename.mutate(name.trim(), {
                onSuccess: () => {
                  setDraft(null);
                  toast.success("Nome atualizado");
                },
                onError: () => toast.error("Não foi possível salvar o nome"),
              });
            }}
          >
            {rename.isPending ? <Loader2 className="animate-spin" /> : null}
            Salvar
          </Button>
        </div>
        <p className="text-[11px] text-faint">
          Vem do provedor de login quando você entra com Google, e do cadastro quando
          você usa e-mail e senha.
        </p>
      </div>

      <Separator />

      <Row label="Métodos de acesso" hint="Provedores vinculados a esta conta.">
        <div className="flex flex-wrap justify-end gap-1.5">
          {(profile?.providers?.length ? profile.providers : ["-"]).map((provider) => (
            <span
              key={provider}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-muted"
            >
              {PROVIDER_LABELS[provider] ?? provider}
            </span>
          ))}
        </div>
      </Row>

      {mode === "demo" ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-[11.5px] text-[var(--accent)]">
          <Monitor className="mt-0.5 size-3.5 shrink-0" />
          Sessão de demonstração: o perfil e as preferências ficam apenas neste navegador.
        </p>
      ) : null}
    </>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  password: "E-mail e senha",
  "google.com": "Google",
  "github.com": "GitHub",
  demo: "Demonstração local",
};

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

const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: "Global",
    items: [
      { keys: ["mod", "K"], label: "Busca global e comandos" },
      { keys: ["mod", "N"], label: "Nova nota" },
      { keys: ["mod", "⇧", "N"], label: "Nova página" },
      { keys: ["mod", "B"], label: "Recolher a barra lateral" },
      { keys: ["mod", "\\"], label: "Recolher a barra lateral (mesmo digitando)" },
      { keys: ["mod", "⇧", "F"], label: "Ativar ou desativar o modo foco" },
      { keys: ["mod", ","], label: "Preferências" },
      { keys: ["Esc"], label: "Sair do modo foco" },
    ],
  },
  {
    group: "Editor",
    items: [
      { keys: ["/"], label: "Menu de blocos (títulos, listas, callouts, tabelas…)" },
      { keys: ["@"], label: "Mencionar outra página" },
      { keys: ["mod", "B"], label: "Negrito" },
      { keys: ["mod", "I"], label: "Itálico" },
      { keys: ["mod", "U"], label: "Sublinhado" },
      { keys: ["mod", "⇧", "X"], label: "Tachado" },
      { keys: ["mod", "E"], label: "Código em linha" },
    ],
  },
];

function ShortcutsSection() {
  const mod = isMac() ? "⌘" : "Ctrl";
  return (
    <div className="space-y-5">
      {SHORTCUTS.map((section) => (
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
