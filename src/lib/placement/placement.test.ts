import { describe, expect, it } from 'vitest';
import poolFile from '../../../content/placement.json';
import type { PlacementAnswer } from '../events/types';
import { seededRandom } from '../random';
import {
  AdaptiveTest,
  COMMONEST,
  FAKES,
  givesAway,
  makeCheck,
  MAX_CHECKS,
  posterior,
  QUESTIONS,
  score,
  type PlacementPool,
} from './placement';

const pool = poolFile as unknown as PlacementPool;

/**
 * Takes a whole test as someone who knows every word up to `lastKnownBand` and nothing
 * rarer, never claims made-up words, and passes checks on words they know.
 */
function take(lastKnownBand: number, options: { claimFakes?: boolean; seed?: number } = {}) {
  const test = new AdaptiveTest(pool, new Set(), seededRandom(options.seed ?? 1));
  const bandsAsked: number[] = [];
  let checks = 0;
  for (let q = test.next(); q.kind !== 'done'; q = test.next()) {
    if (q.kind === 'word') {
      if (q.band === undefined) test.answerWord(options.claimFakes ?? false);
      else {
        bandsAsked.push(q.band);
        test.answerWord(q.band <= lastKnownBand);
      }
    } else {
      checks += 1;
      test.answerCheck(q.check.band <= lastKnownBand);
    }
  }
  return { test, bandsAsked, checks };
}

/** The true vocabulary size of someone who knows exactly bands 1 to `last`. */
const sizeUpTo = (last: number) =>
  COMMONEST + pool.bands.filter((b) => b.band <= last).reduce((n, b) => n + b.size, 0);

describe('AdaptiveTest', () => {
  it('asks 50 questions, 8 of them made-up words, and never repeats a word', () => {
    const { test } = take(10);
    expect(test.asked).toBe(QUESTIONS);
    expect(test.answers.filter((a) => a.band === undefined)).toHaveLength(FAKES);
    const words = test.answers.map((a) => a.word);
    expect(new Set(words).size).toBe(words.length);
  });

  it('picks made-up words at random, not in alphabetical order', () => {
    const fakes = take(10)
      .test.answers.filter((a) => a.band === undefined)
      .map((a) => a.word);
    expect(fakes).not.toEqual([...fakes].sort());
    expect(new Set(fakes.map((f) => f[0])).size).toBeGreaterThan(2);
  });

  it('starts easy, then climbs while you know the words', () => {
    const strong = take(16).bandsAsked;
    expect(strong.slice(0, 3)).toEqual([3, 5, 7]);
    const late = strong.slice(-10);
    expect(Math.min(...late)).toBeGreaterThanOrEqual(12);
  });

  it('settles around your edge', () => {
    const { bandsAsked } = take(6);
    const late = bandsAsked.slice(-15);
    const mean = late.reduce((a, b) => a + b, 0) / late.length;
    expect(mean).toBeGreaterThan(4.5);
    expect(mean).toBeLessThan(8.5);
  });

  it('checks some "yes" answers on the spot, at most 10', () => {
    const { test, checks } = take(12);
    expect(checks).toBeGreaterThan(0);
    expect(checks).toBeLessThanOrEqual(MAX_CHECKS);
    for (const a of test.answers.filter((x) => x.checked !== undefined)) {
      expect(a.yes).toBe(true);
    }
  });

  it('never asks words from earlier tests', () => {
    const first = take(10).test.answers.map((a) => a.word);
    const second = new AdaptiveTest(pool, new Set(first), seededRandom(2));
    const seen = new Set(first);
    for (let q = second.next(); q.kind !== 'done'; q = second.next()) {
      if (q.kind === 'word') {
        expect(seen.has(q.word)).toBe(false);
        second.answerWord(false);
      } else second.answerCheck(false);
    }
  });

  it('can take back the last answer and ask the word again', () => {
    const test = new AdaptiveTest(pool, new Set(), seededRandom(3));
    const q = test.next();
    test.answerWord(true);
    expect(test.asked).toBe(1);
    test.next();
    test.undo();
    expect(test.asked).toBe(0);
    expect(test.answers).toHaveLength(0);
    expect(test.next()).toEqual(q);
  });
});

