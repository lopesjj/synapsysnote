export function isPlanningName(name: string): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return [
    "planejamento",
    "planning",
    "planificación",
    "planificacion",
    "planification",
    "pianificazione",
    "planung",
    "планирование",
    "計画",
    "计划",
    "計劃",
    "التخطيط",
    "تخطيط",
  ].some((candidate) => lower === candidate || normalized === candidate.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

const CANONICAL_MAP: Record<string, string> = {
  nome: "nome",
  name: "nome",
  nombre: "nome",
  nom: "nome",
  имя: "nome",
  名前: "nome",
  名称: "nome",
  الاسم: "nome",
  اسم: "nome",

  status: "status",
  estado: "status",
  statut: "status",
  stato: "status",
  статус: "status",
  ステータス: "status",
  状态: "status",
  الحالة: "status",
  حالة: "status",

  data: "data",
  date: "data",
  fecha: "data",
  datum: "data",
  дата: "data",
  日付: "data",
  日期: "data",
  التاريخ: "data",
  تاريخ: "data",

  "a fazer": "a_fazer",
  "to do": "a_fazer",
  "por hacer": "a_fazer",
  "a faire": "a_fazer",
  "da fare": "a_fazer",
  "zu erledigen": "a_fazer",
  "сделать": "a_fazer",
  "未着手": "a_fazer",
  "待办": "a_fazer",
  "للقيام به": "a_fazer",
  "قيد الانتظار": "a_fazer",
  "مهام للقيام بها": "a_fazer",

  fazendo: "fazendo",
  "in progress": "fazendo",
  "en curso": "fazendo",
  "en cours": "fazendo",
  "in corso": "fazendo",
  "in bearbeitung": "fazendo",
  "в процессе": "fazendo",
  "進行中": "fazendo",
  "进行中": "fazendo",
  "قيد التنفيذ": "fazendo",
  جار: "fazendo",
  جاري: "fazendo",

  concluido: "concluido",
  concluído: "concluido",
  done: "concluido",
  completado: "concluido",
  termine: "concluido",
  terminé: "concluido",
  erledigt: "concluido",
  готово: "concluido",
  完了: "concluido",
  已完成: "concluido",
  مكتمل: "concluido",
  تم: "concluido",
  منجز: "concluido",

  "sem status": "sem_status",
  "no status": "sem_status",
  "sin estado": "sem_status",
  "sans statut": "sem_status",
  "senza stato": "sem_status",
  "kein status": "sem_status",
  "без статуса": "sem_status",
  "ステータスなし": "sem_status",
  "无状态": "sem_status",
  "بدون حالة": "sem_status",
  "بلا حالة": "sem_status",

  prioridade: "prioridade",
  priority: "prioridade",
  prioridad: "prioridade",
  priorite: "prioridade",
  priorité: "prioridade",
  priorita: "prioridade",
  priorità: "prioridade",
  prioritat: "prioridade",
  priorität: "prioridade",
  приоритет: "prioridade",
  優先度: "prioridade",
  优先级: "prioridade",
  الأولوية: "prioridade",
  أولوية: "prioridade",
  اولوية: "prioridade",

  alta: "alta",
  high: "alta",
  alto: "alta",
  haute: "alta",
  haut: "alta",
  hoch: "alta",
  высокий: "alta",
  高: "alta",
  عالية: "alta",
  مرتفع: "alta",
  مرتفعة: "alta",

  media: "media",
  média: "media",
  medium: "media",
  medio: "media",
  moyen: "media",
  moyenne: "media",
  mittel: "media",
  средний: "media",
  中: "media",
  متوسطة: "media",
  متوسط: "media",

  baixa: "baixa",
  low: "baixa",
  bajo: "baixa",
  bas: "baixa",
  basse: "baixa",
  basso: "baixa",
  niedrig: "baixa",
  низкий: "baixa",
  低: "baixa",
  منخفضة: "baixa",
  منخفض: "baixa",

  tags: "tags",
  tag: "tags",
  etiquetas: "tags",
  balises: "tags",
  теги: "tags",
  タグ: "tags",
  标签: "tags",
  الوسوم: "tags",
  وسوم: "tags",
  علامات: "tags",

  tabela: "tabela",
  table: "tabela",
  tabla: "tabela",
  tableau: "tabela",
  tabella: "tabela",
  tabelle: "tabela",
  таблица: "tabela",
  テーブル: "tabela",
  表格: "tabela",
  جدول: "tabela",
};

const LOCALIZED_VALUES: Record<string, Record<string, string>> = {
  nome: {
    pt: "Nome",
    en: "Name",
    es: "Nombre",
    fr: "Nom",
    it: "Nome",
    de: "Name",
    ru: "Имя",
    ja: "名前",
    zh: "名称",
    ar: "الاسم",
  },
  status: {
    pt: "Status",
    en: "Status",
    es: "Estado",
    fr: "Statut",
    it: "Stato",
    de: "Status",
    ru: "Статус",
    ja: "ステータス",
    zh: "状态",
    ar: "الحالة",
  },
  data: {
    pt: "Data",
    en: "Date",
    es: "Fecha",
    fr: "Date",
    it: "Data",
    de: "Datum",
    ru: "Дата",
    ja: "日付",
    zh: "日期",
    ar: "التاريخ",
  },
  a_fazer: {
    pt: "A fazer",
    en: "To do",
    es: "Por hacer",
    fr: "À faire",
    it: "Da fare",
    de: "Zu erledigen",
    ru: "Сделать",
    ja: "未着手",
    zh: "待办",
    ar: "للقيام به",
  },
  fazendo: {
    pt: "Fazendo",
    en: "In progress",
    es: "En curso",
    fr: "En cours",
    it: "In corso",
    de: "In Bearbeitung",
    ru: "В процессе",
    ja: "進行中",
    zh: "进行中",
    ar: "قيد التنفيذ",
  },
  concluido: {
    pt: "Concluído",
    en: "Done",
    es: "Completado",
    fr: "Terminé",
    it: "Completato",
    de: "Erledigt",
    ru: "Готово",
    ja: "完了",
    zh: "已完成",
    ar: "مكتمل",
  },
  sem_status: {
    pt: "Sem status",
    en: "No status",
    es: "Sin estado",
    fr: "Sans statut",
    it: "Senza stato",
    de: "Kein Status",
    ru: "Без статуса",
    ja: "ステータスなし",
    zh: "无状态",
    ar: "بدون حالة",
  },
  prioridade: {
    pt: "Prioridade",
    en: "Priority",
    es: "Prioridad",
    fr: "Priorité",
    it: "Priorità",
    de: "Priorität",
    ru: "Приоритет",
    ja: "優先度",
    zh: "优先级",
    ar: "الأولوية",
  },
  alta: {
    pt: "Alta",
    en: "High",
    es: "Alta",
    fr: "Haute",
    it: "Alta",
    de: "Hoch",
    ru: "Высокий",
    ja: "高",
    zh: "高",
    ar: "عالية",
  },
  media: {
    pt: "Média",
    en: "Medium",
    es: "Media",
    fr: "Moyenne",
    it: "Media",
    de: "Mittel",
    ru: "Средний",
    ja: "中",
    zh: "中",
    ar: "متوسطة",
  },
  baixa: {
    pt: "Baixa",
    en: "Low",
    es: "Baja",
    fr: "Basse",
    it: "Bassa",
    de: "Niedrig",
    ru: "Низкий",
    ja: "低",
    zh: "低",
    ar: "منخفضة",
  },
  tags: {
    pt: "Tags",
    en: "Tags",
    es: "Etiquetas",
    fr: "Balises",
    it: "Tag",
    de: "Tags",
    ru: "Теги",
    ja: "タグ",
    zh: "标签",
    ar: "الوسوم",
  },
  tabela: {
    pt: "Tabela",
    en: "Table",
    es: "Tabla",
    fr: "Tableau",
    it: "Tabella",
    de: "Tabelle",
    ru: "Таблица",
    ja: "テーブル",
    zh: "表格",
    ar: "جدول",
  },
};

export function translateDatabaseText(text: string, lang: string = "pt"): string {
  if (!text) return text;
  const normalized = text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const canonical = CANONICAL_MAP[normalized];
  if (!canonical) return text;
  const entry = LOCALIZED_VALUES[canonical];
  return entry?.[lang] || entry?.pt || text;
}

export function formatRecordsProperties(rows: number, props: number, lang: string): string {
  if (lang === "pt") {
    const rowWord = rows === 1 ? "registro" : "registros";
    const propWord = props === 1 ? "propriedade" : "propriedades";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  if (lang === "es") {
    const rowWord = rows === 1 ? "registro" : "registros";
    const propWord = props === 1 ? "propiedad" : "propiedades";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  if (lang === "fr") {
    const rowWord = rows === 1 ? "enregistrement" : "enregistrements";
    const propWord = props === 1 ? "propriété" : "propriétés";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  if (lang === "it") {
    const rowWord = "record";
    const propWord = props === 1 ? "proprietà" : "proprietà";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  if (lang === "de") {
    const rowWord = rows === 1 ? "Eintrag" : "Einträge";
    const propWord = props === 1 ? "Eigenschaft" : "Eigenschaften";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  if (lang === "ru") {
    const rowWord = rows === 1 ? "запись" : rows >= 2 && rows <= 4 ? "записи" : "записей";
    const propWord = props === 1 ? "свойство" : props >= 2 && props <= 4 ? "свойства" : "свойств";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  if (lang === "ja") {
    return `${rows} 件のレコード · ${props} 件のプロパティ`;
  }
  if (lang === "zh") {
    return `${rows} 条记录 · ${props} 项属性`;
  }
  if (lang === "ar") {
    const rowWord = rows === 1 ? "سجل" : "سجلات";
    const propWord = props === 1 ? "خاصية" : "خصائص";
    return `${rows} ${rowWord} · ${props} ${propWord}`;
  }
  const rowWord = rows === 1 ? "record" : "records";
  const propWord = props === 1 ? "property" : "properties";
  return `${rows} ${rowWord} · ${props} ${propWord}`;
}
