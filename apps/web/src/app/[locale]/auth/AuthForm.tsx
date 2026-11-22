'use client';

import { defaultLandingPath, formatPhMobile, normalizePhMobile, safeNextPath } from '@hatod/shared';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { FieldError, PageTitle } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { firebase, isEmulator } from '@/lib/firebase/client';
import { errorCode } from '@/lib/firebase/errors';

type Step = 'phone' | 'code';

function authErrorKey(code: string) {
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'invalidPhone';
    case 'auth/invalid-verification-code':
    case 'auth/code-expired':
    case 'auth/missing-verification-code':
      return 'invalidCode';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'tooManyRequests';
    case 'auth/network-request-failed':
      return 'network';
    default:
      return 'generic';
  }
}

export function AuthForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNextPath(search.get('next'), '');
  const { user, loading, needsProfile, claims } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  // Already signed in (or just finished): move on.
  useEffect(() => {
    if (loading || !user) return;
    if (needsProfile) router.replace({ pathname: '/auth/profile', query: next ? { next } : {} });
    else router.replace(next || defaultLandingPath(claims.roles));
  }, [loading, user, needsProfile, claims.roles, next, router]);

  useEffect(() => () => verifier.current?.clear(), []);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const e164 = normalizePhMobile(phoneInput);
    if (!e164) {
      setError(t('errors.invalidPhone'));
      return;
    }
    setBusy(true);
    try {
      const { auth } = firebase();
      verifier.current ??= new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      confirmation.current = await signInWithPhoneNumber(auth, e164, verifier.current);
      setPhone(e164);
      setStep('code');
    } catch (err) {
      verifier.current?.clear();
      verifier.current = null;
      setError(t(`errors.${authErrorKey(errorCode(err))}`));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!confirmation.current) return;
    setError(null);
    setBusy(true);
    try {
      await confirmation.current.confirm(code.trim());
      // The effect above redirects once the auth state updates.
    } catch (err) {
      setError(t(`errors.${authErrorKey(errorCode(err))}`));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageTitle>{t('title')}</PageTitle>

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="card space-y-4" noValidate>
          <div>
            <label htmlFor="phone" className="label">
              {t('phoneLabel')}
            </label>
            <input
              id="phone"
              className="input text-lg tracking-wide"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="09XX XXX XXXX"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              aria-describedby="phone-hint phone-error"
              aria-invalid={!!error}
              required
            />
            <p id="phone-hint" className="mt-1 text-muted">
              {t('phoneHint')}
            </p>
            {error && <FieldError id="phone-error">{error}</FieldError>}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('sending') : t('sendCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="card space-y-4" noValidate>
          <p>{t('codeSent', { phone: formatPhMobile(phone) })}</p>
          {isEmulator && <p className="text-muted">{t('emulatorHint')}</p>}
          <div>
            <label htmlFor="code" className="label">
              {t('codeLabel')}
            </label>
            <input
              id="code"
              className="input text-center text-2xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-describedby="code-error"
              aria-invalid={!!error}
              autoFocus
              required
            />
            {error && <FieldError id="code-error">{error}</FieldError>}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? t('verifying') : t('verify')}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
          >
            {t('changeNumber')}
          </button>
        </form>
      )}
      <div id="recaptcha-container" />
    </div>
  );
}
