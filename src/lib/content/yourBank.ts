import type { State } from '../state/state';
import { makeBank, type Bank, type BankEntry } from './bank';
import { withCapturedSentences } from './capture';

// The bank as you see it: the shipped entries, the entries made for words you captured
// that are not in the bank, and your captured sentences added to the words they came from.
// Everything else (planner, sessions, stats) works on this, so a captured word is learned
// like any other.

let last: { base: Bank; entries: State['entries']; words: State['words']; bank: Bank } | null =
  null;

export function yourBank(base: Bank, state: State): Bank {
  if (last && last.base === base && last.entries === state.entries && last.words === state.words) {
    return last.bank;
  }
  const made = Object.values(state.entries)
    .filter((e) => !base.byId.has(e.id))
    .map((e): BankEntry => ({ ...e, band: null, priority: 0 }));
  const withSentences = (entry: BankEntry) => {
    const contexts = state.words[entry.id]?.contexts;
    return contexts?.length ? withCapturedSentences(entry, contexts) : entry;
  };
  const changed = Object.keys(state.entries).length > 0 || hasContexts(state);
  const bank = changed
    ? { ...makeBank([...base.entries, ...made].map(withSentences)), candidates: base.candidates }
    : base;
  last = { base, entries: state.entries, words: state.words, bank };
  return bank;
}

function hasContexts(state: State): boolean {
  for (const word of Object.values(state.words)) if (word.contexts.length) return true;
  return false;
}
