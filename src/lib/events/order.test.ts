import { describe, expect, it } from 'vitest';
import { makeEvent } from '../testing/factories';
import { compareEvents, mergeEvents, nextEventTime, sortEvents } from './order';

const added = (entryId: string) => ({
  type: 'word_added' as const,
  entryId,
  source: 'bank' as const,
});

describe('compareEvents', () => {
  it('orders by time first', () => {
    const early = makeEvent(added('a'), { id: 'z', t: 1 });
    const late = makeEvent(added('b'), { id: 'a', t: 2 });
    expect(sortEvents([late, early])).toEqual([early, late]);
  });

  it('breaks time ties by id', () => {
    const first = makeEvent(added('a'), { id: 'aaa', t: 5 });
    const second = makeEvent(added('b'), { id: 'bbb', t: 5 });
    expect(compareEvents(first, second)).toBeLessThan(0);
    expect(compareEvents(second, first)).toBeGreaterThan(0);
    expect(compareEvents(first, first)).toBe(0);
  });
});

describe('mergeEvents', () => {
  it('unions lists, drops duplicates and sorts', () => {
    const a = makeEvent(added('a'), { id: 'a', t: 1 });
    const b = makeEvent(added('b'), { id: 'b', t: 2 });
    const c = makeEvent(added('c'), { id: 'c', t: 3 });
    expect(mergeEvents([c, a], [b, a], [c])).toEqual([a, b, c]);
  });
});

describe('nextEventTime', () => {
  it('uses the clock when it is ahead of the log', () => {
    expect(nextEventTime(1000, 500)).toBe(1000);
  });

  it('stays after the latest event when the clock is behind', () => {
    expect(nextEventTime(1000, 5000)).toBe(5001);
    expect(nextEventTime(1000, 1000)).toBe(1001);
  });
});
