'use client';

import { MAX_ADDRESSES_PER_USER } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTown } from '@/components/TownProvider';
import { PageTitle, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { deleteAddress, makeDefault } from '@/lib/data/addresses';
import type { Address } from '@/lib/data/places';
import { useAddresses } from '@/lib/data/useAddresses';

export function AddressList() {
  const t = useTranslations('addresses');
  const tc = useTranslations('common');
  const { addresses, error } = useAddresses();
  const { town } = useTown();
  const [note, setNote] = useState<string | null>(null);

  if (error) return <p role="alert">{tc('tryAgain')}</p>;
  if (!addresses) return <Spinner label={tc('loading')} />;

  const atLimit = addresses.length >= MAX_ADDRESSES_PER_USER;

  async function run(action: () => Promise<'saved' | 'queued'>, done: string) {
    const r = await action();
    setNote(r === 'queued' ? t('queued') : done);
  }

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      {note && (
        <p role="status" className="font-semibold text-ok">
          {note}
        </p>
      )}

      {addresses.length === 0 && <p className="card">{t('empty')}</p>}

      <ul className="space-y-3">
        {addresses.map((a) => (
          <AddressCard
            key={a.id}
            address={a}
            otherTown={!!town && a.townId !== town.id}
            onDefault={() => run(() => makeDefault(a, addresses), t('saved'))}
            onDelete={() => {
              if (window.confirm(t('confirmDelete'))) void run(() => deleteAddress(a, addresses), t('deleted'));
            }}
          />
        ))}
      </ul>

      {atLimit ? (
        <p className="card">{t('limitReached', { max: MAX_ADDRESSES_PER_USER })}</p>
      ) : town ? (
        <Link href="/addresses/new" className="btn-primary w-full">
          {t('add')}
        </Link>
      ) : (
        <div className="card space-y-3">
          <p>{t('needTown')}</p>
          <Link href="/town" className="btn-primary">
            {tc('continue')}
          </Link>
        </div>
      )}
    </div>
  );
}

function AddressCard({
  address: a,
  otherTown,
  onDefault,
  onDelete,
}: {
  address: Address;
  otherTown: boolean;
  onDefault: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('addresses');
  return (
    <li className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold">{a.label}</h2>
        {a.isDefault && <span className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">{t('default')}</span>}
        {otherTown && <span className="rounded-full bg-line px-3 py-1 text-sm font-semibold">{t('otherTown')}</span>}
      </div>
      <p>{a.landmark}</p>
      <p className="text-muted">{[a.street, `Brgy. ${a.barangayName}`].filter(Boolean).join(', ')}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/addresses/${a.id}`} className="btn-secondary">
          {t('edit')}
        </Link>
        {!a.isDefault && (
          <button type="button" className="btn-ghost" onClick={onDefault}>
            {t('makeDefault')}
          </button>
        )}
        <button type="button" className="btn-ghost text-danger" onClick={onDelete}>
          {t('delete')}
        </button>
      </div>
    </li>
  );
}
