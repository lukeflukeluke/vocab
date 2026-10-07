import type { Bank, BankEntry } from '../content/bank';
import { seededRandom } from '../random';
import type { State } from '../state/state';

// What an exercise shows: the sentence split around the word or gap, and the options for
// multiple choice. Options come from a seed made from the step's key, so they stay the
// same if the screen redraws.

export interface Option {
  /** Entry id the option belongs to. */
  id: string;
  text: string;
}

/** A sentence split around one word or gap. */
export interface Split {
  before: string;
  middle: string;
  after: string;
}

/** Splits a sentence around the first whole-word use of `form` (any case). */
export function splitAtWord(text: string, form: string): Split {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?<![A-Za-z'-])${escaped}(?![A-Za-z'-])`, 'i').exec(text);
  if (!match) return { before: text, middle: '', after: '' };
  return {
    before: text.slice(0, match.index),
    middle: match[0],
    after: text.slice(match.index + match[0].length),
  };
}

/** Splits a fill-in-the-blank sentence around its "___". */
export function splitAtGap(text: string): Split {
  const at = text.indexOf('___');
  if (at === -1) return { before: text, middle: '', after: '' };
  return { before: text.slice(0, at), middle: '___', after: text.slice(at + 3) };
}

/** A repeatable seed from a string (FNV-1a). */
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Words too close in meaning to be fair wrong answers. */
function tooClose(a: BankEntry, b: BankEntry): boolean {
  const near = (x: BankEntry, y: BankEntry) =>
    x.synonyms.some((s) => s.word === y.headword) || x.headword === y.headword;
  return near(a, b) || near(b, a);
}

/**
 * Takes `count` entries, preferring the same part of speech and a similar frequency band
 * (PLAN 5, "Good distractors"), then anything else that is fair.
 */
function pickDistractors(
  target: BankEntry,
  pool: readonly BankEntry[],
  count: number,
  random: () => number,
): BankEntry[] {
  const fair = pool.filter((e) => e.id !== target.id && !tooClose(target, e));
  const distance = (e: BankEntry) =>
    target.band !== null && e.band !== null ? Math.abs(target.band - e.band) : 3;
  // A little randomness so the same wrong answers do not always appear together.
  const score = new Map(fair.map((e) => [e.id, distance(e) + random() * 4]));
  const byScore = (a: BankEntry, b: BankEntry) => score.get(a.id)! - score.get(b.id)!;
  const same = fair.filter((e) => e.pos === target.pos).sort(byScore);
  const other = fair.filter((e) => e.pos !== target.pos).sort(byScore);
  return [...same, ...other].slice(0, count);
}

/** The word's definition and three others, in random order (R1 and the guess screen). */
export function meaningOptions(target: BankEntry, bank: Bank, seed: string): Option[] {
  const random = seededRandom(seedOf(seed));
  const wrong = pickDistractors(target, bank.entries, 3, random);
  const options = [target, ...wrong].map((e) => ({ id: e.id, text: e.definition }));
  return shuffle(options, random);
}

/**
 * The word and three of your own words, in random order (P3). Words from the bank fill
 * in when you have fewer than three others.
 */
export function wordOptions(target: BankEntry, bank: Bank, state: State, seed: string): Option[] {
  const random = seededRandom(seedOf(seed));
  const own = bank.entries.filter((e) => {
    const word = state.words[e.id];
    return word && word.status === 'active' && word.memory.recognition;
  });
  let wrong = pickDistractors(target, own, 3, random);
  if (wrong.length < 3) {
    const taken = new Set(wrong.map((e) => e.id));
    const rest = bank.entries.filter((e) => !taken.has(e.id));
    wrong = [...wrong, ...pickDistractors(target, rest, 3 - wrong.length, random)];
  }
  // Two senses of one word would make two identical options.
  const seen = new Set([target.headword]);
  wrong = wrong.filter((e) => !seen.has(e.headword) && seen.add(e.headword));
  const options = [target, ...wrong].map((e) => ({ id: e.id, text: e.headword }));
  return shuffle(options, random);
}

/**
 * The gap as hints reveal it: "l______" for the first letter, "l _ _ _ _ _ _" with the
 * letter count.
 */
export function gapHint(answer: string, firstLetter: boolean, letterCount: boolean): string {
  if (letterCount) {
    return [...answer]
      .map((ch, i) => (i === 0 && firstLetter ? ch : ch === ' ' ? ' ' : '_'))
      .join(' ');
  }
  return firstLetter ? `${answer[0]}...` : '';
}
