import { describe, expect, it } from 'vitest';
import poolFile from '../../../content/placement.json';
import type { PlacementAnswer } from '../events/types';
import { seededRandom } from '../random';
import {
  CHECKS,
  decreasing,
  FAKES,
  makeChecks,
  makeTest,
  score,
  WORDS_PER_BAND,
  type PlacementPool,
} from './placement';

const pool = poolFile as unknown as PlacementPool;

/** Answers as someone who knows every word up to `lastKnownBand` and nothing rarer. */
function answersFor(lastKnownBand: number, fakeYes = 0): PlacementAnswer[] {
  const test = makeTest(pool, new Set(), seededRandom(1));
  let fakes = 0;
  return test.map((item) => ({
    word: item.word,
    ...(item.band !== undefined && { band: item.band }),
    yes: item.band === undefined ? fakes++ < fakeYes : item.band <= lastKnownBand,
  }));
}

describe('makeTest', () => {
  it('takes 5 words from each band and 20 fake words', () => {
    const test = makeTest(pool, new Set(), seededRandom(1));
    expect(test).toHaveLength(pool.bands.length * WORDS_PER_BAND + FAKES);
    for (const { band } of pool.bands) {
      expect(test.filter((i) => i.band === band)).toHaveLength(WORDS_PER_BAND);
    }
    expect(new Set(test.map((i) => i.word)).size).toBe(test.length);
  });

  it('never repeats words from an earlier test', () => {
    const first = makeTest(pool, new Set(), seededRandom(1));
    const second = makeTest(pool, new Set(first.map((i) => i.word)), seededRandom(2));
    const seen = new Set(first.map((i) => i.word));
    expect(second.filter((i) => seen.has(i.word))).toEqual([]);
  });
});

describe('makeChecks', () => {
  it('checks up to 15 "yes" words, rarest bands first, with one right meaning', () => {
    const checks = makeChecks(pool, answersFor(16), seededRandom(3));
    expect(checks).toHaveLength(CHECKS);
    expect(checks[0]!.band).toBe(16);
    for (const check of checks) {
      expect(check.options).toHaveLength(4);
      expect(check.options.filter((o) => o.right)).toHaveLength(1);
      const word = pool.words.find((w) => w.word === check.word)!;
      expect(check.options.find((o) => o.right)!.text).toBe(word.gloss);
    }
  });

  it('only checks words you said yes to', () => {
    const answers = answersFor(2);
    const yes = new Set(answers.filter((a) => a.yes).map((a) => a.word));
    const checks = makeChecks(pool, answers, seededRandom(3));
    expect(checks).toHaveLength(10);
    for (const c of checks) expect(yes.has(c.word)).toBe(true);
  });
});

describe('decreasing', () => {
  it('pools neighbours so shares never rise towards rarer bands', () => {
    const close = (got: number[], want: number[]) =>
      want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 10));
    close(decreasing([1, 0.8, 1, 0.4, 0.6, 0]), [1, 0.9, 0.9, 0.5, 0.5, 0]);
    close(decreasing([0.2, 0.4]), [0.3, 0.3]);
  });
});

describe('score', () => {
  it('finds the frontier where knowledge drops off', () => {
    const result = score(pool, answersFor(10));
    expect(result.bands.slice(0, 10).every((b) => b.known === 1)).toBe(true);
    expect(result.bands.slice(10).every((b) => b.known === 0)).toBe(true);
    // Ranks 1,000 to the end of band 10 (about 9,000 headwords), plus the commonest 1,000.
    const expected = 1000 + pool.bands.slice(0, 10).reduce((n, b) => n + b.size, 0);
    expect(result.size).toBe(Math.round(expected / 100) * 100);
    expect(result.low).toBeLessThan(result.size);
    expect(result.high).toBeGreaterThan(result.size);
    expect(result.frontier).toHaveLength(1);
  });

  it('marks the bands where you know some of the words as the frontier', () => {
    const answers = answersFor(16).map((a) =>
      a.band !== undefined && a.band >= 11 && a.band <= 13
        ? { ...a, yes: a.word.length % 2 === 0 }
        : a.band !== undefined && a.band > 13
          ? { ...a, yes: false }
          : a,
    );
    const result = score(pool, answers);
    for (const band of result.frontier) expect(band).toBeGreaterThanOrEqual(11);
  });

  it('discounts "yes" answers when you claim fake words', () => {
    // Half of each rarer band known: those are the answers that could be guesses.
    const partly = (fakeYes: number) =>
      answersFor(10, fakeYes).map((a) =>
        a.band && a.band > 10 ? { ...a, yes: a.word.length % 2 === 0 } : a,
      );
    const honest = score(pool, partly(0));
    const claiming = score(pool, partly(5));
    expect(claiming.falseAlarms).toBe(0.25);
    expect(claiming.size).toBeLessThan(honest.size);
  });

  it('discounts "yes" answers that fail the meaning check', () => {
    const answers = answersFor(16);
    const checked = answers.map((a, i) => (a.band ? { ...a, checked: i % 2 === 0 } : a));
    expect(score(pool, checked).size).toBeLessThan(score(pool, answers).size);
  });
});
