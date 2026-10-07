import { formsOf, otherSpelling, type Bank, type BankEntry } from '../content/bank';

// Checking typed answers (PLAN 5, "Typed answers"). Case and extra spaces never matter.
// The right word in another form counts and shows the form the sentence needed. A
// one-letter slip on a word of 5 or more letters counts, but as Hard.

export type TypedVerdict =
  /** Exactly what the sentence needed (in either spelling). */
  | 'exact'
  /** The right word in another form ("obfuscate" where "obfuscated" was needed). */
  | 'form'
  /** One letter off (missing, extra, wrong or two swapped) on a word of 5+ letters. */
  | 'near'
  | 'wrong'
  /** Nothing typed. */
  | 'empty';

export interface TypedResult {
  verdict: TypedVerdict;
  correct: boolean;
  /** What was typed, cleaned up. */
  typed: string;
  /** The form the sentence needed. */
  expected: string;
}

/** Lower case, straight apostrophes, single spaces, no trailing full stop. */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '');
}

/** Edit distance where swapping two neighbouring letters counts as one edit. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/** Words this short must be spelled exactly: one letter changes too much. */
export const NEAR_MISS_MIN_LENGTH = 5;

export function checkTyped(input: string, expected: string, entry: BankEntry): TypedResult {
  const typed = normalize(input);
  const want = normalize(expected);
  const result = (verdict: TypedVerdict): TypedResult => ({
    verdict,
    correct: verdict === 'exact' || verdict === 'form' || verdict === 'near',
    typed,
    expected,
  });
  if (!typed) return result('empty');

  const forms = formsOf(entry);
  // "idolised" and "idolized" are the same form.
  const other = entry.spellings ? otherSpelling(want, entry.spellings) : null;
  const sameForm = other ? [want, other] : [want];
  if (sameForm.includes(typed)) return result('exact');
  if (forms.includes(typed)) return result('form');
  if (want.length >= NEAR_MISS_MIN_LENGTH) {
    if (sameForm.some((f) => editDistance(typed, f) <= 1)) return result('near');
  }
  return result('wrong');
}

/**
 * The bank entry a wrong typed answer belongs to, if it is another word you might have
 * mixed this one up with (for confusion tracking).
 */
export function enteredWord(typed: string, bank: Bank, exceptId: string): string | undefined {
  const word = normalize(typed);
  if (!word) return undefined;
  for (const entry of bank.entries) {
    if (entry.id !== exceptId && formsOf(entry).includes(word)) return entry.id;
  }
  return undefined;
}
