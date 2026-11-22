import { describe, expect, it } from 'vitest';
import { dayRangesProblem, formatTime12, manilaParts, openStatus, weeklyHoursSchema, type WeeklyHours } from '../src';

// 2026-11-23 is a Monday. All times below are Manila time.
const at = (local: string) => new Date(`${local}+08:00`);

const carinderia: WeeklyHours = {
  mon: [{ open: '06:00', close: '14:00' }, { open: '16:00', close: '20:00' }],
  tue: [{ open: '06:00', close: '20:00' }],
  wed: [{ open: '06:00', close: '20:00' }],
  thu: [{ open: '06:00', close: '20:00' }],
  fri: [{ open: '06:00', close: '20:00' }],
  sat: [{ open: '07:00', close: '12:00' }],
  // closed Sunday
};

describe('manilaParts', () => {
  it('reads day, minutes and date in Manila, not UTC', () => {
    // 2026-11-22T20:30Z is already Monday 04:30 in Manila
    expect(manilaParts(new Date('2026-11-22T20:30:00Z'))).toEqual({ day: 'mon', minutes: 270, date: '2026-11-23' });
  });
});

describe('openStatus', () => {
  it('is open inside a range and says when it closes', () => {
    expect(openStatus({ hours: carinderia }, at('2026-11-23T10:00'))).toEqual({ open: true, closesAt: '14:00', opensAt: null });
  });
  it('is closed in a lunch gap and opens later today', () => {
    expect(openStatus({ hours: carinderia }, at('2026-11-23T15:00'))).toEqual({
      open: false,
      closesAt: null,
      opensAt: { day: 'mon', time: '16:00', daysAhead: 0 },
    });
  });
  it('treats close time as exclusive and open time as inclusive', () => {
    expect(openStatus({ hours: carinderia }, at('2026-11-23T14:00')).open).toBe(false);
    expect(openStatus({ hours: carinderia }, at('2026-11-23T16:00')).open).toBe(true);
  });
  it('skips a closed day to find the next opening', () => {
    // Saturday 13:00 -> closed Sunday -> Monday 06:00
    expect(openStatus({ hours: carinderia }, at('2026-11-28T13:00')).opensAt).toEqual({ day: 'mon', time: '06:00', daysAhead: 2 });
  });
  it('handles a session that runs past midnight', () => {
    const night: WeeklyHours = { fri: [{ open: '18:00', close: '02:00' }] };
    // Friday 2026-11-27 23:00 and Saturday 01:30 are both inside Friday's session
    expect(openStatus({ hours: night }, at('2026-11-27T23:00'))).toMatchObject({ open: true, closesAt: '02:00' });
    expect(openStatus({ hours: night }, at('2026-11-28T01:30'))).toMatchObject({ open: true, closesAt: '02:00' });
    expect(openStatus({ hours: night }, at('2026-11-28T02:00')).open).toBe(false);
  });
  it('supports 24:00 as end of day', () => {
    const late: WeeklyHours = { mon: [{ open: '20:00', close: '24:00' }] };
    expect(openStatus({ hours: late }, at('2026-11-23T23:59')).open).toBe(true);
    expect(openStatus({ hours: late }, at('2026-11-24T00:00')).open).toBe(false);
  });
  it('"closed today" cancels today\'s sessions and finds tomorrow', () => {
    const s = openStatus({ hours: carinderia, closedOn: '2026-11-23' }, at('2026-11-23T10:00'));
    expect(s).toEqual({ open: false, closesAt: null, opensAt: { day: 'tue', time: '06:00', daysAhead: 1 } });
  });
  it('"closed today" from yesterday has no effect', () => {
    expect(openStatus({ hours: carinderia, closedOn: '2026-11-22' }, at('2026-11-23T10:00')).open).toBe(true);
  });
  it('"closed today" does not cut short last night\'s session', () => {
    const night: WeeklyHours = { fri: [{ open: '18:00', close: '02:00' }] };
    expect(openStatus({ hours: night, closedOn: '2026-11-28' }, at('2026-11-28T01:00')).open).toBe(true);
  });
  it('a shop with no hours never opens', () => {
    expect(openStatus({ hours: {} }, at('2026-11-23T10:00'))).toEqual({ open: false, closesAt: null, opensAt: null });
  });
});

describe('dayRangesProblem', () => {
  it('accepts normal and overnight ranges', () => {
    expect(dayRangesProblem([{ open: '06:00', close: '14:00' }, { open: '18:00', close: '02:00' }])).toBeNull();
  });
  it('rejects bad input', () => {
    expect(dayRangesProblem([{ open: '6:00', close: '14:00' }])).toBe('bad_time');
    expect(dayRangesProblem([{ open: '24:00', close: '02:00' }])).toBe('bad_time');
    expect(dayRangesProblem([{ open: '08:00', close: '08:00' }])).toBe('same_open_close');
    expect(dayRangesProblem([{ open: '08:00', close: '12:00' }, { open: '11:00', close: '15:00' }])).toBe('overlap');
    expect(
      dayRangesProblem([
        { open: '01:00', close: '02:00' },
        { open: '03:00', close: '04:00' },
        { open: '05:00', close: '06:00' },
        { open: '07:00', close: '08:00' },
      ]),
    ).toBe('too_many');
  });
});

describe('weeklyHoursSchema', () => {
  it('reports the day with the problem', () => {
    const r = weeklyHoursSchema.safeParse({ mon: [{ open: '08:00', close: '12:00' }], tue: [{ open: '09:00', close: '09:00' }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ['tue'], message: 'same_open_close' });
  });
  it('rejects unknown days', () => {
    expect(weeklyHoursSchema.safeParse({ funday: [] }).success).toBe(false);
  });
});

describe('formatTime12', () => {
  it('formats for people', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('06:05')).toBe('6:05 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('20:30')).toBe('8:30 PM');
    expect(formatTime12('24:00')).toBe('12:00 AM');
  });
});
