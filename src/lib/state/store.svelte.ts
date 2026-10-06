import { VocabDB } from '../db/db';
import { EventLog } from '../db/eventLog';
import type { EventBody, VocabEvent } from '../events/types';
import { applyEvent, replay } from './reducer';
import { emptyState, type State } from './state';

/** The app's live data: the event log on this device and the state replayed from it. */
class VocabStore {
  state = $state.raw<State>(emptyState());
  deviceId = $state<string | null>(null);
  ready = $state(false);
  error = $state<string | null>(null);

  #log: EventLog | null = null;

  async init(db: VocabDB = new VocabDB()): Promise<void> {
    try {
      this.#log = await EventLog.open(db);
      this.deviceId = this.#log.deviceId;
      this.state = replay(await this.#log.all());
      this.ready = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** Records something the user just did and updates the state. */
  async record(body: EventBody): Promise<VocabEvent> {
    if (!this.#log) throw new Error('The event log is not open yet');
    const event = await this.#log.append(body);
    // A new local event always sorts last, so it can be applied without a full replay.
    this.state = applyEvent(this.state, event);
    return event;
  }
}

export const vocab = new VocabStore();
