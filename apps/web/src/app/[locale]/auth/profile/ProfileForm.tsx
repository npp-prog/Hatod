'use client';

import { defaultLandingPath, PRIVACY_VERSION, safeNextPath, TERMS_VERSION, type Role } from '@hatod/shared';
import { httpsCallable } from 'firebase/functions';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { firebase } from '@/lib/firebase/client';
import { firstIssueCode } from '@/lib/firebase/errors';

const NAME_ERRORS = new Set(['name_too_short', 'name_too_long']);

export function ProfileForm() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'), '');
  const { loading, user, needsProfile, claims, refreshClaims } = useAuth();

  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/auth');
    else if (!needsProfile) router.replace(next || defaultLandingPath(claims.roles));
  }, [loading, user, needsProfile, claims.roles, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNameError(null);
    setFormError(null);
    setConsentError(!agree);
    if (name.trim().length < 2) setNameError(t('errors.name_too_short'));
    if (!agree || name.trim().length < 2) return;

    setBusy(true);
    try {
      const call = httpsCallable<unknown, { roles: Role[] }>(firebase().functions, 'completeProfile');
      await call({
        name,
        acceptTerms: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        locale,
      });
      await refreshClaims();
      // The effect redirects once the new claims arrive.
    } catch (err) {
      const issue = firstIssueCode(err);
      if (issue && NAME_ERRORS.has(issue)) setNameError(t(`errors.${issue as 'name_too_short' | 'name_too_long'}`));
      else setFormError(t('errors.generic'));
      setBusy(false);
    }
  }

  if (loading || !user || !needsProfile) return <Spinner label={tc('loading')} />;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <form onSubmit={submit} className="card space-y-5" noValidate>
        <div>
          <label htmlFor="name" className="label">
            {t('nameLabel')}
          </label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError}
            aria-describedby="name-error"
            required
          />
          {nameError && <FieldError id="name-error">{nameError}</FieldError>}
        </div>

        <div>
          <label className="flex min-h-12 items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-6 shrink-0 accent-brand"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              aria-describedby="consent-error"
              aria-invalid={consentError}
            />
            <span>
              {t.rich('consent', {
                terms: (chunks) => (
                  <Link href="/legal/terms" target="_blank" className="font-semibold text-brand underline">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/legal/privacy" target="_blank" className="font-semibold text-brand underline">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>
          {consentError && <FieldError id="consent-error">{t('consentRequired')}</FieldError>}
        </div>

        {formError && <FieldError id="form-error">{formError}</FieldError>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? tc('saving') : t('submit')}
        </button>
      </form>
    </div>
  );
}
