
export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits.slice(0, 11);
}

export function formatPhoneBR(value: string): string {
  const digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (digits.length <= 6) return `(${ddd}) ${rest}`;
  if (digits.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

export function isValidPhoneBR(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length === 10 || digits.length === 11;
}

/** E.164: ate 15 digitos, com o codigo do pais. */
const MAX_INTERNATIONAL_DIGITS = 15;

function isInternational(value: string): boolean {
  return value.trimStart().startsWith("+");
}

/**
 * Numero com "+" fica no formato internacional (so digitos, sem cortar); sem
 * "+", segue a mascara brasileira. Antes toda entrada passava pela mascara
 * brasileira, que cortava um numero estrangeiro em 11 digitos e o salvava
 * errado.
 */
export function formatPhone(value: string): string {
  if (isInternational(value)) {
    return `+${value.replace(/\D/g, "").slice(0, MAX_INTERNATIONAL_DIGITS)}`;
  }
  return formatPhoneBR(value);
}

export function isValidPhone(value: string): boolean {
  if (isInternational(value)) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= MAX_INTERNATIONAL_DIGITS && !digits.startsWith("0");
  }
  return isValidPhoneBR(value);
}
