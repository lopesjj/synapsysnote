"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SynapsysLockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";

const FEATURES = [
  {
    title: "Editor de blocos",
    description: "Slash commands, menções, arraste lateral e backlinks bidirecionais.",
  },
  {
    title: "Importação do Notion",
    description: "Páginas aninhadas, bases de dados e anexos rehospedados no seu Storage.",
  },
  {
    title: "OCR e notas de voz",
    description: "Imagens, PDFs e áudio viram texto pesquisável assim que entram no caderno.",
  },
  {
    title: "Bases flexíveis",
    description: "Tabela e Kanban sobre os mesmos dados, com edição inline.",
  },
  {
    title: "Busca híbrida",
    description: "Texto completo e vetores no mesmo atalho, inclusive offline.",
  },
  {
    title: "Backend Firebase",
    description: "Auth, Firestore, Storage e Admin SDK — sem o navegador ver tokens de terceiros.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, mode, signInWithGoogle, signInWithEmail, signUpWithEmail, continueAsGuest } =
    useAuth();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [loading, router, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (tab === "signup") await signUpWithEmail(name || email.split("@")[0], email, password);
      else await signInWithEmail(email, password);
      router.push("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[var(--canvas)]">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <div>
          <SynapsysLockup size={64} />

          <h1 className="mt-10 max-w-xl text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[52px]">
            Conhecimento que
            <span className="bg-gradient-to-r from-[var(--accent)] to-[#0ea5e9] bg-clip-text text-transparent">
              {" "}
              se conecta
            </span>
            .
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
            A flexibilidade de blocos e bases do Notion com a velocidade de captura, OCR e áudio do
            Evernote. Importação nativa via Firebase Admin e busca que enxerga dentro das suas imagens.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="border-l border-[var(--border)] pl-3">
                <p className="text-[13px] font-medium text-ink">{feature.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lux-gradient rounded-[var(--radius-xl)] border border-[var(--border)] p-6 shadow-[var(--shadow-float)]">
          <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5">
            {(["signin", "signup"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex-1 rounded-[6px] py-1.5 text-[12.5px] font-medium transition ${
                  tab === value ? "bg-[var(--surface)] text-ink shadow-sm" : "text-muted"
                }`}
              >
                {value === "signin" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {tab === "signup" ? (
              <Field label="Nome">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como te chamamos?" />
              </Field>
            ) : null}
            <Field label="E-mail">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </Field>
            <Field label="Senha">
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {tab === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11px] text-faint">ou</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={async () => {
              try {
                await signInWithGoogle();
                router.push("/app");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Falha no login com Google");
              }
            }}
          >
            <GoogleGlyph />
            Continuar com Google
          </Button>

          <button
            onClick={async () => {
              await continueAsGuest();
              router.push("/app");
            }}
            className="mt-3 w-full rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] py-2.5 text-[12.5px] text-muted transition hover:border-[var(--accent)] hover:text-ink"
          >
            Explorar demonstração local (sem cadastro)
          </button>
          {mode === "demo" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              Nenhuma credencial do Firebase configurada: os dados ficam apenas no seu navegador.
              Preencha <code className="font-mono">.env.local</code> para ativar Auth, Firestore,
              Storage e a importação real do Notion via Firebase Admin.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l-.02.15 3.6 2.8.25.03c2.3-2.1 3.6-5.2 3.6-8.8"
      />
      <path
        fill="#34A853"
        d="M12 24c3.3 0 6-1.1 8-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-.14.01-3.7 2.9-.05.14C3.2 21.3 7.3 24 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.1 14.4c-.3-.8-.4-1.6-.4-2.4s.15-1.7.4-2.4V6.6l-3.8.05C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.3 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.8 3c1-2.9 3.7-4.9 6.9-4.9"
      />
    </svg>
  );
}
