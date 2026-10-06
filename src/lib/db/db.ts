import Dexie, { type Table } from 'dexie';
import type { VocabEvent } from '../events/types';

export interface MetaRow {
  key: string;
  value: string;
}

/** The on-device database (IndexedDB). */
export class VocabDB extends Dexie {
  events!: Table<VocabEvent, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'vocab') {
    super(name);
    this.version(1).stores({
      // Primary key id; indexed by time for "latest event" lookups.
      events: 'id, t',
      meta: 'key',
    });
  }
}
