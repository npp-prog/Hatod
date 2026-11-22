'use client';

import { useEffect, useState } from 'react';
import { soundUnlocked, unlockSound } from '@/lib/alertSound';

/** Browsers need one tap before they let a page make sound. */
export function SoundToggle({ label, readyLabel }: { label: string; readyLabel: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(soundUnlocked()), []);
  if (on) return <p className="text-sm text-muted">{`🔔 ${readyLabel}`}</p>;
  return (
    <button type="button" className="btn-secondary w-full" onClick={async () => setOn(await unlockSound())}>
      {`🔔 ${label}`}
    </button>
  );
}
