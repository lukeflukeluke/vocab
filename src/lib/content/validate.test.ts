import { describe, expect, it } from 'vitest';
import sampleFile from '../../../content/entries/000-sample.json';
import type { Entry } from './types';
import { validateEntries, wordsIn } from './validate';

const samples = sampleFile as unknown as Entry[];
const candidates = new Set(samples.map((e) => e.headword));
const good = samples.find((e) => e.id === 'posit#v')!;

/** Problems found after changing one thing in a good entry. */
function problems(change: (e: Entry) => void): string[] {
  const entry = structuredClone(good);
  change(entry);
  return validateEntries([entry], candidates).map((i) => `${i.field}: ${i.message}`);
}

describe('validateEntries', () => {
  it('accepts the sample entries', () => {
    expect(validateEntries(samples, candidates)).toEqual([]);
  });

  it('checks the id against the headword and part of speech', () => {
    expect(problems((e) => (e.id = 'posit'))).toContainEqual(expect.stringMatching(/^id:/));
    expect(problems((e) => (e.id = 'posit#n'))).toContain('id: part of speech must match pos');
    expect(validateEntries([good, good], candidates)).toContainEqual(
      expect.objectContaining({ message: 'duplicate id' }),
    );
  });

  it('needs the headword on the candidate list unless marked offList', () => {
    expect(validateEntries([good], new Set())).toHaveLength(1);
    expect(validateEntries([{ ...good, offList: true }], new Set())).toEqual([]);
  });

  it('rejects a definition that uses the word or its family', () => {
    expect(problems((e) => (e.definition = 'To posit an idea for discussion.'))).toContain(
      'definition: must not use the word itself',
    );
    expect(problems((e) => (e.definition = 'Something that is posited for discussion.'))).toContain(
      'definition: must not use the word itself',
    );
  });

  it('rejects a blank that gives the answer away', () => {
    const found = problems(
      (e) => (e.cloze[0]!.text = 'She posited a theory and then ___ another one.'),
    );
    expect(found).toContain('cloze[0]: gives the answer away: the word or its family appears');
  });

  it('needs exactly one blank, a valid answer and enough context', () => {
    expect(
      problems((e) => (e.cloze[0]!.text = 'No gap in this sentence at all, sadly.')),
    ).toContain('cloze[0]: exactly one "___"');
    expect(problems((e) => (e.cloze[0]!.answer = 'propose'))).toContainEqual(
      expect.stringMatching(/answer "propose"/),
    );
    expect(problems((e) => (e.cloze[0]!.text = 'They ___ it.'))).toContain(
      'cloze[0]: needs more context (8 words at least)',
    );
  });

  it('checks examples: count, settings, form and sentence shape', () => {
    expect(problems((e) => e.examples.pop())).toContain('examples: exactly 6');
    expect(problems((e) => e.examples.forEach((x) => (x.setting = 'news')))).toContain(
      'examples: at least 3 different settings',
    );
    expect(problems((e) => (e.examples[0]!.form = 'posits'))).toContain(
      'examples[0]: must use "posits" exactly once',
    );
    expect(
      problems((e) => (e.examples[0]!.text = 'some economists posit that wages matter.')),
    ).toContain('examples[0]: start with a capital letter');
  });

  it('rejects long dashes, curly quotes and extra spaces anywhere', () => {
    expect(problems((e) => (e.nuance = 'Formal \u2014 very formal. Used in essays.'))).toContain(
      'nuance: use a normal hyphen, not a long dash',
    );
    expect(problems((e) => (e.examples[1]!.text += ' \u201cReally.\u201d'))).toContainEqual(
      expect.stringMatching(/straight quotes/),
    );
    expect(problems((e) => (e.everyday = 'suggest '))).toContain('everyday: extra spaces');
  });

  it('checks list sizes and that phrases contain the word', () => {
    expect(problems((e) => (e.partners = ['a link']))).toContain('partners: 3 to 6 items');
    expect(
      problems((e) => (e.phrases = ['Some scholars argue that...', 'It is tempting to posit...'])),
    ).toContain('phrases[0]: must contain the word');
    expect(
      problems((e) => (e.misuse[0]!.text = 'She placed the vase carefully on the shelf.')),
    ).toContain('misuse[0]: must use the word exactly once');
  });
});

describe('wordsIn', () => {
  it('keeps apostrophes and hyphens inside words', () => {
    expect(wordsIn("It's a short-lived, dry 'fine'.")).toEqual([
      "it's",
      'a',
      'short-lived',
      'dry',
      'fine',
    ]);
  });
});
