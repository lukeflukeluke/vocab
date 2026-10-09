import url from 'virtual:word-bank';
import { makeBank, type Bank, type BankEntry } from './bank';

// The word bank ships as its own JSON file (scripts/word-bank-plugin.ts). The app loads it
// once at start; the service worker keeps it for offline use.

let loaded: Bank | null = null;
let loading: Promise<Bank> | null = null;

export function loadBank(): Promise<Bank> {
  loading ??= fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load the word bank (${res.status})`);
      return res.json() as Promise<BankEntry[]>;
    })
    .then((entries) => (loaded = makeBank(entries)))
    .catch((err: unknown) => {
      loading = null;
      throw err;
    });
  return loading;
}

/** The loaded word bank. Only call this after `loadBank()` has finished. */
export function getBank(): Bank {
  if (!loaded) throw new Error('The word bank is not loaded yet');
  return loaded;
}
