import { seedOf, splitAtWord } from '../session/exercises';
import type { Entry, EntryPos } from './types';

// Words captured from reading (PLAN 3.3): telling a word from a passage, guessing the
// dictionary form of "posited", and building a simple entry for a word that is not in the
// word bank, from one sense of the compact dictionary (content/dictionary/).
//
// Used by the app and by the sync server (server/capture.ts), so it must stay pure.

/** Longest passage kept with a capture. */
export const MAX_CONTEXT = 600;
/** Captures of up to this many words are taken as the word itself, not as a passage. */
const MAX_WORD_PARTS = 3;

/** Trims spaces, quotes and punctuation around a word: "“salient,”" gives "salient". */
export function cleanWord(text: string): string {
  return text
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ');
}

/** Tidies a sentence: one line, single spaces, not too long. */
export function cleanContext(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > MAX_CONTEXT ? `${one.slice(0, MAX_CONTEXT - 3).trimEnd()}...` : one;
}

/**
 * What a capture holds. A short text is the word; a longer one is a passage whose word is
 * picked later in the Inbox (an iOS share of a selected sentence, say).
 */
export function splitCapture(text: string, context?: string): { word: string; context?: string } {
  const ctx = context ? cleanContext(context) : '';
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length > MAX_WORD_PARTS) {
    return { word: '', context: ctx || cleanContext(text) };
  }
  const word = cleanWord(text);
  return ctx ? { word, context: ctx } : { word };
}

/** The words of a passage, for picking the one you meant. */
export function wordsOf(passage: string): string[] {
  return passage
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => /\p{L}/u.test(w));
}

const VOWEL = /[aeiou]/;

/**
 * Possible dictionary forms of a word as met, most likely first: "posited" gives "posited",
 * "posite", "posit"; "studies" gives "studies", "study". Only some exist; the caller looks
 * them up.
 */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out = [w];
  const add = (stem: string) => {
    if (stem.length >= 2 && VOWEL.test(stem) && !out.includes(stem)) out.push(stem);
  };
  const undouble = (stem: string) => {
    // "referred" -> "refer", "stopping" -> "stop"
    const n = stem.length;
    if (n >= 3 && stem[n - 1] === stem[n - 2] && !VOWEL.test(stem[n - 1]!)) add(stem.slice(0, -1));
  };
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('ed')) {
    add(w.slice(0, -1));
    add(w.slice(0, -2));
    undouble(w.slice(0, -2));
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(`${w.slice(0, -3)}e`);
    undouble(w.slice(0, -3));
  }
  if (w.endsWith('ier')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('iest')) add(`${w.slice(0, -4)}y`);
  if (w.endsWith('er')) add(w.slice(0, -2));
  if (w.endsWith('est')) add(w.slice(0, -3));
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return out;
}

/** Regular inflections, for checking typed answers on a captured word's entry. */
export function regularForms(headword: string, pos: EntryPos): string[] {
  const w = headword.toLowerCase();
  if (w.includes(' ')) return [];
  const consonantY = /[^aeiou]y$/.test(w);
  const plural = consonantY
    ? `${w.slice(0, -1)}ies`
    : /(s|x|z|ch|sh)$/.test(w)
      ? `${w}es`
      : `${w}s`;
  if (pos === 'n') return [plural];
  if (pos !== 'v') return [];
  const base = w.endsWith('e') ? w.slice(0, -1) : w;
  const past = consonantY ? `${w.slice(0, -1)}ied` : `${base}ed`;
  return [plural, past, `${base}ing`];
}

/** "having a quality that stands out" as a sentence: "Having a quality that stands out." */
export function asSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const first = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

/** Same headword, part of speech and meaning give the same id on every device. */
export function capturedEntryId(headword: string, pos: EntryPos, definition: string): string {
  return `my:${headword.toLowerCase()}#${pos}.${seedOf(definition.trim().toLowerCase()).toString(36)}`;
}

/** The first of `forms` used as a whole word in `text`, as written there. */
export function formIn(text: string, forms: readonly string[]): string | null {
  for (const form of forms) {
    const { middle } = splitAtWord(text, form);
    if (middle) return middle;
  }
  return null;
}

export interface CapturedSense {
  headword: string;
  pos: EntryPos;
  /** A dictionary gloss or a meaning you wrote. */
  definition: string;
  /** The sentence the word was met in. */
  context?: string;
  /** The word as met ("posited"). */
  form?: string;
}

/**
 * A plain entry for a word that is not in the bank: the meaning, your sentence as its
 * example and as a fill-in-the-blank, and a "word for this meaning" blank, which always
 * works. The richer parts of a bank entry are left empty.
 */
export function entryFromSense(sense: CapturedSense): Entry {
  const headword = sense.headword.trim().toLowerCase();
  const definition = asSentence(sense.definition);
  const met = sense.form?.toLowerCase();
  const forms = [
    ...new Set([...(met && met !== headword ? [met] : []), ...regularForms(headword, sense.pos)]),
  ].filter((f) => f !== headword);
  const context = sense.context ? cleanContext(sense.context) : '';
  const used = context ? formIn(context, [headword, ...forms]) : null;
  const gloss = definition.replace(/\.$/, '');
  return {
    id: capturedEntryId(headword, sense.pos, sense.definition),
    headword,
    pos: sense.pos,
    sense: gloss.length > 60 ? `${gloss.slice(0, 57).trimEnd()}...` : gloss,
    forms,
    definition,
    register: 'neutral',
    nuance: '',
    everyday: '',
    examples: used
      ? [{ text: context, form: used, setting: 'captured' }]
      : [{ text: headword, form: headword, setting: 'captured' }],
    cloze: [
      ...(used ? [{ text: splitWith(context, used), answer: used.toLowerCase() }] : []),
      { text: `A word for "${gloss.charAt(0).toLowerCase()}${gloss.slice(1)}": ___`, answer: headword },
    ],
    misuse: [],
    partners: [],
    phrases: [],
    family: [],
    synonyms: [],
    antonyms: [],
    confusables: [],
    roots: [],
    siblings: [],
    tags: ['captured'],
    offList: true,
  };
}

/** The sentence with the first whole-word use of `form` replaced by "___". */
function splitWith(text: string, form: string): string {
  const { before, middle, after } = splitAtWord(text, form);
  return middle ? `${before}___${after}` : text;
}

/**
 * A bank entry with your captured sentences added as extra examples and blanks (after the
 * written ones, so existing prompt ids keep their meaning). Sentences that do not contain
 * the word, or are already there, are left out.
 */
export function withCapturedSentences<E extends Entry>(entry: E, contexts: readonly string[]): E {
  const forms = [entry.headword, ...entry.forms];
  const known = new Set(entry.examples.map((x) => x.text));
  const examples = [...entry.examples];
  const cloze = [...entry.cloze];
  for (const context of contexts) {
    if (known.has(context)) continue;
    const used = formIn(context, forms);
    if (!used) continue;
    known.add(context);
    examples.push({ text: context, form: used, setting: 'captured' });
    cloze.push({ text: splitWith(context, used), answer: used.toLowerCase() });
  }
  return examples.length === entry.examples.length ? entry : { ...entry, examples, cloze };
}
