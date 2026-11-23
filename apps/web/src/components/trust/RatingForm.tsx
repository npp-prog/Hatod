'use client';

import { RATING_TAGS, type TargetType } from '@hatod/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FieldError } from '@/components/ui';
import { submitRating } from '@/lib/data/trust';
import { callableMessage } from '@/lib/firebase/errors';

/** Stars, quick tags and an optional comment. Shows the given rating once sent. */
export function RatingForm({ orderId, toType, title, already }: { orderId: string; toType: TargetType; title: string; already?: number }) {
  const t = useTranslations('trust');
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(already ?? null);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="flex items-center justify-between gap-2 rounded-xl bg-page p-3">
        <span className="font-semibold">{title}</span>
        <span className="text-ok">{t('rated', { n: sent })}</span>
      </p>
    );
  }

  async function send() {
    if (!stars) return setError(t('errors.stars_required'));
    setBusy(true);
    setError(null);
    try {
      await submitRating({ orderId, toType, stars, tags, comment });
      setSent(stars);
    } catch (e) {
      const code = callableMessage(e) ?? 'generic';
      setError(t.has(`errors.${code}` as 'errors.generic') ? t(`errors.${code}` as 'errors.generic') : t('errors.generic'));
      if (code === 'already_rated') setSent(stars);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-line p-3">
      <p className="font-semibold">{title}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={title}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t('starLabel', { n })}
            className={`grid size-12 place-items-center rounded-full text-3xl ${n <= stars ? 'text-warn' : 'text-line'}`}
            onClick={() => setStars(n)}
          >
            ★
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {RATING_TAGS[toType].map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  className={`chip min-h-10 text-sm ${on ? 'chip-active' : ''}`}
                  onClick={() => setTags(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
                >
                  {t(`tags.${tag}` as 'tags.tasty')}
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className="text-sm text-muted">{t('comment')}</span>
            <textarea className="input min-h-16 py-2" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        </>
      )}
      {error && <FieldError id={`rate-${toType}-error`}>{error}</FieldError>}
      <button type="button" className="btn-primary w-full" disabled={busy || !stars} onClick={send}>
        {busy ? t('sending') : t('submit')}
      </button>
    </div>
  );
}
