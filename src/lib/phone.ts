
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
