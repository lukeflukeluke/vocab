import type { Entry } from './types';

// The automatic checks every entry must pass (PLAN 11.4). Pure, so the app, the tests and
// scripts/validate-content.ts all use the same rules.

export interface Issue {
  id: string;
  field: string;
  message: string;
}

const POS = ['n', 'v', 'adj', 'adv', 'conj', 'prep'];
const REGISTERS = ['formal', 'neutral', 'informal'];
const SETTINGS = ['conversation', 'news', 'fiction', 'academic', 'formal'];
const ID = /^([a-z][a-z'-]*)#(n|v|adj|adv|conj|prep)(\.[2-9])?$/;
const WORD = /^[a-z][a-z'-]*$/;
const BLANK = '___';

/** Lower-case words in a text ("Laconic, isn't it?" gives laconic, isn't, it). */
export function wordsIn(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
}

function countWord(text: string, word: string): number {
  return wordsIn(text).filter((w) => w === word.toLowerCase()).length;
}

function sentenceLength(text: string): number {
  return wordsIn(text.replace(BLANK, ' blank ')).length;
}

export function validateEntries(
  entries: readonly Entry[],
  candidates: ReadonlySet<string>,
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = typeof entry.id === 'string' ? entry.id : '(no id)';
    const fail = (field: string, message: string) => issues.push({ id, field, message });
    if (seen.has(id)) fail('id', 'duplicate id');
    seen.add(id);
    checkEntry(entry, candidates, fail);
  }
  return issues;
}

function checkEntry(
  e: Entry,
  candidates: ReadonlySet<string>,
  fail: (field: string, message: string) => void,
): void {
  // Shape.
  const match = ID.exec(e.id ?? '');
  if (!match) return fail('id', 'must look like "posit#v" or "temper#v.2"');
  if (match[1] !== e.headword) fail('id', 'must start with the headword');
  if (match[2] !== e.pos) fail('id', 'part of speech must match pos');
  if (!WORD.test(e.headword ?? '')) fail('headword', 'lower-case letters only');
  if (!POS.includes(e.pos)) fail('pos', `one of ${POS.join(', ')}`);
  if (!REGISTERS.includes(e.register)) fail('register', `one of ${REGISTERS.join(', ')}`);
  if (!e.offList && !candidates.has(e.headword)) {
    fail('headword', 'not in content/candidates.json (set offList: true if deliberate)');
  }

  const forms = [e.headword, ...(e.forms ?? [])].map((f) => f.toLowerCase());
  const giveaways = [...forms, ...(e.family ?? []).map((f) => f.toLowerCase())];
  const mentions = (text: string) => giveaways.some((g) => countWord(text, g) > 0);
  for (const form of e.forms ?? []) if (!WORD.test(form)) fail('forms', `"${form}" is not a word`);

  // Every string: trimmed, single spaces, straight quotes, no long dashes.
  const strings: [string, string][] = [];
  const collect = (field: string, value: unknown) => {
    if (typeof value === 'string') strings.push([field, value]);
    else if (Array.isArray(value)) value.forEach((v, i) => collect(`${field}[${i}]`, v));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(`${field}.${k}`, v);
    }
  };
  for (const [k, v] of Object.entries(e)) collect(k, v);
  for (const [field, text] of strings) {
    if (text !== text.trim() || text.includes('  ')) fail(field, 'extra spaces');
    if (/[\u2012-\u2015]/.test(text)) fail(field, 'use a normal hyphen, not a long dash');
    if (/[\u2018\u2019\u201c\u201d]/.test(text)) fail(field, 'use straight quotes');
    if (text.length === 0) fail(field, 'empty');
  }

  // Sense, definition, nuance.
  if (!e.sense || wordsIn(e.sense).length > 12) fail('sense', 'a few words (12 at most)');
  if (!e.definition || !/[.]$/.test(e.definition)) fail('definition', 'one sentence ending in "."');
  else if (wordsIn(e.definition).length > 20) fail('definition', '20 words at most');
  if (e.definition && mentions(e.definition)) fail('definition', 'must not use the word itself');
  const nuanceSentences = (e.nuance ?? '').split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
  if (nuanceSentences < 2 || nuanceSentences > 3) fail('nuance', '2 or 3 sentences');
  if (wordsIn(e.nuance ?? '').length > 70) fail('nuance', '70 words at most');
  if (!e.everyday || wordsIn(e.everyday).length > 3)
    fail('everyday', 'a word or phrase of 3 words at most');
  else if (mentions(e.everyday)) fail('everyday', 'must not be the word itself');

  // Examples.
  const examples = e.examples ?? [];
  if (examples.length !== 6) fail('examples', 'exactly 6');
  const settings = new Set(examples.map((x) => x.setting));
  if (settings.size < 3) fail('examples', 'at least 3 different settings');
  if (!settings.has('academic')) fail('examples', 'at least one academic example');
  examples.forEach((x, i) => {
    const field = `examples[${i}]`;
    if (!SETTINGS.includes(x.setting)) fail(field, `setting is one of ${SETTINGS.join(', ')}`);
    if (!forms.includes(x.form?.toLowerCase()))
      fail(field, `form "${x.form}" is not the headword or one of forms`);
    else if (countWord(x.text, x.form) !== 1) fail(field, `must use "${x.form}" exactly once`);
    checkSentence(x.text, field, fail);
  });

  // Fill-in-the-blank sentences: the gap must not be given away.
  const cloze = e.cloze ?? [];
  if (cloze.length !== 3) fail('cloze', 'exactly 3');
  cloze.forEach((c, i) => {
    const field = `cloze[${i}]`;
    if (c.text.split(BLANK).length !== 2) fail(field, `exactly one "${BLANK}"`);
    if (!forms.includes(c.answer?.toLowerCase()))
      fail(field, `answer "${c.answer}" is not the headword or one of forms`);
    if (mentions(c.text)) fail(field, 'gives the answer away: the word or its family appears');
    if (sentenceLength(c.text) < 8) fail(field, 'needs more context (8 words at least)');
    checkSentence(c.text, field, fail);
  });
  const texts = [...examples.map((x) => x.text), ...cloze.map((c) => c.text.replace(BLANK, ''))];
  if (new Set(texts).size !== texts.length) fail('examples', 'sentences repeat');

  // Misuse sentences.
  const misuse = e.misuse ?? [];
  if (misuse.length !== 2) fail('misuse', 'exactly 2');
  misuse.forEach((m, i) => {
    const field = `misuse[${i}]`;
    if (forms.reduce((n, f) => n + countWord(m.text, f), 0) !== 1)
      fail(field, 'must use the word exactly once');
    checkSentence(m.text, field, fail);
    if (!m.why || wordsIn(m.why).length > 30) fail(field, 'why: 30 words at most');
  });

  // Lists.
  const between = (field: string, list: unknown[] | undefined, min: number, max: number) => {
    if (!Array.isArray(list) || list.length < min || list.length > max)
      fail(field, `${min} to ${max} items`);
  };
  between('partners', e.partners, 3, 6);
  between('phrases', e.phrases, 2, 4);
  between('family', e.family, 0, 8);
  between('synonyms', e.synonyms, 1, 4);
  between('antonyms', e.antonyms, 0, 4);
  between('confusables', e.confusables, 0, 3);
  between('roots', e.roots, 0, 4);
  between('siblings', e.siblings, 0, 5);
  between('tags', e.tags, 1, 3);
  for (const [field, list] of [
    ['partners', e.partners],
    ['phrases', e.phrases],
  ] as const) {
    (list ?? []).forEach((p, i) => {
      if (!forms.some((f) => countWord(p, f) > 0)) fail(`${field}[${i}]`, 'must contain the word');
    });
  }
  (e.synonyms ?? []).forEach((s, i) => {
    if (s.word === e.headword) fail(`synonyms[${i}]`, 'not the word itself');
    if (!s.vs || wordsIn(s.vs).length > 25) fail(`synonyms[${i}]`, 'vs: 25 words at most');
  });
  (e.tags ?? []).forEach((t, i) => {
    if (!/^[a-z]+$/.test(t)) fail(`tags[${i}]`, 'one lower-case word');
  });
  if (e.origin !== undefined && wordsIn(e.origin).length > 40) fail('origin', '40 words at most');
}

function checkSentence(text: string, field: string, fail: (f: string, m: string) => void): void {
  const length = sentenceLength(text ?? '');
  if (length < 6 || length > 30) fail(field, '6 to 30 words');
  if (!/^["']?[A-Z]/.test(text ?? '')) fail(field, 'start with a capital letter');
  if (!/[.!?]["']?$/.test(text ?? '')) fail(field, 'end with . ! or ?');
}
