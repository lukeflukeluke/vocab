// Vite plugin for the word bank. `virtual:word-bank` exports the URL of a JSON file with
// every entry in content/entries/*.json, joined with IPA, spellings, band and priority
// from content/candidates.json. The app fetches that file at start.
//
// A separate JSON file (rather than code) keeps the app's script small however big the
// bank grows, and the service worker caches it for offline use like any other file.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { joinBank, type CandidateRow } from '../src/lib/content/bank';
import type { Entry } from '../src/lib/content/types';

const ID = 'virtual:word-bank';
const RESOLVED = '\0' + ID;
/** Where the dev server serves the bank. Builds use a hashed file in assets/. */
const DEV_URL = '/@word-bank.json';

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
  let building = false;
  return {
    name: 'word-bank',
    configResolved(config) {
      building = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use(DEV_URL, (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(loadWordBank(contentDir).bank));
      });
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const { bank, files } = loadWordBank(contentDir);
      for (const file of files) this.addWatchFile(file);
      if (!building) return `export default ${JSON.stringify(DEV_URL)};`;
      const ref = this.emitFile({
        type: 'asset',
        name: 'word-bank.json',
        source: JSON.stringify(bank),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}
