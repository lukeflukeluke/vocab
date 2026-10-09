import type { PlacementAnswer, PlacementResult } from '../events/types';

// The placement test (PLAN 3.1): a yes/no list of real and fake words from 16 frequency
// bands, a meaning check on some "yes" answers, and a score: how much of each band you
// know, your vocabulary size, and your frontier (where new words should come from).
// Everything here is pure; pass in a random function.

/** content/placement.json */
export interface PlacementPool {
  bands: { band: number; size: number; rankFrom: number; rankTo: number }[];
  words: { word: string; band: number; pos: string; gloss: string }[];
  fakes: string[];
}

export interface TestItem {
  word: string;
  /** Absent for a fake word. */
  band?: number;
}

export interface CheckItem {
  word: string;
  band: number;
  /** Four meanings, one right. */
  options: { text: string; right: boolean }[];
}

/**
 * Real words per band, fake words, and meaning checks in one test: 40 taps and 8 checks,
 * about 2 to 3 minutes. Two words a band is noisy on its own; pooling neighbouring bands
 * (`decreasing`) evens it out, and the range shown reflects what is left.
 */
export const WORDS_PER_BAND = 2;
export const FAKES = 8;
export const CHECKS = 8;
/** Headwords ranked above the first band (the 1,000 commonest), assumed known. */
export const COMMONEST = 1000;
/** A band is on your frontier when you know this share of it. */
export const FRONTIER = { low: 0.3, high: 0.8 };

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * The yes/no list: 2 words from each band and 8 fake words, mixed. Words shown in an
 * earlier test or already among your words are skipped, so each monthly retest is fresh.
 */
export function makeTest(
  pool: PlacementPool,
  exclude: ReadonlySet<string>,
  random: () => number,
): TestItem[] {
  const items: TestItem[] = [];
  for (const { band } of pool.bands) {
    const fresh = pool.words.filter((w) => w.band === band && !exclude.has(w.word));
    for (const w of shuffle(fresh, random).slice(0, WORDS_PER_BAND)) {
      items.push({ word: w.word, band });
    }
  }
  const fakes = pool.fakes.filter((f) => !exclude.has(f));
  for (const word of shuffle(fakes, random).slice(0, FAKES)) items.push({ word });
  return shuffle(items, random);
}

/**
 * Meaning checks on up to 8 "yes" words, spread over the bands and favouring the rarer
 * ones, where over-claiming matters most. Wrong options are meanings of other words with
 * the same part of speech.
 */
export function makeChecks(
  pool: PlacementPool,
  answers: readonly PlacementAnswer[],
  random: () => number,
): CheckItem[] {
  const yes = answers.filter((a) => a.yes && a.band !== undefined);
  // Round-robin from the rarest band down, one word per band per round.
  const byBand = new Map<number, PlacementAnswer[]>();
  for (const a of shuffle(yes, random)) {
    byBand.set(a.band!, [...(byBand.get(a.band!) ?? []), a]);
  }
  const bands = [...byBand.keys()].sort((a, b) => b - a);
  const picked: PlacementAnswer[] = [];
  while (picked.length < CHECKS && bands.some((b) => byBand.get(b)!.length)) {
    for (const b of bands) {
      const next = byBand.get(b)!.shift();
      if (next && picked.length < CHECKS) picked.push(next);
    }
  }
  const info = new Map(pool.words.map((w) => [w.word, w]));
  return picked.map((a) => {
    const word = info.get(a.word)!;
    const others = shuffle(
      pool.words.filter((w) => w.word !== word.word && w.gloss !== word.gloss),
      random,
    ).sort((x, y) => Number(y.pos === word.pos) - Number(x.pos === word.pos));
    const options = [
      { text: word.gloss, right: true },
      ...others.slice(0, 3).map((w) => ({ text: w.gloss, right: false })),
    ];
    return { word: word.word, band: word.band, options: shuffle(options, random) };
  });
}

/**
 * Makes known-shares fall (or stay level) from common to rare bands, the shape real
 * vocabularies have, by pooling neighbours that break it. With only 2 words a band this
 * removes most of the noise.
 */
export function decreasing(values: readonly number[]): number[] {
  const blocks: { sum: number; count: number }[] = [];
  for (const v of values) {
    blocks.push({ sum: v, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!;
      const prev = blocks[blocks.length - 2]!;
      if (prev.sum / prev.count >= last.sum / last.count) break;
      blocks.splice(-2, 2, { sum: prev.sum + last.sum, count: prev.count + last.count });
    }
  }
  return blocks.flatMap((b) => Array<number>(b.count).fill(b.sum / b.count));
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export function score(pool: PlacementPool, answers: readonly PlacementAnswer[]): PlacementResult {
  const fakes = answers.filter((a) => a.band === undefined);
  const falseAlarms = fakes.length ? fakes.filter((a) => a.yes).length / fakes.length : 0;

  // Meaning checks: the share of checked "yes" answers that held up.
  const checked = answers.filter((a) => a.checked !== undefined);
  const passRate = (list: readonly PlacementAnswer[]) =>
    list.length ? list.filter((a) => a.checked).length / list.length : null;
  const overall = passRate(checked) ?? 1;

  const raw = pool.bands.map(({ band }) => {
    const real = answers.filter((a) => a.band === band);
    if (!real.length) return 0;
    const said = real.filter((a) => a.yes).length / real.length;
    // Correct for guessing: saying yes to fakes means some real "yes" answers are guesses.
    const known = falseAlarms >= 1 ? 0 : Math.max(0, (said - falseAlarms) / (1 - falseAlarms));
    const bandChecks = checked.filter((a) => a.band === band);
    const held = bandChecks.length >= 2 ? passRate(bandChecks)! : overall;
    return Math.min(1, known * held);
  });
  const known = decreasing(raw);

  let size = COMMONEST;
  pool.bands.forEach((b, i) => (size += b.size * known[i]!));

  // Uncertainty: bands pooled together share one estimate, made from all their answers.
  let variance = 0;
  for (let i = 0; i < pool.bands.length;) {
    let j = i;
    let words = 0;
    let headwords = 0;
    while (j < pool.bands.length && known[j] === known[i]) {
      words += answers.filter((a) => a.band === pool.bands[j]!.band).length;
      headwords += pool.bands[j]!.size;
      j++;
    }
    const k = known[i]!;
    variance += (headwords * headwords * Math.max(k * (1 - k), 0.02)) / Math.max(words, 1);
    i = j;
  }
  const spread = 1.96 * Math.sqrt(variance);

  const bands = pool.bands.map((b, i) => ({ band: b.band, known: round(known[i]!, 0.01) }));
  let frontier = bands
    .filter((b) => b.known >= FRONTIER.low && b.known <= FRONTIER.high)
    .map((b) => b.band);
  if (!frontier.length) {
    // No band in the middle: take the one closest to half known.
    const closest = [...bands].sort(
      (a, b) => Math.abs(a.known - 0.55) - Math.abs(b.known - 0.55) || a.band - b.band,
    )[0]!;
    frontier = [closest.band];
  }
  return {
    bands,
    size: round(size, 100),
    low: Math.max(COMMONEST, round(size - spread, 100)),
    high: round(size + spread, 100),
    falseAlarms: round(falseAlarms, 0.01),
    frontier,
  };
}
