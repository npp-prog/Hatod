import { MANILA_TZ } from './time';

/**
 * Shop opening hours. Times are "HH:MM" in Philippine time. A range whose
 * close is at or before its open runs past midnight (18:00–02:00). "24:00"
 * means midnight at the end of the day.
 */
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
export interface TimeRange {
  open: string;
  close: string;
}
export type WeeklyHours = Partial<Record<Day, TimeRange[]>>;

export const MAX_RANGES_PER_DAY = 3;
export const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

export function fromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const WEEKDAY_TO_DAY: Record<string, Day> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

/** Day of week, minutes since midnight and calendar date, all in Manila. */
export function manilaParts(now: Date): { day: Day; minutes: number; date: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: MANILA_TZ,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: WEEKDAY_TO_DAY[parts.weekday!]!,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** The Manila calendar date `offset` days from `date` ("YYYY-MM-DD"). */
function addDays(date: string, offset: number): string {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const dayAt = (day: Day, offset: number): Day => DAYS[(DAYS.indexOf(day) + offset + 7 * 10) % 7]!;

/** A range as [start, end) minutes from the start of its own day; end may exceed 1440. */
function span(r: TimeRange): [number, number] {
  const s = toMinutes(r.open);
  let e = toMinutes(r.close);
  if (e <= s) e += 1440;
  return [s, e];
}

export interface OpenStatus {
  open: boolean;
  /** When open: "HH:MM" the current session ends. */
  closesAt: string | null;
  /** When closed: the next opening within a week. daysAhead 0 = later today. */
  opensAt: { day: Day; time: string; daysAhead: number } | null;
}

/**
 * Whether a shop is open at `now`. `closedOn` ("YYYY-MM-DD", the shop's
 * "closed today" switch) cancels every session that STARTS on that date; a
 * late-night session that began the day before is not cut short.
 */
export function openStatus(shop: { hours: WeeklyHours; closedOn?: string | null }, now: Date): OpenStatus {
  const { day, minutes, date } = manilaParts(now);
  const closed = (offset: number) => !!shop.closedOn && shop.closedOn === addDays(date, offset);

  // Sessions that started today, or yesterday and run past midnight.
  for (const offset of [0, -1]) {
    if (closed(offset)) continue;
    for (const r of shop.hours[dayAt(day, offset)] ?? []) {
      const [s, e] = span(r);
      const t = minutes - offset * 1440;
      if (t >= s && t < e) return { open: true, closesAt: fromMinutes(e), opensAt: null };
    }
  }

  for (let offset = 0; offset <= 7; offset++) {
    if (closed(offset)) continue;
    const starts = (shop.hours[dayAt(day, offset)] ?? [])
      .map((r) => toMinutes(r.open))
      .filter((s) => offset > 0 || s > minutes)
      .sort((a, b) => a - b);
    if (starts.length) return { open: false, closesAt: null, opensAt: { day: dayAt(day, offset), time: fromMinutes(starts[0]!), daysAhead: offset } };
  }
  return { open: false, closesAt: null, opensAt: null };
}

/** Checks one day's ranges: valid times, open != close, no overlaps, at most one past midnight (last). */
export function dayRangesProblem(ranges: TimeRange[]): 'bad_time' | 'same_open_close' | 'overlap' | 'too_many' | null {
  if (ranges.length > MAX_RANGES_PER_DAY) return 'too_many';
  for (const r of ranges) {
    if (!TIME_RE.test(r.open) || !TIME_RE.test(r.close) || r.open === '24:00') return 'bad_time';
    if (r.open === r.close) return 'same_open_close';
  }
  const spans = ranges.map(span).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) if (spans[i]![0] < spans[i - 1]![1]) return 'overlap';
  return null;
}

/** 24-hour "13:30" -> "1:30 PM" for display. */
export function formatTime12(hhmm: string): string {
  const mins = toMinutes(hhmm === '24:00' ? '00:00' : hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
