/** All business time in Hatod is Philippine time (UTC+8, no daylight saving). */
export const MANILA_TZ = 'Asia/Manila';

/** "2027-01-31" -> the last second of that day in Manila, as a Date. */
export function endOfManilaDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999+08:00`);
}

/** A Date -> "YYYY-MM-DD" as the calendar date in Manila. */
export function manilaDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
