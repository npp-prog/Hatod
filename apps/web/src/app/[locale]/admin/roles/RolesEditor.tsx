'use client';

import { normalizePhMobile, normalizeRoles, ROLES, type Role } from '@hatod/shared';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { FieldError, PageTitle } from '@/components/ui';
import { firebase } from '@/lib/firebase/client';
import { callableMessage, firstIssueCode } from '@/lib/firebase/errors';

interface Found {
  uid: string;
  name: string;
  roles: Role[];
  coordTowns: string[];
}

const KNOWN_ERRORS = new Set(['cannot_remove_own_admin', 'coord_towns_without_role']);

/** Admin tool: look up a user by mobile number and set their roles (setUserRoles callable). */
export function RolesEditor() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const tAuth = useTranslations('auth');

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [towns, setTowns] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setFound(null);
    const e164 = normalizePhMobile(phone);
    if (!e164) {
      setMessage({ kind: 'error', text: tAuth('errors.invalidPhone') });
      return;
    }
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(firebase().db, 'users'), where('phone', '==', e164), limit(1)));
      const d = snap.docs[0];
      if (!d) {
        setMessage({ kind: 'error', text: t('roles.notFound') });
        return;
      }
      const data = d.data();
      const f: Found = {
        uid: d.id,
        name: String(data.name ?? ''),
        roles: normalizeRoles(data.roles),
        coordTowns: Array.isArray(data.coordTowns) ? data.coordTowns : [],
      };
      setFound(f);
      setRoles(f.roles);
      setTowns(f.coordTowns.join(', '));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!found) return;
    setBusy(true);
    setMessage(null);
    try {
      const coordTowns = towns
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await httpsCallable(firebase().functions, 'setUserRoles')({ uid: found.uid, roles, coordTowns });
      setMessage({ kind: 'ok', text: t('roles.saved') });
    } catch (err) {
      const code = firstIssueCode(err) ?? callableMessage(err);
      const key = code && KNOWN_ERRORS.has(code) ? code : 'generic';
      setMessage({ kind: 'error', text: t(`roles.errors.${key as 'generic'}`) });
    } finally {
      setBusy(false);
    }
  }

  function toggle(role: Role, on: boolean) {
    setRoles((prev) => normalizeRoles(on ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('roles.title')}</PageTitle>
        <p className="mt-2 text-muted">{t('roles.intro')}</p>
      </div>

      <form onSubmit={search} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="phone" className="label">
            {tAuth('phoneLabel')}
          </label>
          <input
            id="phone"
            className="input"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          {t('roles.search')}
        </button>
      </form>

      {message &&
        (message.kind === 'error' ? (
          <FieldError id="roles-msg">{message.text}</FieldError>
        ) : (
          <p className="font-semibold text-ok" role="status">
            {message.text}
          </p>
        ))}

      {found && (
        <section className="card space-y-4">
          <h2 className="text-lg font-bold">{found.name}</h2>
          <fieldset>
            <legend className="label">{t('roles.rolesLabel')}</legend>
            <ul className="space-y-1">
              {ROLES.map((role) => (
                <li key={role}>
                  <label className="flex min-h-12 items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-6 accent-brand"
                      checked={roles.includes(role)}
                      disabled={role === 'customer'}
                      onChange={(e) => toggle(role, e.target.checked)}
                    />
                    <span>{t(`roleNames.${role}`)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-muted">{t('roles.customerAlways')}</p>
          </fieldset>
          {roles.includes('coordinator') && (
            <div>
              <label htmlFor="towns" className="label">
                {t('roles.coordTownsLabel')}
              </label>
              <input id="towns" className="input" value={towns} onChange={(e) => setTowns(e.target.value)} />
            </div>
          )}
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>
            {busy ? tc('saving') : tc('save')}
          </button>
        </section>
      )}
    </div>
  );
}
