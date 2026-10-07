import { describe, expect, it } from 'vitest';
import { replay } from '../state/reducer';
import { sampleBank } from '../testing/bank';
import { introduced } from '../testing/history';
import { gapHint, meaningOptions, splitAtGap, splitAtWord, wordOptions } from './exercises';

const bank = sampleBank();
const laconic = bank.byId.get('laconic#adj')!;

describe('splitting sentences', () => {
  it('finds the whole word in any case', () => {
    expect(splitAtWord('Laconic, she said. A laconic reply.', 'laconic')).toEqual({
      before: '',
      middle: 'Laconic',
      after: ', she said. A laconic reply.',
    });
    expect(splitAtWord('Concessions were conceded.', 'conceded').middle).toBe('conceded');
    expect(splitAtWord('Nothing here.', 'laconic').middle).toBe('');
  });

  it('splits at the gap', () => {
    expect(splitAtGap('He gave a ___ answer.')).toEqual({
      before: 'He gave a ',
      middle: '___',
      after: ' answer.',
    });
  });
});

describe('meaningOptions', () => {
  it('gives the definition and three others of the same part of speech, repeatably', () => {
    const options = meaningOptions(laconic, bank, 'step-1');
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o.id === laconic.id)).toEqual([
      { id: laconic.id, text: laconic.definition },
    ]);
    for (const o of options) expect(bank.byId.get(o.id)!.pos).toBe('adj');
    expect(meaningOptions(laconic, bank, 'step-1')).toEqual(options);
  });

  it('fills in from other parts of speech when it must', () => {
    const albeit = bank.byId.get('albeit#conj')!;
    const options = meaningOptions(albeit, bank, 'x');
    expect(new Set(options.map((o) => o.id)).size).toBe(4);
  });

  it('never offers a near-synonym from the vs box', () => {
    const terse = { ...bank.byId.get('tacit#adj')!, id: 'terse#adj', headword: 'terse' };
    const withTerse = { ...bank, entries: [...bank.entries, terse] };
    for (let i = 0; i < 20; i++) {
      const ids = meaningOptions(laconic, withTerse, `s${i}`).map((o) => o.id);
      expect(ids).not.toContain('terse#adj');
    }
  });
});

describe('wordOptions', () => {
  it('uses your own words first', () => {
    const own = ['salient#adj', 'tenuous#adj', 'cogent#adj', 'tacit#adj'];
    const state = replay(own.flatMap((id, i) => introduced(id, i)));
    const options = wordOptions(laconic, bank, state, 'p3');
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.text)).toContain('laconic');
    for (const o of options) if (o.id !== laconic.id) expect(own).toContain(o.id);
  });

  it('fills in from the bank when you have few words', () => {
    const options = wordOptions(laconic, bank, replay([]), 'p3');
    expect(options).toHaveLength(4);
  });
});

describe('gapHint', () => {
  it('shows the first letter, then the letter count', () => {
    expect(gapHint('laconic', true, false)).toBe('l...');
    expect(gapHint('laconic', true, true)).toBe('l _ _ _ _ _ _');
    expect(gapHint('laconic', false, true)).toBe('_ _ _ _ _ _ _');
    expect(gapHint('laconic', false, false)).toBe('');
  });
});
