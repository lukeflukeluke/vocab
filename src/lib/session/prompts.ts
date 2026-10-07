import type { Entry } from '../content/types';
import type { UserWord } from '../state/state';

// Which sentence an exercise shows (PLAN 5, "Variety"). Example sentences have ids ex0 to
// ex5 and fill-in-the-blank sentences cz0 to cz2; reviews store the id as `promptId`.
// A word never repeats a sentence within 3 reviews, nor within one session.

export type PromptKind = 'example' | 'cloze';

/** Reviews a sentence stays out of use for. */
export const PROMPT_GAP = 3;

export function promptIds(entry: Entry, kind: PromptKind): string[] {
  if (kind === 'cloze') return entry.cloze.map((_, i) => `cz${i}`);
  // Example 0 is the "guess first" sentence, so reviews use it last.
  const ids = entry.examples.map((_, i) => `ex${i}`);
  return [...ids.slice(1), ...ids.slice(0, 1)];
}

/** The promptIds of a word's reviews, oldest first. */
export function promptHistory(word: UserWord | undefined): string[] {
  if (!word) return [];
  return [...word.reviews.recognition, ...word.reviews.production]
    .sort((a, b) => a.t - b.t)
    .flatMap((r) => (r.promptId ? [r.promptId] : []));
}

/**
 * Picks a sentence: the first one not used in this session or the last 3 reviews, or
 * failing that the one used longest ago.
 */
export function pickPrompt(
  entry: Entry,
  kind: PromptKind,
  history: readonly string[],
  usedThisSession: readonly string[],
): string {
  const ids = promptIds(entry, kind);
  const recent = history.slice(-PROMPT_GAP);
  const fresh = ids.find((id) => !usedThisSession.includes(id) && !recent.includes(id));
  if (fresh) return fresh;
  // Everything was used recently: take the one whose last use is oldest.
  const lastUse = (id: string) => {
    const inSession = usedThisSession.lastIndexOf(id);
    if (inSession !== -1) return history.length + inSession;
    return history.lastIndexOf(id);
  };
  return [...ids].sort((a, b) => lastUse(a) - lastUse(b))[0]!;
}

/** The example sentence or blank for a prompt id. */
export function exampleFor(entry: Entry, promptId: string) {
  const match = /^ex(\d)$/.exec(promptId);
  return entry.examples[match ? Number(match[1]) : 0] ?? entry.examples[0]!;
}

export function clozeFor(entry: Entry, promptId: string) {
  const match = /^cz(\d)$/.exec(promptId);
  return entry.cloze[match ? Number(match[1]) : 0] ?? entry.cloze[0]!;
}

/**
 * The two examples on the word page: example 1, and the next one from a different
 * setting (PLAN 4: "two examples from different settings").
 */
export function pageExamples(entry: Entry): string[] {
  const first = entry.examples[1];
  if (!first) return ['ex0'];
  const second = entry.examples.findIndex((x, i) => i > 1 && x.setting !== first.setting);
  return ['ex1', `ex${second === -1 ? 2 : second}`];
}
