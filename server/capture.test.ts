import { describe, expect, it } from 'vitest';
import { newSyncKey, formatKey } from '../src/lib/sync/key';
import { handleCapture } from './capture';
import { sqliteDb } from './sqlite';
import { accountOf, sync } from './sync';

const key = newSyncKey();

function post(body: BodyInit, type: string, auth = `Bearer ${key}`) {
  return new Request('https://x/api/capture', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': type },
    body,
  });
}

async function inbox(db: ReturnType<typeof sqliteDb>, k = key) {
  return (await sync(db, await accountOf(k), { cursor: 0, events: [] }, 0)).events;
}

describe('POST /api/capture', () => {
  it('writes a word_captured event that devices then sync', async () => {
    const db = sqliteDb();
    const res = await handleCapture(
      post(JSON.stringify({ text: ' “salient,” ' }), 'application/json'),
      db,
      1000,
      () => 'cap-1',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Added "salient" to your Vocab Inbox.');
    expect(await inbox(db)).toEqual([
      {
        id: 'cap-1',
        t: 1000,
        device: 'server',
        v: 1,
        type: 'word_captured',
        word: 'salient',
        source: 'shortcut',
      },
    ]);
  });

  it('keeps a shared sentence as a passage to pick the word from', async () => {
    const db = sqliteDb();
    const sentence = 'The most salient point of the report was buried on page nine.';
    const res = await handleCapture(post(sentence, 'text/plain'), db, 1000);
    expect(await res.text()).toContain('Pick the word there');
    const [event] = await inbox(db);
    expect(event).toMatchObject({ word: '', context: sentence });
  });

  it('accepts the key as shown in the app, with dashes and in lower case', async () => {
    const db = sqliteDb();
    const shown = formatKey(key).toLowerCase();
    const res = await handleCapture(post('posit', 'text/plain', `Bearer ${shown}`), db, 1);
    expect(res.status).toBe(200);
    expect(await inbox(db)).toHaveLength(1);
  });

  it('accepts a form, with the sentence and page', async () => {
    const db = sqliteDb();
    const form = new URLSearchParams({
      text: 'posited',
      context: 'She posited that the effect was real.',
      title: 'A page',
      url: 'https://example.com/a',
    });
    await handleCapture(post(form, 'application/x-www-form-urlencoded'), db, 1);
    expect((await inbox(db))[0]).toMatchObject({
      word: 'posited',
      context: 'She posited that the effect was real.',
      title: 'A page',
      url: 'https://example.com/a',
    });
  });

  it('turns away a wrong key, an empty capture, and a missing database', async () => {
    const db = sqliteDb();
    const typo = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
    expect((await handleCapture(post('x', 'text/plain', `Bearer ${typo}`), db, 1)).status).toBe(
      401,
    );
    expect((await handleCapture(post('   ', 'text/plain'), db, 1)).status).toBe(400);
    expect((await handleCapture(post('x', 'text/plain'), undefined, 1)).status).toBe(503);
    expect(await inbox(db)).toEqual([]);
  });
});
