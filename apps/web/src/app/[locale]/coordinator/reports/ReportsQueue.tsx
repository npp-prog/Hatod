'use client';

import { hasRole } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTime } from '@/components/orders/OrderBits';
import { FieldError, PageTitle, Spinner } from '@/components/ui';
import { resolveReport, watchReports, type Report } from '@/lib/data/trust';
import { callableMessage } from '@/lib/firebase/errors';

/** The town's trust and safety queue. Admins see every town. */
export function ReportsQueue() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const { claims } = useAuth();
  const towns = hasRole(claims.roles, 'admin') ? null : (claims.coordTowns ?? []);
  const townsKey = towns?.join() ?? '*';
  const [open, setOpen] = useState<Report[] | null>(null);
  const [resolved, setResolved] = useState<Report[]>([]);

  useEffect(() => {
    if (towns && towns.length === 0) return setOpen([]);
    const a = watchReports(towns, 'open', setOpen);
    const b = watchReports(towns, 'resolved', setResolved);
    return () => {
      a();
      b();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [townsKey]);

  if (!open) return <Spinner label={tc('loading')} />;
  // Urgent first, then oldest first: the queue is worked from the top.
  const sorted = [...open].sort((a, b) => Number(b.urgent) - Number(a.urgent));
  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{t('title')}</PageTitle>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <section className="space-y-3" aria-labelledby="open-title">
        <h2 id="open-title" className="text-xl font-bold">{`${t('open')} (${open.length})`}</h2>
        {sorted.length === 0 ? <p className="card">{t('empty')}</p> : sorted.map((r) => <ReportCard key={r.id} report={r} />)}
      </section>
      {resolved.length > 0 && (
        <section className="space-y-2" aria-labelledby="done-title">
          <h2 id="done-title" className="text-lg font-bold">
            {t('resolved')}
          </h2>
          <ul className="space-y-2">
            {resolved.slice(0, 20).map((r) => (
              <li key={r.id} className="card p-3">
                <ReportSummary report={r} />
                <p className={`mt-1 font-semibold ${r.resolution === 'confirmed' ? 'text-danger' : 'text-ok'}`}>
                  {`${r.resolution === 'confirmed' ? t('confirmed') : t('dismissed')}: ${r.note ?? ''}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReportSummary({ report }: { report: Report }) {
  const t = useTranslations('reports');
  const tt = useTranslations('trust');
  const to = useTranslations('orders');
  const time = useTime();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {report.urgent && <span className="rounded-full bg-danger px-3 py-1 text-sm font-bold text-white">{t('urgent')}</span>}
        <span className="mr-auto font-bold">{tt(`categories.${report.category}`)}</span>
        <span className="text-sm text-muted">{time(report.createdAt, true)}</span>
      </div>
      <p>{t('about', { type: tt(`reportTarget.${report.targetType}`), name: report.targetName })}</p>
      <p className="text-sm text-muted">
        {`${t('by', { role: to(`who.${report.reporterRole}`) })} · ${t('order', { code: report.orderCode })}`}
      </p>
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  const t = useTranslations('reports');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(resolution: 'confirmed' | 'dismissed') {
    if (note.trim().length < 3) return setError(t('noteRequired'));
    setBusy(true);
    setError(null);
    try {
      await resolveReport({ reportId: report.id, resolution, note });
    } catch (e) {
      setError(callableMessage(e) ?? 'error');
      setBusy(false);
    }
  }

  return (
    <article className={`card space-y-3 ${report.urgent ? 'border-4 border-danger' : ''}`}>
      <ReportSummary report={report} />
      {report.suspendedOnReport && <p className="font-semibold text-danger">{t('suspendedNow')}</p>}
      <blockquote className="rounded-xl bg-page p-3">{report.details}</blockquote>
      <label className="block">
        <span className="label">{t('note')}</span>
        <textarea className="input min-h-16 py-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <FieldError id={`rep-${report.id}`}>{error}</FieldError>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => decide('dismissed')}>
          {t('dismiss')}
        </button>
        <button type="button" className="btn-primary bg-danger" disabled={busy} onClick={() => decide('confirmed')}>
          {t('confirm')}
        </button>
      </div>
    </article>
  );
}
