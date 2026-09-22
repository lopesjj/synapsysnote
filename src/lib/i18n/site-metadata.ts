import type { SupportedLanguage } from "@/types/models";

export const SITE_DESCRIPTION: Record<SupportedLanguage, string> = {
  pt: "Pensado para quem faz concurso público, vestibular ou faculdade. Organize seus estudos com eficiência, transforme sua rotina em algo mais produtivo.",
  en: "Built for students preparing for civil service exams, university entrance exams or college. Organize your studies efficiently and make your routine more productive.",
  es: "Pensado para quienes preparan oposiciones, exámenes de admisión o la universidad. Organiza tus estudios con eficiencia y haz tu rutina más productiva.",
  fr: "Conçu pour ceux qui préparent un concours, un examen d'entrée ou l'université. Organisez vos études efficacement et rendez votre quotidien plus productif.",
  it: "Pensato per chi prepara concorsi pubblici, test di ammissione o l'università. Organizza lo studio in modo efficiente e rendi la tua routine più produttiva.",
  de: "Für alle, die sich auf Auswahlprüfungen, Aufnahmetests oder das Studium vorbereiten. Organisiere dein Lernen effizient und mach deinen Alltag produktiver.",
  ru: "Для тех, кто готовится к госэкзаменам, вступительным испытаниям или учится в вузе. Организуйте учёбу эффективно и сделайте свой день продуктивнее.",
  ja: "公務員試験、入試、大学の勉強に取り組む人のために。学習を効率よく整理し、毎日をもっと生産的に。",
  zh: "专为备考公务员、升学考试或正在读大学的你打造。高效整理学习资料，让日常更有成效。",
  ar: "مصمم لمن يستعد للمسابقات الحكومية أو امتحانات القبول أو الدراسة الجامعية. نظّم دراستك بكفاءة واجعل روتينك أكثر إنتاجية.",
};

const WORKSPACE_NAME: Record<SupportedLanguage, { named: (name: string) => string; fallback: string }> = {
  pt: { named: (name) => `Workspace de ${name}`, fallback: "Meu workspace" },
  en: { named: (name) => `${name}'s workspace`, fallback: "My workspace" },
  es: { named: (name) => `Espacio de ${name}`, fallback: "Mi espacio de trabajo" },
  fr: { named: (name) => `Espace de ${name}`, fallback: "Mon espace de travail" },
  it: { named: (name) => `Spazio di ${name}`, fallback: "Il mio spazio di lavoro" },
  de: { named: (name) => `Arbeitsbereich von ${name}`, fallback: "Mein Arbeitsbereich" },
  ru: { named: (name) => `Пространство: ${name}`, fallback: "Моё пространство" },
  ja: { named: (name) => `${name}のワークスペース`, fallback: "マイワークスペース" },
  zh: { named: (name) => `${name}的工作区`, fallback: "我的工作区" },
  ar: { named: (name) => `مساحة عمل ${name}`, fallback: "مساحة عملي" },
};

export function defaultWorkspaceName(language: SupportedLanguage, displayName?: string | null): string {
  const firstName = displayName?.trim().split(/\s+/)[0];
  const entry = WORKSPACE_NAME[language] ?? WORKSPACE_NAME.pt;
  return firstName ? entry.named(firstName) : entry.fallback;
}
