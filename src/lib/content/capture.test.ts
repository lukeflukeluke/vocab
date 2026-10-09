import { describe, expect, it } from 'vitest';
import {
  asSentence,
  capturedEntryId,
  cleanWord,
  entryFromSense,
  lemmaCandidates,
  regularForms,
  splitCapture,
  withCapturedSentences,
  wordsOf,
} from './capture';
import { sampleBank } from '../testing/bank';

describe('splitCapture', () => {
  it('takes a short capture as the word, tidied', () => {
    expect(splitCapture('  “Salient,” ')).toEqual({ word: 'Salient' });
    expect(splitCapture('insofar as')).toEqual({ word: 'insofar as' });
    expect(splitCapture('posited', 'She  posited\nthat...')).toEqual({
      word: 'posited',
      context: 'She posited that...',
    });
  });

  it('takes a longer capture as a passage to pick the word from', () => {
    const text = 'The most salient point was buried.';
    expect(splitCapture(text)).toEqual({ word: '', context: text });
    expect(wordsOf(text)).toEqual(['The', 'most', 'salient', 'point', 'was', 'buried']);
  });

  it('cuts very long passages', () => {
    const { context } = splitCapture('word '.repeat(400));
    expect(context!.length).toBeLessThanOrEqual(600);
    expect(context!.endsWith('...')).toBe(true);
  });

  it('cleans words', () => {
    expect(cleanWord('(laconic)!')).toBe('laconic');
    expect(cleanWord('self-evident.')).toBe('self-evident');
  });
});

describe('lemmaCandidates', () => {
  it('guesses dictionary forms of inflected words', () => {
    expect(lemmaCandidates('posited')).toContain('posit');
    expect(lemmaCandidates('studies')).toContain('study');
    expect(lemmaCandidates('referred')).toContain('refer');
    expect(lemmaCandidates('undermining')).toContain('undermine');
    expect(lemmaCandidates('stopping')).toContain('stop');
    expect(lemmaCandidates('Salient')[0]).toBe('salient');
  });
});

describe('entryFromSense', () => {
  const sense = {
    headword: 'posit',
    pos: 'v' as const,
    definition: 'take as a given; assume as a postulate or axiom',
    context: 'She posited that the effect was real.',
    form: 'posited',
  };

  it('makes an entry with your sentence as its example and blank', () => {
    const entry = entryFromSense(sense);
    expect(entry.id).toBe(capturedEntryId('posit', 'v', sense.definition));
    expect(entry.id.startsWith('my:posit#v.')).toBe(true);
    expect(entry.definition).toBe('Take as a given; assume as a postulate or axiom.');
    expect(entry.examples).toEqual([
      { text: sense.context, form: 'posited', setting: 'captured' },
    ]);
    expect(entry.cloze[0]).toEqual({ text: 'She ___ that the effect was real.', answer: 'posited' });
    expect(entry.cloze[1]!.answer).toBe('posit');
    expect(entry.cloze[1]!.text).toContain('___');
    expect(entry.forms).toEqual(['posited', 'posits', 'positing']);
  });

  it('works without a sentence', () => {
    const entry = entryFromSense({ headword: 'Salient', pos: 'adj', definition: 'prominent' });
    expect(entry.headword).toBe('salient');
    expect(entry.examples).toHaveLength(1);
    expect(entry.cloze).toHaveLength(1);
  });

  it('gives the same id on every device', () => {
    expect(capturedEntryId('posit', 'v', ' Take as given ')).toBe(
      capturedEntryId('Posit', 'v', 'take as given'),
    );
    expect(capturedEntryId('posit', 'v', 'a')).not.toBe(capturedEntryId('posit', 'v', 'b'));
  });

  it('writes regular forms', () => {
    expect(regularForms('study', 'v')).toEqual(['studies', 'studied', 'studying']);
    expect(regularForms('box', 'n')).toEqual(['boxes']);
    expect(regularForms('salient', 'adj')).toEqual([]);
    expect(asSentence('prominent')).toBe('Prominent.');
  });
});

describe('withCapturedSentences', () => {
  it('adds your sentences after the written ones', () => {
    const entry = sampleBank().entries[0]!;
    const form = entry.forms[0] ?? entry.headword;
    const mine = `Yesterday I read that ${form} was the point.`;
    const more = withCapturedSentences(entry, [mine, 'A sentence without the word.']);
    expect(more.examples).toHaveLength(entry.examples.length + 1);
    expect(more.examples.at(-1)).toEqual({ text: mine, form, setting: 'captured' });
    expect(more.cloze.at(-1)!.text).toBe('Yesterday I read that ___ was the point.');
    expect(withCapturedSentences(entry, [])).toBe(entry);
  });
});
