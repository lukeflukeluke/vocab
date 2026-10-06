// Checks every word-bank entry in content/entries/*.json.
//
//   npm run validate:content                    check all entries
//   npm run validate:content -- --preview FILE  also print FILE as readable Markdown
//
// Exits with 1 if any entry fails a check.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Entry } from '../src/lib/content/types';
import { validateEntries } from '../src/lib/content/validate';

const root = new URL('../content/', import.meta.url).pathname;
const entriesDir = join(root, 'entries');

const candidates = new Set(
  (
    JSON.parse(readFileSync(join(root, 'candidates.json'), 'utf8')) as {
      candidates: { word: string }[];
    }
  ).candidates.map((c) => c.word),
);

const files = readdirSync(entriesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const entries: Entry[] = [];
for (const file of files) {
  const data = JSON.parse(readFileSync(join(entriesDir, file), 'utf8')) as unknown;
  if (!Array.isArray(data)) {
    console.error(`${file}: must be a JSON array of entries`);
    process.exit(1);
  }
  entries.push(...(data as Entry[]));
}

const issues = validateEntries(entries, candidates);
for (const issue of issues) console.error(`${issue.id}  ${issue.field}: ${issue.message}`);
console.log(`${entries.length} entries in ${files.length} files, ${issues.length} problems`);

const previewAt = process.argv.indexOf('--preview');
if (previewAt !== -1) {
  const file = process.argv[previewAt + 1];
  if (!file) throw new Error('--preview needs a file name');
  const batch = JSON.parse(readFileSync(join(entriesDir, file), 'utf8')) as Entry[];
  console.log();
  for (const e of batch) {
    console.log(`### ${e.headword} (${e.pos}): ${e.sense}`);
    console.log(`${e.definition} *${e.register}; everyday: ${e.everyday}*\n`);
    console.log(`${e.nuance}\n`);
    for (const x of e.examples) console.log(`- (${x.setting}) ${x.text}`);
    for (const c of e.cloze) console.log(`- blank: ${c.text} → ${c.answer}`);
    for (const m of e.misuse) console.log(`- wrong: ${m.text} (${m.why})`);
    console.log(`- vs: ${e.synonyms.map((s) => `${s.word}: ${s.vs}`).join(' / ')}\n`);
  }
}

process.exit(issues.length ? 1 : 0);
