import { describe, expect, it } from 'vitest';
import type { PlacementResult } from '../events/types';
import { replay } from '../state/reducer';
import { sampleBank } from '../testing/bank';
import { added, at, introduced } from '../testing/history';
import { makeEvent } from '../testing/factories';
import { frontierFit, orderCandidates } from './candidates';

const bank = sampleBank();

function placement(known: Record<number, number>): PlacementResult {
  const bands = Array.from({ length: 16 }, (_, i) => ({ band: i + 1, known: known[i + 1] ?? 0 }));
  return { bands, size: 20000, low: 18000, high: 22000, falseAlarms: 0, frontier: [] };
}

const placed = (result: PlacementResult) =>
  makeEvent({ type: 'placement_done', answers: [], result }, { t: at(0, 8) });

describe('frontierFit', () => {
  it('prefers bands you half know and avoids ones you know already', () => {
    const p = placement({ 10: 1, 12: 0.55, 14: 0.1 });
    expect(frontierFit(12, p)).toBe(1);
    expect(frontierFit(10, p)).toBe(-1);
    expect(frontierFit(14, p)).toBeLessThan(0.3);
    expect(frontierFit(12, null)).toBe(0);
    expect(frontierFit(null, p)).toBe(0);
  });
});

describe('orderCandidates', () => {
  it('offers every word you do not have yet', () => {
    const state = replay([added('laconic#adj', 0)]);
    const order = orderCandidates(bank, state, at(0), 0);
    expect(order).toHaveLength(19);
    expect(order).not.toContain('laconic#adj');
  });

  it('puts words from your frontier first', () => {
    // laconic is band 14, the other samples mostly 10 to 12.
    const p = placement({ 10: 1, 11: 1, 12: 1, 13: 0.9, 14: 0.5 });
    const order = orderCandidates(bank, replay([placed(p)]), at(1), 0);
    expect(order[0]).toBe('laconic#adj');
  });

  it('keeps near-synonyms of words met this week back', () => {
    // A made-up entry that names laconic in its vs box.
    const terse = { ...bank.byId.get('tacit#adj')!, id: 'terse#adj', headword: 'terse' };
    terse.synonyms = [{ word: 'laconic', vs: 'Similar.' }];
    terse.priority = 1.6;
    const withTerse = { ...bank, entries: [...bank.entries, terse] };
    const fresh = orderCandidates(withTerse, replay([]), at(0), 0);
    expect(fresh[0]).toBe('terse#adj');
    const afterLaconic = orderCandidates(withTerse, replay(introduced('laconic#adj', 0)), at(2), 0);
    expect(afterLaconic.indexOf('terse#adj')).toBeGreaterThan(10);
    // A week later it is fine again.
    const later = orderCandidates(withTerse, replay(introduced('laconic#adj', 0)), at(9), 0);
    expect(later[0]).toBe('terse#adj');
  });

  it('mixes parts of speech near the front', () => {
    const order = orderCandidates(bank, replay([]), at(0), 0).slice(0, 6);
    const pos = order.map((id) => bank.byId.get(id)!.pos);
    for (let i = 2; i < pos.length; i++) {
      expect(pos[i] === pos[i - 1] && pos[i] === pos[i - 2]).toBe(false);
    }
  });
});
