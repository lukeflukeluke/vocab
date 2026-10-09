import { describe, expect, it } from 'vitest';
import type { EventBody, ReviewDone, VocabEvent } from '../events/types';
import { makeEvent, seededRandom, shuffled } from '../testing/factories';
import { DAY_MS, remember } from '../scheduler/memory';
import { at, introduced, reviewed, sentence } from '../testing/history';
import { entryFromSense } from '../content/capture';
import { applyEvent, applyEvents, replay } from './reducer';
import { DEFAULT_SETTINGS, emptyState } from './state';

const added = (entryId: string, context?: string): EventBody => ({
  type: 'word_added',
  entryId,
  source: context ? 'captured' : 'bank',
  ...(context && { context }),
});

const review = (entryId: string, correct: boolean): ReviewDone => ({
  type: 'review',
  entryId,
  track: 'recognition',
  exercise: 'R1',
  correct,
  rating: correct ? 3 : 1,
  ms: 2400,
  hintsUsed: 0,
});

describe('replay', () => {
  it('starts from defaults with no events', () => {
    expect(replay([])).toEqual(emptyState());
    expect(replay([]).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('adds words and records reviews on the right track', () => {
    const state = replay([
      makeEvent(added('laconic#adj'), { t: 10 }),
      makeEvent(review('laconic#adj', true), { t: 20 }),
      makeEvent(
        {
          ...review('laconic#adj', false),
          track: 'production',
          exercise: 'P1',
          chose: 'terse#adj',
        },
        { t: 30 },
      ),
    ]);
    const word = state.words['laconic#adj']!;
    expect(word.addedAt).toBe(10);
    expect(word.status).toBe('active');
    expect(word.reviews.recognition).toHaveLength(1);
    expect(word.reviews.production).toEqual([
      {
        t: 30,
        device: 'test-device',
        exercise: 'P1',
        correct: false,
        rating: 1,
        ms: 2400,
        hintsUsed: 0,
        chose: 'terse#adj',
      },
    ]);
    expect(state.eventCount).toBe(3);
    expect(state.latestEventTime).toBe(30);
  });

  it('keeps the first add and collects new capture sentences', () => {
    const state = replay([
      makeEvent(added('posit#v', 'They posit a link.'), { t: 1 }),
      makeEvent(added('posit#v', 'They posit a link.'), { t: 2 }),
      makeEvent(added('posit#v', 'Some posit otherwise.'), { t: 3 }),
    ]);
    expect(state.words['posit#v']!.addedAt).toBe(1);
    expect(state.words['posit#v']!.contexts).toEqual([
      'They posit a link.',
      'Some posit otherwise.',
    ]);
  });

  it('lets the latest status and note win', () => {
    const state = replay([
      makeEvent(added('tacit#adj'), { t: 1 }),
      makeEvent({ type: 'word_status_set', entryId: 'tacit#adj', status: 'suspended' }, { t: 2 }),
      makeEvent({ type: 'word_status_set', entryId: 'tacit#adj', status: 'active' }, { t: 3 }),
      makeEvent(
        { type: 'note_set', entryId: 'tacit#adj', field: 'mnemonic', text: 'old' },
        { t: 4 },
      ),
      makeEvent(
        { type: 'note_set', entryId: 'tacit#adj', field: 'mnemonic', text: 'new' },
        { t: 5 },
      ),
    ]);
    expect(state.words['tacit#adj']!.status).toBe('active');
    expect(state.words['tacit#adj']!.notes).toEqual({ mnemonic: 'new' });
  });

  it('ignores events about words that were never added', () => {
    const state = replay([
      makeEvent(review('ghost#n', true)),
      makeEvent({ type: 'word_status_set', entryId: 'ghost#n', status: 'known' }),
    ]);
    expect(state.words).toEqual({});
    expect(state.eventCount).toBe(2);
  });

  it('ignores event types it does not know', () => {
    const future = {
      ...makeEvent(added('a')),
      type: 'from_a_newer_version',
    } as unknown as VocabEvent;
    expect(replay([future]).words).toEqual({});
  });

  it('merges settings patches and skips undefined values', () => {
    const state = replay([
      makeEvent({ type: 'settings_changed', patch: { dailyMinutes: 20 } }, { t: 1 }),
      makeEvent(
        { type: 'settings_changed', patch: { dailyMinutes: undefined, weekendMinutes: 30 } },
        { t: 2 },
      ),
    ]);
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, dailyMinutes: 20, weekendMinutes: 30 });
  });

  it('gives the same state whatever order the events arrive in', () => {
    const random = seededRandom(42);
    const words = ['a', 'b', 'c', 'd'];
    const events: VocabEvent[] = words.map((w, i) => makeEvent(added(w), { t: i }));
    for (let i = 0; i < 200; i++) {
      const word = words[Math.floor(random() * words.length)]!;
      const body: EventBody =
        random() < 0.7
          ? review(word, random() < 0.8)
          : { type: 'note_set', entryId: word, field: 'note', text: `note ${i}` };
      // Many events share a timestamp, so the id tie-break is exercised too.
      events.push(makeEvent(body, { t: 10 + Math.floor(i / 3) }));
    }
    const expected = replay(events);
    for (let round = 0; round < 20; round++) {
      expect(replay(shuffled(events, random))).toEqual(expected);
    }
  });
});

describe('applyEvent', () => {
  it('matches a full replay and leaves the previous state untouched', () => {
    const events = [
      makeEvent(added('salient#adj'), { t: 1 }),
      makeEvent(review('salient#adj', true), { t: 2 }),
      makeEvent({ type: 'settings_changed', patch: { dailyMinutes: 10 } }, { t: 3 }),
    ];
    const before = replay(events.slice(0, 2));
    const snapshot = structuredClone(before);
    const after = applyEvent(before, events[2]!);
    expect(after).toEqual(replay(events));
    expect(before).toEqual(snapshot);

    const next = applyEvent(after, makeEvent(review('salient#adj', false), { t: 4 }));
    expect(after.words['salient#adj']!.reviews.recognition).toHaveLength(1);
    expect(next.words['salient#adj']!.reviews.recognition).toHaveLength(2);
  });
});

describe('memory', () => {
  it('updates FSRS memory per track as reviews replay', () => {
    const state = replay([
      makeEvent(added('w'), { t: 1 }),
      makeEvent(review('w', true), { t: 2 }),
      makeEvent(review('w', false), { t: 2 + 3 * DAY_MS }),
    ]);
    const word = state.words['w']!;
    expect(word.memory.recognition).toEqual(remember(remember(null, 2, 3), 2 + 3 * DAY_MS, 1));
    expect(word.memory.recognition!.lapses).toBe(1);
    expect(word.memory.production).toBeNull();
  });

  it('counts a production pass as a recognition pass when recognition is due', () => {
    // Recognition is due around day 12 after these reviews.
    const base = [...introduced('w', 0), reviewed('w', 'recognition', at(2), 3)];
    const before = replay(base).words['w']!.memory.recognition!;

    const early = replay([...base, reviewed('w', 'production', at(3), 3)]).words['w']!;
    expect(early.memory.recognition).toEqual(before);

    const later = replay([...base, reviewed('w', 'production', at(40), 3)]).words['w']!;
    expect(later.memory.recognition!.lastReview).toBe(at(40));
    expect(later.memory.recognition!.stability).toBeGreaterThan(before.stability);

    const failed = replay([...base, reviewed('w', 'production', at(40), 1)]).words['w']!;
    expect(failed.memory.recognition).toEqual(before);
  });
});

describe('sentences', () => {
  it('records sentences with their verdicts', () => {
    const state = replay([...introduced('w', 0), sentence('w', 1, false), sentence('w', 2)]);
    expect(state.words['w']!.sentences.map((s) => s.accepted)).toEqual([false, true]);
    expect(replay([sentence('ghost', 1)]).words).toEqual({});
  });
});

describe('applyEvents', () => {
  it('matches a full replay for a batch of later events', () => {
    const first = introduced('a', 0);
    const later = [reviewed('a', 'recognition', at(2), 3), ...introduced('b', 2)];
    const before = replay(first);
    expect(applyEvents(before, later)).toEqual(replay([...first, ...later]));
    expect(before).toEqual(replay(first));
  });
});

describe('captures', () => {
  const captured = makeEvent(
    { type: 'word_captured', word: 'posited', context: 'She posited it.', source: 'shortcut' },
    { t: 10, id: 'cap-1' },
  );

  it('puts captured words in the Inbox until they are sorted', () => {
    const state = replay([captured]);
    expect(state.captures['cap-1']).toEqual({
      id: 'cap-1',
      t: 10,
      word: 'posited',
      context: 'She posited it.',
      source: 'shortcut',
    });
    const sorted = replay([
      captured,
      makeEvent(
        { type: 'capture_sorted', captureId: 'cap-1', decision: 'learn', entryId: 'posit#v' },
        { t: 20 },
      ),
      // The other device sorted it too, a moment later: the first decision stands.
      makeEvent({ type: 'capture_sorted', captureId: 'cap-1', decision: 'ignore' }, { t: 21 }),
    ]);
    expect(sorted.captures['cap-1']!.sorted).toEqual({
      t: 20,
      decision: 'learn',
      entryId: 'posit#v',
    });
  });

  it('keeps entries made for captured words, the first one if made twice', () => {
    const entry = entryFromSense({ headword: 'posit', pos: 'v', definition: 'assume' });
    const state = replay([
      makeEvent({ type: 'entry_created', entry }, { t: 1 }),
      makeEvent({ type: 'entry_created', entry: { ...entry, nuance: 'later' } }, { t: 2 }),
    ]);
    expect(state.entries[entry.id]).toEqual(entry);
  });

  it('hands out a new captures object instead of changing the old one', () => {
    const before = replay([]);
    const after = applyEvent(before, captured);
    expect(before.captures).toEqual({});
    expect(Object.keys(after.captures)).toEqual(['cap-1']);
  });
});
