/**
 * Launch locales. The pilot town's language (Hiligaynon "hil" or Cebuano "ceb")
 * is reserved for Phase 2: add it here and add messages/<code>.json.
 */
export const SUPPORTED_LOCALES = ['en', 'fil'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const RESERVED_LOCALES = ['hil', 'ceb'] as const;
