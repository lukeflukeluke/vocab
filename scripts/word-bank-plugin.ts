// Vite plugin for the word bank. `virtual:word-bank` exports the URL of a JSON file with
// every entry in content/entries/*.json, joined with IPA, spellings, band and priority
// from content/candidates.json. The app fetches that file at start.
//
// A separate JSON file (rather than code) keeps the app's script small however big the
// bank grows, and the service worker caches it for offline use like any other file.
//
// `virtual:dictionary` does the same for the compact dictionary (content/dictionary/, one
// file per first letter), used to look up captured words: it exports { a: url, ... }.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { joinBank, type CandidateRow } from '../src/lib/content/bank';
import type { Entry } from '../src/lib/content/types';

const ID = 'virtual:word-bank';
const RESOLVED = '\0' + ID;
/** Where the dev server serves the bank. Builds use a hashed file in assets/. */
const DEV_URL = '/@word-bank.json';
const DICTIONARY = 'virtual:dictionary';
const DICTIONARY_RESOLVED = '\0' + DICTIONARY;
const DICTIONARY_DEV = '/@dictionary/';

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
      server.middlewares.use(DICTIONARY_DEV, (req, res, next) => {
        const letter = /^\/([a-z])\.json/.exec(req.url ?? '')?.[1];
        if (!letter) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(join(contentDir, 'dictionary', `${letter}.json`)));
      });
    },
    resolveId(id) {
      if (id === ID) return RESOLVED;
      if (id === DICTIONARY) return DICTIONARY_RESOLVED;
      return undefined;
    },
    load(id) {
      if (id === DICTIONARY_RESOLVED) {
        const dir = join(contentDir, 'dictionary');
        const letters = readdirSync(dir)
          .filter((f) => /^[a-z]\.json$/.test(f))
          .map((f) => f[0]!)
          .sort();
        const urls = letters.map((letter) => {
          const file = join(dir, `${letter}.json`);
          this.addWatchFile(file);
          if (!building) return `${letter}: ${JSON.stringify(`${DICTIONARY_DEV}${letter}.json`)}`;
          const ref = this.emitFile({
            type: 'asset',
            name: `dictionary-${letter}.json`,
            source: readFileSync(file, 'utf8'),
          });
          return `${letter}: import.meta.ROLLUP_FILE_URL_${ref}`;
        });
        return `export default { ${urls.join(', ')} };`;
      }
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
