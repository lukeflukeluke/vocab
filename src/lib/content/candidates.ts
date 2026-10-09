import type { PlacementResult } from '../events/types';
import { studyDay } from '../scheduler/day';
import type { State } from '../state/state';
import type { Bank, BankEntry } from './bank';

// The order new words are offered in (PLAN 3.4). The planner takes them from the front.
// Words you have captured are handled by the planner itself (they always come first).

/** Days a recently met word keeps its near-synonyms and look-alikes away. */
export const INTERFERENCE_DAYS = 7;
/** How many words at the front of the list are reordered for variety. */
const VARIETY_WINDOW = 30;

/**
 * How well a band suits you, from -1 to 1. Bands you know about half of suit best; bands
 * you already know almost entirely are probably not worth new words.
 */
export function frontierFit(band: number | null, placement: PlacementResult | null): number {
  if (!placement || band === null) return 0;
  const known = placement.bands.find((b) => b.band === band)?.known;
  if (known === undefined) return 0;
  if (known >= 0.95) return -1;
  return 1 - Math.abs(known - 0.55) / 0.55;
}

/**
 * Words met in the last 7 days, and the near-synonyms and look-alikes their entries name.
 * A new word that is either, or that names one of them, would interfere (PLAN 3.4).
 */
export function recentlyMet(bank: Bank, state: State, now: number, tz: number) {
  const today = studyDay(now, tz);
  const met = new Set<string>();
  const named = new Set<string>();
  for (const word of Object.values(state.words)) {
    const first = word.memory.recognition?.firstReview;
    if (first === undefined || today - studyDay(first, tz) >= INTERFERENCE_DAYS) continue;
    const entry = bank.byId.get(word.entryId);
    if (!entry) continue;
    met.add(entry.headword);
    for (const s of entry.synonyms) named.add(s.word);
    for (const c of entry.confusables) named.add(c.word);
  }
  return { met, named };
}

function interferes(e: BankEntry, recent: { met: Set<string>; named: Set<string> }): boolean {
  if (recent.met.has(e.headword) || recent.named.has(e.headword)) return true;
  return [...e.synonyms.map((x) => x.word), ...e.confusables.map((x) => x.word)].some((w) =>
    recent.met.has(w),
  );
}

export function orderCandidates(bank: Bank, state: State, now: number, tz: number): string[] {
  const placement = state.placements.at(-1)?.result ?? null;
  const recent = recentlyMet(bank, state, now, tz);
  const score = (e: BankEntry) =>
    e.priority + 0.5 * frontierFit(e.band, placement) - (interferes(e, recent) ? 2 : 0);
  const fresh = bank.entries.filter((e) => !state.words[e.id]);
  const scored = new Map(fresh.map((e) => [e.id, score(e)]));
  const sorted = [...fresh].sort(
    (a, b) => scored.get(b.id)! - scored.get(a.id)! || a.id.localeCompare(b.id),
  );

  // Variety: among the front of the list, avoid runs of the same part of speech or topic.
  const head = sorted.slice(0, VARIETY_WINDOW);
  const picked: BankEntry[] = [];
  while (head.length) {
    const last = picked.slice(-2);
    let best = 0;
    let bestScore = -Infinity;
    head.forEach((e, i) => {
      const penalty =
        0.3 * last.filter((p) => p.pos === e.pos).length +
        0.3 * last.filter((p) => p.tags[0] === e.tags[0]).length;
      const s = scored.get(e.id)! - penalty;
      if (s > bestScore) [best, bestScore] = [i, s];
    });
    picked.push(head.splice(best, 1)[0]!);
  }
  return [...picked, ...sorted.slice(VARIETY_WINDOW)].map((e) => e.id);
}
