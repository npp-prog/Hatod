'use client';

import { canAccessArea, type Area } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from './AuthProvider';
import { Spinner } from './ui';

/**
 * Client-side guard for an app area. It only decides what to SHOW; the real
 * protection is Firestore/Storage rules and role checks in Cloud Functions.
 */
export function RoleGate({ area, requireSignIn = true, children }: { area: Area; requireSignIn?: boolean; children: ReactNode }) {
  const { loading, user, claims, needsProfile, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  const mustSignIn = requireSignIn && !loading && !user;
  const mustCompleteProfile = !loading && needsProfile;

  useEffect(() => {
    if (mustSignIn) router.replace({ pathname: '/auth', query: { next: pathname } });
    else if (mustCompleteProfile) router.replace({ pathname: '/auth/profile', query: { next: pathname } });
  }, [mustSignIn, mustCompleteProfile, router, pathname]);

  if (loading || mustSignIn || mustCompleteProfile) return <Spinner label={t('common.loading')} />;

  if (status === 'suspended' || status === 'banned') {
    return <Notice title={t('gate.suspended')} />;
  }

  if (!canAccessArea(claims.roles, area)) {
    return (
      <Notice title={t('gate.notAllowedTitle')} body={t('gate.notAllowedBody')}>
        <Link href="/" className="btn-secondary mt-4">
          {t('common.goHome')}
        </Link>
      </Notice>
    );
  }

  return <>{children}</>;
}

function Notice({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <section className="card mx-auto mt-8 max-w-md text-center" role="alert">
      <h1 className="text-lg font-bold">{title}</h1>
      {body && <p className="mt-2 text-muted">{body}</p>}
      {children}
    </section>
  );
}
