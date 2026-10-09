import { describe, expect, it } from 'vitest';
import { backupFileName, makeBackup, parseBackup } from './backup';
import { added, at, reviewed } from './testing/history';

describe('backup', () => {
  const events = [added('posit#v', 0), reviewed('posit#v', 'recognition', at(0), 3)];

  it('round-trips every event', () => {
    const text = makeBackup(events, 'device-1', at(1));
    expect(parseBackup(text)).toEqual(events);
    expect(JSON.parse(text)).toMatchObject({ format: 'vocab-backup', deviceId: 'device-1' });
  });

  it('names the file by date', () => {
    expect(backupFileName(Date.UTC(2026, 9, 9, 12))).toBe('vocab-backup-2026-10-09.json');
  });

  it('rejects files that are not backups, in plain words', () => {
    expect(() => parseBackup('hello')).toThrow("isn't JSON");
    expect(() => parseBackup('{"events": []}')).toThrow("isn't a Vocab backup");
    const broken = JSON.stringify({ format: 'vocab-backup', events: [{ id: 1 }] });
    expect(() => parseBackup(broken)).toThrow('damaged');
  });
});
