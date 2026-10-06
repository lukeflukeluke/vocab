import type { EventBody, VocabEvent } from '../events/types';

let counter = 0;

/** Builds an event for tests. Ids are padded counters so their order is predictable. */
export function makeEvent(
  body: EventBody,
  meta: Partial<Pick<VocabEvent, 'id' | 't' | 'device'>> = {},
): VocabEvent {
  counter += 1;
  return {
    id: meta.id ?? `e${String(counter).padStart(6, '0')}`,
    t: meta.t ?? counter,
    device: meta.device ?? 'test-device',
    v: 1,
    ...body,
  };
}

export { seededRandom } from '../random';

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
