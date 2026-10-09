import type { PlacementAnswer, PlacementResult } from '../events/types';

// The placement test (PLAN 3.1), adaptive: it keeps a running estimate of where your
// knowledge drops off and asks each next word from the band where your answer will tell
// it the most. Easy words first; harder while you keep knowing them; then it settles
// around your edge. Made-up words and on-the-spot meaning checks keep "yes" honest.
//
// The estimate is a small Bayesian model: you know a band-b word with probability
// 1 / (1 + e^(slope * (b - edge))), where `edge` is the band you know half of. Each answer
// updates a grid of (edge, slope) guesses. Scoring past answers uses the same model, so a
// test can always be re-scored from its stored answers. Everything here is pure: pass in
// a random function.
//
// Estimates deliberately lean low: the reported size and band shares are the level the
// model is 70% sure you are at or above, so a lucky test never inflates your level and
// later retests can show real improvement.

/** content/placement.json */
export interface PlacementPool {
  bands: { band: number; size: number; rankFrom: number; rankTo: number }[];
  words: { word: string; band: number; pos: string; gloss: string }[];
  fakes: string[];
}

export interface CheckItem {
  word: string;
  band: number;
  /** Four meanings, one right. */
  options: { text: string; right: boolean }[];
}

export type Question =
  | { kind: 'word'; word: string; band?: number }
  | { kind: 'check'; check: CheckItem }
  | { kind: 'done' };

/** Questions in one test, meaning checks included. */
export const QUESTIONS = 50;
/** Made-up words, spread through the test. */
export const FAKES = 8;
/** Most meaning checks in one test. */
export const MAX_CHECKS = 10;
/** The first words come from easy bands, to warm up. */
const WARM_UP = [3, 5, 7];
/** Headwords ranked above the first band (the 1,000 commonest), assumed known. */
export const COMMONEST = 1000;
/** A band is on your frontier when you know this share of it. */
export const FRONTIER = { low: 0.3, high: 0.8 };
/** Estimates lean low: the level we are 70% sure you are at or above (PLAN 3.1). */
export const CAUTION = 0.3;

// The model. A known word is sometimes still answered "no" (SLIP); an unknown word is
// answered "yes" at your guessing rate, which the made-up words measure. A meaning check
// on a known word is passed 95% of the time, on an unknown word 25% (one in four).
const SLIP = 0.03;
const PASS_KNOWN = 0.95;
const PASS_GUESS = 0.25;
const EDGES = Array.from({ length: 77 }, (_, i) => i * 0.25 - 1); // -1 to 18
const SLOPES = [0.5, 0.8, 1.3];

interface Point {
  edge: number;
  slope: number;
  weight: number;
}

const knownAt = (band: number, edge: number, slope: number) =>
  1 / (1 + Math.exp(slope * (band - edge)));

/**
 * How often you say yes to words you don't know: measured by the made-up words, and by
 * "yes" answers that then failed their meaning check (prior about 5%).
 */
export function guessRate(answers: readonly PlacementAnswer[]): number {
  const fakes = answers.filter((a) => a.band === undefined);
  const checked = answers.filter((a) => a.checked !== undefined);
  const misses = fakes.filter((a) => a.yes).length + checked.filter((a) => !a.checked).length;
  return (misses + 0.5) / (fakes.length + checked.length + 10);
}

function likelihood(a: PlacementAnswer, edge: number, slope: number, guess: number): number {
  if (a.band === undefined) return 1; // Made-up words only inform the guessing rate.
  const k = knownAt(a.band, edge, slope);
  const yesKnown = k * (1 - SLIP);
  const yesGuess = (1 - k) * guess;
  if (!a.yes) return k * SLIP + (1 - k) * (1 - guess);
  if (a.checked === undefined) return yesKnown + yesGuess;
  return a.checked
    ? yesKnown * PASS_KNOWN + yesGuess * PASS_GUESS
    : yesKnown * (1 - PASS_KNOWN) + yesGuess * (1 - PASS_GUESS);
}

/** The model's beliefs after some answers: weighted (edge, slope) points summing to 1. */
export function posterior(answers: readonly PlacementAnswer[]): Point[] {
  const guess = guessRate(answers);
  const points: Point[] = [];
  for (const edge of EDGES) {
    for (const slope of SLOPES) {
      // A broad prior around the middle bands.
      let weight = Math.exp(-((edge - 9) ** 2) / (2 * 5 ** 2));
      for (const a of answers) weight *= likelihood(a, edge, slope, guess);
      points.push({ edge, slope, weight });
    }
  }
  const total = points.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of points) p.weight /= total;
  return points;
}

const meanEdge = (points: readonly Point[]) => points.reduce((s, p) => s + p.weight * p.edge, 0);

