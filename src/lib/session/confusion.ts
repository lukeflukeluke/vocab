import type { State, UserWord } from '../state/state';

// Confusion tracking (PLAN 6.6). Every wrong answer records what was chosen instead
// (`chose`). Picking or typing B for A, or A for B, twice makes A and B a confusion pair.
// A pair gets contrast drills (P4) until two of them are passed after the latest mix-up.

/** Mix-ups, in either direction, that make a pair. */
export const PAIR_AFTER = 2;
/** Passed drills, after the latest mix-up, that settle a pair. */
export const SETTLED_AFTER = 2;

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function allReviews(word: UserWord) {
  return [...word.reviews.recognition, ...word.reviews.production];
}

/**
 * Every confusion pair among your words, as a map from each word to the words it is
 * mixed up with. Both words must be ones you are learning.
 */
export function confusionPairs(state: State): Map<string, string[]> {
  const counts = new Map<string, number>();
  for (const word of Object.values(state.words)) {
    for (const r of allReviews(word)) {
      if (!r.chose || r.chose === word.entryId || !state.words[r.chose]) continue;
      const k = key(word.entryId, r.chose);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const pairs = new Map<string, string[]>();
  for (const [k, n] of counts) {
    if (n < PAIR_AFTER) continue;
    const [a, b] = k.split('|') as [string, string];
    pairs.set(a, [...(pairs.get(a) ?? []), b]);
    pairs.set(b, [...(pairs.get(b) ?? []), a]);
  }
  return pairs;
}

/** The prompt id a contrast drill against `other` is recorded with. */
export const drillPrompt = (other: string) => `vs:${other}`;

/**
 * The word `entryId` still needs drilling against, if any: a pair whose drills have not
 * been passed twice since the latest mix-up between the two.
 */
export function drillPartner(state: State, entryId: string, pairs = confusionPairs(state)) {
  for (const other of pairs.get(entryId) ?? []) {
    const a = state.words[entryId];
    const b = state.words[other];
    if (!a || !b || b.status !== 'active' || !b.memory.recognition) continue;
    const mixups = [
      ...allReviews(a).filter((r) => r.chose === other),
      ...allReviews(b).filter((r) => r.chose === entryId),
    ];
    const latest = Math.max(...mixups.map((r) => r.t));
    const passed = [...allReviews(a), ...allReviews(b)].filter(
      (r) =>
        r.exercise === 'P4' &&
        r.correct &&
        r.t > latest &&
        (r.promptId === drillPrompt(other) || r.promptId === drillPrompt(entryId)),
    ).length;
    if (passed < SETTLED_AFTER) return other;
  }
  return null;
}
