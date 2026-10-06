import { describe, expect, it } from 'vitest';
import { dayOfDate, isWeekend, studyDay, weekday } from './day';

const HOUR = 3_600_000;

describe('studyDay', () => {
  const tuesday = dayOfDate('2026-10-06');

  it('rolls over at 4am local time, not midnight', () => {
    const tz = 60; // UK summer time
    const local = (hour: number) => Date.UTC(2026, 9, 6, hour) - tz * 60_000;
    expect(studyDay(local(9), tz)).toBe(tuesday);
    expect(studyDay(local(23), tz)).toBe(tuesday);
    expect(studyDay(local(24 + 1), tz)).toBe(tuesday); // 1am Wednesday still counts as Tuesday
    expect(studyDay(local(24 + 4), tz)).toBe(tuesday + 1);
    expect(studyDay(local(3), tz)).toBe(tuesday - 1);
  });

  it('uses the local time zone', () => {
    const t = Date.UTC(2026, 9, 6, 2); // 2am UTC
    expect(studyDay(t, 0)).toBe(tuesday - 1); // 2am in London (winter): still Monday's day
    expect(studyDay(t, 10 * 60)).toBe(tuesday); // noon in Sydney
    expect(studyDay(t + 5 * HOUR, -5 * 60)).toBe(tuesday - 1); // 2am in New York
  });
});

describe('dayOfDate', () => {
  it('reads YYYY-MM-DD', () => {
    expect(dayOfDate('1970-01-01')).toBe(0);
    expect(dayOfDate('1970-01-02')).toBe(1);
    expect(() => dayOfDate('6 Oct 2026')).toThrow();
  });
});

describe('weekday', () => {
  it('knows the day of the week', () => {
    expect(weekday(dayOfDate('2026-10-06'))).toBe(2); // Tuesday
    expect(isWeekend(dayOfDate('2026-10-10'))).toBe(true); // Saturday
    expect(isWeekend(dayOfDate('2026-10-11'))).toBe(true); // Sunday
    expect(isWeekend(dayOfDate('2026-10-12'))).toBe(false); // Monday
    expect(weekday(-1)).toBe(3); // 1969-12-31, a Wednesday
  });
});
