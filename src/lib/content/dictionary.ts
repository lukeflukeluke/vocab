import urls from 'virtual:dictionary';
import { formsOf, type Bank, type BankEntry } from './bank';
import { lemmaCandidates } from './capture';
import type { EntryPos } from './types';

// Looking up a captured word: its entries in the word bank and its senses in the compact
// dictionary (content/dictionary/, up to 3 short WordNet definitions for 41,000 words).
// The dictionary comes as one file per first letter, fetched when first needed; the
// service worker keeps them for offline use.

/** A dictionary file: word -> [part of speech, definition][]. */
export type DictionaryFile = Record<string, [EntryPos, string][]>;

export type Meaning =
  | { kind: 'bank'; entry: BankEntry }
  | { kind: 'dictionary'; headword: string; pos: EntryPos; gloss: string };

export interface Found {
  headword: string;
  meanings: Meaning[];
}

/**
 * Everything a word could be, best guess first: bank entries that have this exact form,
 * then each possible dictionary form ("posited" -> "posit") with its bank entries and
 * dictionary senses.
 */
export function meaningsFor(
  word: string,
  bank: Bank,
  senses: (headword: string) => [EntryPos, string][] | undefined,
): Found[] {
  const w = word.trim().toLowerCase();
  if (!w) return [];
  const found = new Map<string, Meaning[]>();
  const add = (headword: string, meaning: Meaning) => {
    const list = found.get(headword) ?? [];
    list.push(meaning);
    found.set(headword, list);
  };
  for (const entry of bank.entries) {
    if (formsOf(entry).includes(w)) add(entry.headword, { kind: 'bank', entry });
  }
  for (const candidate of lemmaCandidates(w)) {
    if (!found.has(candidate)) {
      for (const entry of bank.entries) {
        if (entry.headword === candidate) add(candidate, { kind: 'bank', entry });
      }
    }
    for (const [pos, gloss] of senses(candidate) ?? []) {
      add(candidate, { kind: 'dictionary', headword: candidate, pos, gloss });
    }
  }
  return [...found].map(([headword, meanings]) => ({ headword, meanings }));
}

const files = new Map<string, Promise<DictionaryFile>>();

function loadLetter(letter: string): Promise<DictionaryFile> {
  const url = urls[letter];
  if (!url) return Promise.resolve({});
  let file = files.get(letter);
  if (!file) {
    file = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Could not load the dictionary (${res.status})`);
      return res.json() as Promise<DictionaryFile>;
    });
    file.catch(() => files.delete(letter));
    files.set(letter, file);
  }
  return file;
}

/** Looks a word up in the bank and the dictionary. */
export async function lookUp(word: string, bank: Bank): Promise<Found[]> {
  const candidates = lemmaCandidates(word.trim());
  const letters = [...new Set(candidates.map((c) => c[0]).filter((c) => c && /[a-z]/.test(c)))];
  const loaded = await Promise.all(letters.map((l) => loadLetter(l!)));
  const byLetter = new Map(letters.map((l, i) => [l!, loaded[i]!]));
  return meaningsFor(word, bank, (headword) =>
    Object.hasOwn(byLetter.get(headword[0]!) ?? {}, headword)
      ? byLetter.get(headword[0]!)![headword]
      : undefined,
  );
}
