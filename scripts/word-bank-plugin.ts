// Vite plugin that serves `virtual:word-bank`: every entry in content/entries/*.json,
// joined with IPA, spellings, band and priority from content/candidates.json. Doing the
// join at build time keeps the 1.5 MB candidate list out of the app.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { joinBank, type CandidateRow } from '../src/lib/content/bank';
import type { Entry } from '../src/lib/content/types';

const ID = 'virtual:word-bank';
const RESOLVED = '\0' + ID;

export function loadWordBank(contentDir: string) {
  const entriesDir = join(contentDir, 'entries');
  const files = readdirSync(entriesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(entriesDir, f));
  const entries = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Entry[]);
  const candidatesFile = join(contentDir, 'candidates.json');
  const rows = (JSON.parse(readFileSync(candidatesFile, 'utf8')) as { candidates: CandidateRow[] })
    .candidates;
  return { bank: joinBank(entries, rows), files: [...files, candidatesFile] };
}

export function wordBank(contentDir: string): Plugin {
  return {
    name: 'word-bank',
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const { bank, files } = loadWordBank(contentDir);
      for (const file of files) this.addWatchFile(file);
      return `export default ${JSON.stringify(bank)};`;
    },
  };
}
