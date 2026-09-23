import { REMEMBER_DAYS } from "@/lib/auth/remember";

/**
 * Quem responde pelo serviço. Os documentos legais leem daqui, então trocar um
 * e-mail ou incluir a razão social é uma edição só.
 *
 * `legalName` e `taxId` ficam vazios até existir empresa constituída; quando
 * preenchidos, entram na identificação do controlador exigida pelo art. 9º da
 * LGPD.
 */
export const LEGAL_ENTITY = {
  brand: "Synapsys Note",
  legalName: "",
  taxId: "",
  contactEmail: "atendimento@synapsysnt.com.br",
  privacyEmail: "atendimento@synapsysnt.com.br",
};

export const LEGAL_VERSION = "1.0";
export const LEGAL_UPDATED_AT = "2026-09-23";

/**
 * Prazos citados nos documentos. Os que existem no código vêm de lá, e o
 * `verify:legal` confere os demais contra as constantes de origem.
 */
export const LEGAL_FACTS = {
  rememberDays: REMEMBER_DAYS,
  shortSessionHours: 12,
  trashDays: 30,
  geoDays: 30,
  consentMonths: 12,
  accessLogMonths: 6,
  minimumAge: 14,
  responseDays: 15,
  noticeDays: 15,
};

export function legalController(): string {
  const { brand, legalName, taxId } = LEGAL_ENTITY;
  if (!legalName) return brand;
  return taxId ? `${legalName} (${brand}), CNPJ ${taxId}` : `${legalName} (${brand})`;
}

export function legalPlaceholders(): Record<string, string> {
  return {
    brand: LEGAL_ENTITY.brand,
    controller: legalController(),
    contactEmail: LEGAL_ENTITY.contactEmail,
    privacyEmail: LEGAL_ENTITY.privacyEmail,
    ...Object.fromEntries(Object.entries(LEGAL_FACTS).map(([key, value]) => [key, String(value)])),
  };
}
