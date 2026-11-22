'use client';

import type { CsvIssue } from '@hatod/shared';
import { httpsCallable } from 'firebase/functions';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { PageTitle, Spinner } from '@/components/ui';
import { fetchBarangays, fetchTown, type Barangay, type Town } from '@/lib/data/places';
import { firebase } from '@/lib/firebase/client';
import { TownForm } from '../TownForm';

export function TownEditor({ townId }: { townId: string }) {
  const t = useTranslations('admin.towns');
  const tc = useTranslations('common');
  const [town, setTown] = useState<Town | null | undefined>(undefined);
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);

  const loadBarangays = useCallback(() => fetchBarangays(townId).then(setBarangays), [townId]);
  useEffect(() => {
    fetchTown(townId).then(setTown);
    void loadBarangays();
  }, [townId, loadBarangays]);

  if (town === undefined) return <Spinner label={tc('loading')} />;
  if (town === null) return <p className="card">{t('errors.generic')}</p>;

  return (
    <div className="space-y-6">
      <PageTitle>
        {town.name} · {town.province}
      </PageTitle>
      <TownForm town={town} />

      <section className="card space-y-4" aria-labelledby="brgy-title">
        <h2 id="brgy-title" className="text-lg font-bold">
          {t('barangaysTitle')} · {t('barangayCount', { count: barangays?.length ?? 0 })}
        </h2>
        {barangays && barangays.length > 0 && (
          <ul className="columns-2 gap-4 sm:columns-3">
            {barangays.map((b) => (
              <li key={b.id} className="break-inside-avoid py-1">
                {b.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <BarangayImport townId={townId} onDone={loadBarangays} />
    </div>
  );
}

function BarangayImport({ townId, onDone }: { townId: string; onDone: () => void }) {
  const t = useTranslations('admin.towns');
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; issues: CsvIssue[] } | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    setResult(null);
    try {
      const res = await httpsCallable<unknown, { created: number; updated: number; issues: CsvIssue[] }>(
        firebase().functions,
        'adminImportBarangays',
      )({ townId, csv });
      setResult(res.data);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4" aria-labelledby="import-title">
      <h2 id="import-title" className="text-lg font-bold">
        {t('importTitle')}
      </h2>
      <p className="text-muted">{t('importHint')}</p>
      <div>
        <label htmlFor="csvfile" className="label">
          {t('importFile')}
        </label>
        <input
          id="csvfile"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="block min-h-12"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
      </div>
      <div>
        <label htmlFor="csvtext" className="label">
          {t('importPaste')}
        </label>
        <textarea
          id="csvtext"
          className="input min-h-40 py-3 font-mono text-sm"
          placeholder={'name,lat,lng\nPoblacion,11.105,122.643'}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
      </div>
      <button type="button" className="btn-primary" disabled={busy || !csv.trim()} onClick={run}>
        {busy ? t('importing') : t('importButton')}
      </button>
      {failed && <p role="alert" className="text-danger">{t('errors.generic')}</p>}
      {result && (
        <div role="status" className="space-y-2">
          <p className="font-semibold text-ok">{t('importResult', { created: result.created, updated: result.updated })}</p>
          {result.issues.length > 0 && (
            <>
              <p className="font-semibold">{t('importIssues')}</p>
              <ul className="list-disc pl-6">
                {result.issues.map((i) => (
                  <li key={`${i.line}-${i.code}`}>
                    {t('issue', { line: i.line, problem: t(`issueCodes.${i.code}`) })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
