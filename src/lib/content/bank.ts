import type { Entry } from './types';

// The word bank the app ships with: the written entries (content/entries/*.json) joined
// with what the build pipeline knows about each headword (content/candidates.json).
// The join runs at build time in scripts/word-bank-plugin.ts, so the app never downloads
// the whole candidate list.

/** British and American spellings of a headword, when they differ. */
export interface Spellings {
  uk: string;
  us: string;
}

export interface BankEntry extends Entry {
  ipa?: { uk?: string; us?: string };
  spellings?: Spellings;
  /** Frequency band (higher is rarer), or null for words not on the candidate list. */
  band: number | null;
  /** Candidate priority (higher is learned sooner), or 0 for words not on the list. */
  priority: number;
}

/** The fields of a content/candidates.json row the app uses. */
export interface CandidateRow {
  word: string;
  priority: number;
  band: number;
  ipa?: { uk?: string; us?: string };
  spellings?: Spellings;
}

export function joinBank(entries: readonly Entry[], rows: readonly CandidateRow[]): BankEntry[] {
  const byWord = new Map(rows.map((row) => [row.word, row]));
  return entries.map((entry) => {
    const row = byWord.get(entry.headword);
    return {
      ...entry,
      ...(row?.ipa && { ipa: row.ipa }),
      ...(row?.spellings && { spellings: row.spellings }),
      band: row?.band ?? null,
      priority: row?.priority ?? 0,
    };
  });
}

/**
 * The same word in the other spelling: "idolised" gives "idolized", "fervour" gives
 * "fervor". Returns null when the word does not contain the part that differs.
 */
export function otherSpelling(word: string, spellings: Spellings): string | null {
  const { uk, us } = spellings;
  let start = 0;
  while (start < uk.length && start < us.length && uk[start] === us[start]) start++;
  let end = 0;
  while (
    end < uk.length - start &&
    end < us.length - start &&
    uk[uk.length - 1 - end] === us[us.length - 1 - end]
  ) {
    end++;
  }
  const stem = uk.slice(0, start);
  const ukPart = uk.slice(start, uk.length - end);
  const usPart = us.slice(start, us.length - end);
  if (!word.startsWith(stem)) return null;
  const rest = word.slice(start);
  if (ukPart && rest.startsWith(ukPart)) return stem + usPart + rest.slice(ukPart.length);
  if (usPart && rest.startsWith(usPart)) return stem + ukPart + rest.slice(usPart.length);
  // One spelling just leaves letters out ("fervor"): the shared ending must follow.
  const tail = uk.slice(uk.length - end);
  if (!tail || !rest.startsWith(tail[0]!)) return null;
  if (!ukPart) return stem + usPart + rest;
  if (!usPart) return stem + ukPart + rest;
  return null;
}

/** Every form of the word (headword first), in both spellings where they differ. */
export function formsOf(entry: BankEntry): string[] {
  const forms = [entry.headword, ...entry.forms].map((f) => f.toLowerCase());
  if (entry.spellings) {
    for (const form of [...forms]) {
      const other = otherSpelling(form, entry.spellings);
      if (other && !forms.includes(other)) forms.push(other);
    }
  }
  return forms;
}

export interface Bank {
  entries: readonly BankEntry[];
  byId: ReadonlyMap<string, BankEntry>;
  /** Entry ids, best first: what the planner takes new words from. */
  candidates: readonly string[];
}

export function makeBank(entries: readonly BankEntry[]): Bank {
  const sorted = [...entries].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  return {
    entries,
    byId: new Map(entries.map((e) => [e.id, e])),
    candidates: sorted.map((e) => e.id),
  };
}
