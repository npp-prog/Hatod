'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LABELS: Record<string, string> = { en: 'English', fil: 'Filipino' };

export function LanguageSwitcher() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t('language')}</span>
      <select
        className="input min-h-12 w-auto py-1"
        value={locale}
        disabled={pending}
        aria-label={t('language')}
        onChange={(e) => {
          const next = e.target.value as (typeof routing.locales)[number];
          startTransition(() => router.replace(pathname, { locale: next }));
        }}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LABELS[l] ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}
