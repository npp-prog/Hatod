'use client';

import { REPORT_CATEGORIES_FOR, submitReportInput, type ReportCategory, type TargetType } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { FieldError } from '@/components/ui';
import { submitReport } from '@/lib/data/trust';
import { callableMessage } from '@/lib/firebase/errors';

/** "Report a problem": a small sheet to report someone on this order. */
export function ReportButton({ orderId, targets }: { orderId: string; targets: TargetType[] }) {
  const t = useTranslations('trust');
  const [open, setOpen] = useState(false);
  if (targets.length === 0) return null;
  return (
    <>
      <button type="button" className="btn-ghost w-full text-muted underline" onClick={() => setOpen(true)}>
        {t('report')}
      </button>
      {open && <ReportSheet orderId={orderId} targets={targets} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportSheet({ orderId, targets, onClose }: { orderId: string; targets: TargetType[]; onClose: () => void }) {
  const t = useTranslations('trust');
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<TargetType>(targets[0]!);
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const msg = (code: string) => (t.has(`errors.${code}` as 'errors.generic') ? t(`errors.${code}` as 'errors.generic') : t('errors.generic'));

  async function send() {
    const parsed = submitReportInput.safeParse({ orderId, targetType: target, category: category || 'other', details });
    if (!category) return setError(t('reportCategory'));
    if (!parsed.success) return setError(msg(parsed.error.issues[0]?.message ?? 'generic'));
    setBusy(true);
    setError(null);
    try {
      await submitReport(parsed.data);
      setSent(true);
    } catch (e) {
      setError(msg(callableMessage(e) ?? 'generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-3xl p-0 backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
      aria-labelledby="report-title"
    >
      <div className="space-y-4 p-5">
        <h2 id="report-title" className="text-xl font-bold">
          {t('reportTitle')}
        </h2>
        {sent ? (
          <p role="status" className="font-semibold text-ok">
            {t('reportSent')}
          </p>
        ) : (
          <>
            {targets.length > 1 && (
              <fieldset>
                <legend className="label">{t('reportAbout')}</legend>
                <div className="flex flex-wrap gap-2">
                  {targets.map((x) => (
                    <label key={x} className={`chip cursor-pointer ${target === x ? 'chip-active' : ''}`}>
                      <input type="radio" name="target" className="sr-only" checked={target === x} onChange={() => (setTarget(x), setCategory(''))} />
                      {t(`reportTarget.${x}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend className="label">{t('reportCategory')}</legend>
              <ul className="space-y-1">
                {REPORT_CATEGORIES_FOR[target].map((c) => (
                  <li key={c}>
                    <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line px-3 has-[:checked]:border-brand">
                      <input type="radio" name="category" className="size-6 accent-brand" checked={category === c} onChange={() => setCategory(c)} />
                      <span>{t(`categories.${c}`)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            {category === 'safety' && <p className="font-semibold text-danger">{t('safetyNote')}</p>}
            <label className="block">
              <span className="label">{t('reportDetails')}</span>
              <textarea className="input min-h-28 py-3" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} aria-describedby="report-hint" />
              <span id="report-hint" className="mt-1 block text-sm text-muted">
                {t('reportDetailsHint')}
              </span>
            </label>
            {error && <FieldError id="report-error">{error}</FieldError>}
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={send}>
              {busy ? t('sending') : t('sendReport')}
            </button>
          </>
        )}
        <button type="button" className="btn-ghost w-full" onClick={() => ref.current?.close()}>
          {t('close')}
        </button>
      </div>
    </dialog>
  );
}
