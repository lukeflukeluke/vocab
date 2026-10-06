import { DAY_MS } from './memory';

/** A study day runs from 4am to 4am local time, so late-night study counts for that day. */
export const DAY_START_HOUR = 4;

/**
 * The study day a moment falls on, as days since 1970-01-01 (local). `tzOffsetMinutes`
 * is minutes to add to UTC for local time, i.e. `-new Date().getTimezoneOffset()`.
 */
export function studyDay(t: number, tzOffsetMinutes: number): number {
  return Math.floor((t + tzOffsetMinutes * 60_000 - DAY_START_HOUR * 3_600_000) / DAY_MS);
}

/** The study day of a local calendar date written as YYYY-MM-DD. */
export function dayOfDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

/** 0 is Sunday, 6 is Saturday. 1970-01-01 was a Thursday. */
export function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function isWeekend(day: number): boolean {
  const d = weekday(day);
  return d === 0 || d === 6;
}