function edgeVariance(points: readonly Point[]): number {
  const m = meanEdge(points);
  return points.reduce((s, p) => s + p.weight * (p.edge - m) ** 2, 0);
}

/**
 * The band whose answer is expected to narrow the estimate most: the one minimising the
 * expected spread of the edge after a yes or a no.
 */
export function bestBand(answers: readonly PlacementAnswer[], bands: readonly number[]): number {
  const points = posterior(answers);
  const guess = guessRate(answers);
  let best = bands[0]!;
  let bestScore = Infinity;
  for (const band of bands) {
    let pYes = 0;
    const yes: Point[] = [];
    const no: Point[] = [];
    for (const p of points) {
      const k = knownAt(band, p.edge, p.slope);
      const py = k * (1 - SLIP) + (1 - k) * guess;
      pYes += p.weight * py;
      yes.push({ ...p, weight: p.weight * py });
      no.push({ ...p, weight: p.weight * (1 - py) });
    }
    const norm = (list: Point[], total: number) =>
      list.map((p) => ({ ...p, weight: total ? p.weight / total : 0 }));
    const expected =
      pYes * edgeVariance(norm(yes, pYes)) + (1 - pYes) * edgeVariance(norm(no, 1 - pYes));
    if (expected < bestScore - 1e-9) [best, bestScore] = [band, expected];
  }
  return best;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * One adaptive test. Ask `next()` for a question, answer it with `answerWord` or
 * `answerCheck`, repeat until `next()` is done. Words shown in an earlier test, or
 * already among your words, are never asked, so each monthly retest is fresh.
 */
export class AdaptiveTest {
  readonly answers: PlacementAnswer[] = [];
  #asked = 0;
  #checks = 0;
  #pending: CheckItem | null = null;
  #current: Question | null = null;
  #used: Set<string>;
  /** Question numbers at which the made-up words come, in order. */
  #fakeAt: number[];
  #fakesShown = 0;
  /** Made-up words in random order (the pool is alphabetical, which would give them away). */
  #fakes: string[];

  constructor(
    private pool: PlacementPool,
    exclude: ReadonlySet<string>,
    private random: () => number,
  ) {
    this.#used = new Set(exclude);
    this.#fakes = shuffle(pool.fakes, random);
    // Spread the made-up words evenly, after the warm-up.
    const step = (QUESTIONS - WARM_UP.length) / FAKES;
    this.#fakeAt = Array.from(
      { length: FAKES },
      (_, i) => WARM_UP.length + Math.floor(i * step + step / 2),
    );
  }

  /** Questions asked so far, checks included. */
  get asked(): number {
    return this.#asked;
  }

  /** The current question (asks for a new one only once the last is answered). */
  next(): Question {
    if (this.#current) return this.#current;
    if (this.#pending) {
      this.#current = { kind: 'check', check: this.#pending };
    } else if (this.#asked >= QUESTIONS) {
      this.#current = { kind: 'done' };
    } else if (
      this.#fakesShown < FAKES &&
      this.#asked >= this.#fakeAt[this.#fakesShown]! &&
      this.#fakes.some((f) => !this.#used.has(f))
    ) {
      const fake = this.#fakes.find((f) => !this.#used.has(f))!;
      this.#current = { kind: 'word', word: fake };
    } else {
      this.#current = this.#realWord();
    }
    if (this.#current.kind === 'word') this.#used.add(this.#current.word);
    return this.#current;
  }

  #realWord(): Question {
    const available = (band: number) =>
      this.pool.words.filter((w) => w.band === band && !this.#used.has(w.word));
    const bands = this.pool.bands.map((b) => b.band).filter((b) => available(b).length);
    if (!bands.length) return { kind: 'done' };
    const warm = WARM_UP[this.#asked];
    const band = warm !== undefined && bands.includes(warm) ? warm : bestBand(this.answers, bands);
    const word = shuffle(available(band), this.random)[0]!;
    return { kind: 'word', word: word.word, band };
  }

  answerWord(yes: boolean): void {
    const q = this.#current;
    if (q?.kind !== 'word') return;
    this.answers.push({ word: q.word, ...(q.band !== undefined && { band: q.band }), yes });
    this.#asked += 1;
    if (q.band === undefined) this.#fakesShown += 1;
    this.#current = null;
    // A "yes" near or past your edge gets a meaning check on the spot.
    const warmingUp = this.#asked <= WARM_UP.length;
    if (
      yes &&
      q.band !== undefined &&
      !warmingUp &&
      this.#checks < MAX_CHECKS &&
      this.#asked < QUESTIONS
    ) {
      const edge = meanEdge(posterior(this.answers.slice(0, -1)));
      if (q.band >= edge - 1.5) {
        this.#pending = makeCheck(this.pool, q.word, this.random);
        if (this.#pending) this.#checks += 1;
      }
    }
  }

  answerCheck(right: boolean): void {
    const q = this.#current;
    if (q?.kind !== 'check') return;
    const answer = [...this.answers].reverse().find((a) => a.word === q.check.word);
    if (answer) answer.checked = right;
    this.#asked += 1;
    this.#pending = null;
    this.#current = null;
  }

  /** Takes back the last yes/no answer (and its check), and asks that word again. */
  undo(): void {
    const last = this.answers.at(-1);
    if (!last || this.#current?.kind === 'check') return;
    this.answers.pop();
    this.#asked -= last.checked === undefined ? 1 : 2;
    if (last.band === undefined) this.#fakesShown -= 1;
    if (last.checked !== undefined) this.#checks -= 1;
    this.#current = {
      kind: 'word',
      word: last.word,
      ...(last.band !== undefined && { band: last.band }),
    };
  }
}

/**
 * True when a definition gives the word away: it contains the word or a form of it
 * ("assays" for assayer), part of a compound ("horse" for warhorse) or a close relative
 * ("political" for politburo). The same rule as scripts/wordbank/build.py, which keeps
 * such definitions out of placement.json; this is the safety net.
 */
export function givesAway(word: string, definition: string): boolean {
  const stem = word.slice(0, Math.max(4, word.length - 3));
  for (const t of definition.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (t.startsWith(stem)) return true;
    const part = t.endsWith('s') && t.length > 4 ? t.slice(0, -1) : t;
    if (part.length >= 4 && (word.startsWith(part) || word.endsWith(part))) return true;
    if (t.length >= 5 && word.length >= 5 && t.slice(0, 5) === word.slice(0, 5)) return true;
  }
  return false;
}

/**
 * A meaning check: the word's meaning and three others of the same part of speech, none
 * of which contains the word. Null if the word's own definition would give it away.
 */
export function makeCheck(
  pool: PlacementPool,
  word: string,
  random: () => number,
): CheckItem | null {
  const info = pool.words.find((w) => w.word === word);
  if (!info || givesAway(info.word, info.gloss)) return null;
  const others = shuffle(
    pool.words.filter(
      (w) => w.word !== info.word && w.gloss !== info.gloss && !givesAway(info.word, w.gloss),
    ),
    random,
  ).sort((x, y) => Number(y.pos === info.pos) - Number(x.pos === info.pos));
  const options = [
    { text: info.gloss, right: true },
    ...others.slice(0, 3).map((w) => ({ text: w.gloss, right: false })),
  ];
  return { word: info.word, band: info.band, options: shuffle(options, random) };
}

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Vocabulary size for one (edge, slope): the 1,000 commonest plus each band's share. */
function sizeAt(pool: PlacementPool, edge: number, slope: number): number {
  return pool.bands.reduce((s, b) => s + b.size * knownAt(b.band, edge, slope), COMMONEST);
}

function quantile(values: { value: number; weight: number }[], q: number): number {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  let total = 0;
  for (const v of sorted) {
    total += v.weight;
    if (total >= q) return v.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

/** The result of a test, from its answers (works for any set of answers). */
export function score(pool: PlacementPool, answers: readonly PlacementAnswer[]): PlacementResult {
  const points = posterior(answers);
  const sizes = points.map((p) => ({ value: sizeAt(pool, p.edge, p.slope), weight: p.weight }));
  const low = Math.max(COMMONEST, round(quantile(sizes, 0.05), 100));
  const high = round(quantile(sizes, 0.95), 100);
  const size = Math.min(high, Math.max(low, round(quantile(sizes, CAUTION), 100)));
  const bands = pool.bands.map((b) => ({
    band: b.band,
    known: round(
      quantile(
        points.map((p) => ({ value: knownAt(b.band, p.edge, p.slope), weight: p.weight })),
        CAUTION,
      ),
      0.01,
    ),
  }));
  let frontier = bands
    .filter((b) => b.known >= FRONTIER.low && b.known <= FRONTIER.high)
    .map((b) => b.band);
  if (!frontier.length) {
    const closest = [...bands].sort(
      (a, b) => Math.abs(a.known - 0.55) - Math.abs(b.known - 0.55) || a.band - b.band,
    )[0]!;
    frontier = [closest.band];
  }
  const fakes = answers.filter((a) => a.band === undefined);
  return {
    bands,
    size,
    low,
    high,
    falseAlarms: fakes.length ? round(fakes.filter((a) => a.yes).length / fakes.length, 0.01) : 0,
    frontier,
  };
}