describe('meaning checks', () => {
  it('spots definitions that give the word away', () => {
    expect(givesAway('assayer', 'an analyst who assays metals')).toBe(true);
    expect(givesAway('warhorse', 'horse used in war')).toBe(true);
    expect(givesAway('panpipe', 'several parallel pipes bound together')).toBe(true);
    expect(givesAway('politburo', 'the chief political committee')).toBe(true);
    expect(givesAway('assayer', 'someone who tests metals to see what they contain')).toBe(false);
    expect(givesAway('cherish', 'be fond of; be attached to')).toBe(false);
  });

  it('no definition in the test pool gives its word away', () => {
    expect(pool.words.filter((w) => givesAway(w.word, w.gloss))).toEqual([]);
  });

  it('never offers a check whose options contain the word', () => {
    const word = pool.words[100]!;
    const fake: PlacementPool = {
      ...pool,
      words: [
        ...pool.words,
        { word: 'assayer', band: 12, pos: 'n', gloss: 'an analyst who assays metals' },
      ],
    };
    expect(makeCheck(fake, 'assayer', seededRandom(1))).toBeNull();
    const check = makeCheck(pool, word.word, seededRandom(1))!;
    for (const o of check.options) expect(givesAway(word.word, o.text)).toBe(false);
  });
});

describe('score', () => {
  it('finds the right size and frontier for clear-cut answers', () => {
    for (const last of [6, 10, 13]) {
      const result = score(pool, take(last).test.answers);
      const truth = sizeUpTo(last);
      expect(Math.abs(result.size - truth) / truth).toBeLessThan(0.15);
      expect(result.low).toBeLessThan(result.high);
      for (const band of result.frontier) expect(Math.abs(band - last)).toBeLessThanOrEqual(2);
    }
  });

  it("leans low: the reported size is below the model's average", () => {
    const answers = take(12).test.answers;
    const mean = posterior(answers).reduce(
      (sum, p) =>
        sum +
        p.weight *
          pool.bands.reduce(
            (s, b) => s + b.size / (1 + Math.exp(p.slope * (b.band - p.edge))),
            COMMONEST,
          ),
      0,
    );
    const result = score(pool, answers);
    expect(result.size).toBeLessThanOrEqual(mean);
    expect(result.low).toBeLessThanOrEqual(result.size);
    expect(result.size).toBeLessThanOrEqual(result.high);
  });

  it('gives a lower estimate when you claim made-up words', () => {
    // The same answers (without checks), once honest and once claiming every made-up word.
    const answers = take(12).test.answers.map(({ checked: _, ...a }) => a);
    const claiming = answers.map((a) => (a.band === undefined ? { ...a, yes: true } : a));
    expect(score(pool, claiming).falseAlarms).toBe(1);
    expect(score(pool, claiming).size).toBeLessThan(score(pool, answers).size);
  });

  it('gives a lower estimate when "yes" answers fail their checks', () => {
    const answers = take(16).test.answers;
    const failed: PlacementAnswer[] = answers.map((a) =>
      a.checked === undefined ? a : { ...a, checked: false },
    );
    expect(score(pool, failed).size).toBeLessThan(score(pool, answers).size);
  });

  it('can score answers from the earlier fixed test', () => {
    const answers: PlacementAnswer[] = pool.bands.flatMap((b) => [
      { word: `${b.band}a`, band: b.band, yes: b.band <= 9 },
      { word: `${b.band}b`, band: b.band, yes: b.band <= 9 },
    ]);
    expect(score(pool, answers).frontier.some((b) => b >= 8 && b <= 11)).toBe(true);
  });

  it('keeps beliefs as weights that add up to 1', () => {
    const total = posterior(take(8).test.answers).reduce((s, p) => s + p.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});
