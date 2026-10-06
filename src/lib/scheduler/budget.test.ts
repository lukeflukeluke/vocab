import { describe, expect, it } from 'vitest';
import { replay } from '../state/reducer';
import { DEFAULT_SETTINGS } from '../state/state';
import { added, at, reviewed } from '../testing/history';
import {
  answerSeconds,
  INTRO_CHECKS,
  minutesForDay,
  NEW_WORDS_BY_MINUTES,
  newWordsFor,
  OVERHEAD_SECONDS,
  paceFromHistory,
  WORD_PAGE_SECONDS,
} from './budget';
import { dayOfDate } from './day';

describe('minutesForDay', () => {
  const monday = dayOfDate('2026-10-05');
  const saturday = dayOfDate('2026-10-10');

  it('uses the weekend time on Saturday and Sunday when set', () => {
    const settings = { ...DEFAULT_SETTINGS, dailyMinutes: 10, weekendMinutes: 30 };
    expect(minutesForDay(settings, monday)).toBe(10);
    expect(minutesForDay(settings, saturday)).toBe(30);
    expect(minutesForDay({ ...settings, weekendMinutes: null }, saturday)).toBe(10);
  });

  it('keeps the time between 5 and 45 minutes', () => {
    expect(minutesForDay({ ...DEFAULT_SETTINGS, dailyMinutes: 1 }, monday)).toBe(5);
    expect(minutesForDay({ ...DEFAULT_SETTINGS, dailyMinutes: 90 }, monday)).toBe(45);
  });
});

describe('newWordsFor', () => {
  it('reads the table and interpolates between rows', () => {
    for (const [minutes, words] of NEW_WORDS_BY_MINUTES) expect(newWordsFor(minutes)).toBe(words);
    expect(newWordsFor(1)).toBe(NEW_WORDS_BY_MINUTES[0]![1]);
    expect(newWordsFor(100)).toBe(NEW_WORDS_BY_MINUTES[NEW_WORDS_BY_MINUTES.length - 1]![1]);
    expect(newWordsFor(25)).toBeGreaterThanOrEqual(newWordsFor(20));
    expect(newWordsFor(25)).toBeLessThanOrEqual(newWordsFor(30));
  });

  it('never gives fewer new words for more time', () => {
    for (let m = 5; m < 45; m++) expect(newWordsFor(m + 1)).toBeGreaterThanOrEqual(newWordsFor(m));
  });
});

describe('paceFromHistory', () => {
  it('uses defaults until there are enough answers', () => {
    const pace = paceFromHistory(replay([]));
    expect(pace.recognition).toBeGreaterThan(OVERHEAD_SECONDS);
    expect(pace.production).toBeGreaterThan(pace.recognition);
    expect(pace.intro).toBe(WORD_PAGE_SECONDS + INTRO_CHECKS * pace.recognition);
  });

  it('learns your speed from recent answers, capping very slow ones', () => {
    const events = [added('w', 0)];
    for (let i = 0; i < 30; i++) {
      events.push(reviewed('w', 'recognition', at(1) + i * 60_000, 3, i === 0 ? 600_000 : 2000));
      events.push(reviewed('w', 'production', at(1) + i * 60_000 + 30_000, 3, 4000));
    }
    const pace = paceFromHistory(replay(events));
    const expectedRecognition = (answerSeconds(600_000) + 29 * answerSeconds(2000)) / 30;
    expect(pace.recognition).toBeCloseTo(expectedRecognition, 6);
    expect(answerSeconds(600_000)).toBe(60 + OVERHEAD_SECONDS);
    expect(pace.production).toBeCloseTo(4 + OVERHEAD_SECONDS, 6);
  });
});
