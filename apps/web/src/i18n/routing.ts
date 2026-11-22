import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@hatod/shared';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // English lives at "/", Filipino at "/fil/...".
  localePrefix: 'as-needed',
});
