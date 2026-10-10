import type { VocabEvent } from './events/types';

// The backup file: every event on this device, as JSON. Importing it on any device adds
// the events that are missing there; events already present are skipped (by id).

export const BACKUP_FORMAT = 'vocab-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  deviceId: string;
  events: VocabEvent[];
}

export function makeBackup(events: readonly VocabEvent[], deviceId: string, now: number): string {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date(now).toISOString(),
    deviceId,
    events: [...events],
  };
  return JSON.stringify(backup);
}

/** File name with the date, e.g. vocab-backup-2026-10-09.json. */
export function backupFileName(now: number): string {
  return `vocab-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
}

function isEvent(value: unknown): value is VocabEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.t === 'number' &&
    Number.isFinite(e.t) &&
    typeof e.device === 'string' &&
    typeof e.type === 'string' &&
    e.v === 1
  );
}

/** Reads a backup file. Throws with a plain message if it is not one. */
export function parseBackup(text: string): VocabEvent[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Wordhoard backup (it isn't JSON).");
  }
  const backup = data as Partial<Backup> | null;
  if (!backup || backup.format !== BACKUP_FORMAT || !Array.isArray(backup.events)) {
    throw new Error("That file isn't a Wordhoard backup.");
  }
  if (!backup.events.every(isEvent)) {
    throw new Error('That backup file is damaged: some events are not readable.');
  }
  return backup.events;
}
