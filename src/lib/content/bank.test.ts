import { describe, expect, it } from 'vitest';
import { sampleBank } from '../testing/bank';
import { formsOf, joinBank, otherSpelling } from './bank';
import type { Entry } from './types';

describe('joinBank', () => {
  it('adds IPA, band and priority from the candidate list', () => {
    const bank = sampleBank();
    const laconic = bank.byId.get('laconic#adj')!;
    expect(laconic.ipa?.uk).toBeTruthy();
    expect(laconic.band).toBe(14);
    expect(laconic.priority).toBeGreaterThan(1);
  });

  it('orders candidates by priority', () => {
    const bank = sampleBank();
    expect(bank.candidates).toHaveLength(20);
    expect(bank.candidates[0]).toBe('juxtapose#v');
    const priorities = bank.candidates.map((id) => bank.byId.get(id)!.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });

  it('copes with words that are not on the list', () => {
    const entry = { id: 'zzz#n', headword: 'zzz', forms: [] } as unknown as Entry;
    expect(joinBank([entry], [])[0]).toMatchObject({ band: null, priority: 0 });
  });
});

describe('spellings', () => {
  const idolise = { uk: 'idolise', us: 'idolize' };
  const fervour = { uk: 'fervour', us: 'fervor' };

  it('swaps the part that differs, in any form', () => {
    expect(otherSpelling('idolised', idolise)).toBe('idolized');
    expect(otherSpelling('idolizing', idolise)).toBe('idolising');
    expect(otherSpelling('fervour', fervour)).toBe('fervor');
    expect(otherSpelling('fervor', fervour)).toBe('fervour');
    expect(otherSpelling('idol', idolise)).toBeNull();
  });

  it('lists every form in both spellings', () => {
    const entry = {
      ...sampleBank().byId.get('posit#v')!,
      headword: 'idolise',
      forms: ['idolises', 'idolised'],
      spellings: idolise,
    };
    expect(formsOf(entry)).toEqual([
      'idolise',
      'idolises',
      'idolised',
      'idolize',
      'idolizes',
      'idolized',
    ]);
  });
});
