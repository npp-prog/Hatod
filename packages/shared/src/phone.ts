/**
 * Philippine mobile numbers. People type them many ways:
 * 09171234567, 9171234567, 639171234567, +63 917 123 4567, 0917-123-4567.
 * Firebase Auth needs E.164: +639171234567.
 */
const PH_MOBILE_E164 = /^\+639\d{9}$/;

export function normalizePhMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  let rest: string;
  if (digits.startsWith('+63')) rest = digits.slice(3);
  else if (digits.startsWith('63')) rest = digits.slice(2);
  else if (digits.startsWith('0')) rest = digits.slice(1);
  else rest = digits;
  const e164 = `+63${rest}`;
  return PH_MOBILE_E164.test(e164) ? e164 : null;
}

export function isPhMobileE164(value: string): boolean {
  return PH_MOBILE_E164.test(value);
}

/** +639171234567 -> 0917 123 4567 (how people write numbers locally). */
export function formatPhMobile(e164: string): string {
  if (!isPhMobileE164(e164)) return e164;
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
