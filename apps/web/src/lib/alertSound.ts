'use client';

/**
 * A loud, repeating two-tone alert made with the Web Audio API (no sound file
 * to download). Browsers only allow sound after the person has tapped the
 * page once, so screens show a "Turn on sound" button until unlocked.
 */
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function soundUnlocked(): boolean {
  return !!ctx && ctx.state === 'running';
}

export async function unlockSound(): Promise<boolean> {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    if (ctx.state !== 'running') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

function beep(freq: number, start: number, dur: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
}

/** Starts repeating every 2.5 seconds until stopAlert(). Also vibrates where supported. */
export function startAlert() {
  if (timer) return;
  const ring = () => {
    beep(880, 0, 0.18);
    beep(660, 0.22, 0.18);
    beep(880, 0.44, 0.18);
    navigator.vibrate?.([200, 100, 200]);
  };
  ring();
  timer = setInterval(ring, 2500);
}

export function stopAlert() {
  if (timer) clearInterval(timer);
  timer = null;
}
