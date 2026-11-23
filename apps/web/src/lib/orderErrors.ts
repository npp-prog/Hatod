import type { useTranslations } from 'next-intl';

/** Message for an order callable's error code, falling back to a generic one. */
export function orderErrorText(t: ReturnType<typeof useTranslations<'orders'>>, code: string): string {
  // Without signal the server never saw the action: say so instead of a vague error.
  if (typeof navigator !== 'undefined' && !navigator.onLine) return t('errors.no_signal');
  const key = `errors.${code}` as 'errors.generic';
  return t.has(key) ? t(key) : t('errors.generic');
}
