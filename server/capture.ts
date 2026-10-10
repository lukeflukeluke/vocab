// POST /api/capture: the iOS Shortcut "Add to Wordhoard" sends what you shared here (PLAN
// 13.5). On iPhone a shared word cannot go straight into the home-screen app (a link
// would open Safari, which keeps separate storage), so the server writes it into your
// event log as a `word_captured` event and every device picks it up on its next sync.
//
// The reply is plain text, because the Shortcut shows it as a notification.

import { splitCapture } from '../src/lib/content/capture';
import type { WordCaptured } from '../src/lib/events/types';
import { isValidKey, normalizeKey } from '../src/lib/sync/key';
import { accountOf, storeEvents, type SyncDb, type WireEvent } from './sync';

const MAX_TEXT = 2000;

const text = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** The key from "Authorization: Bearer KEY", forgiving spaces, dashes and look-alikes. */
function keyFrom(request: Request): string | null {
  const raw = (request.headers.get('Authorization') ?? '').replace(/^\s*Bearer\s*/i, '');
  return isValidKey(raw) ? normalizeKey(raw) : null;
}

/** The fields sent, as JSON, a form, or plain text (just the text). */
async function fieldsOf(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('Content-Type') ?? '';
  if (type.includes('application/json')) {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return {};
    return body as Record<string, unknown>;
  }
  if (type.includes('form')) return Object.fromEntries(await request.formData());
  return { text: await request.text() };
}

const field = (fields: Record<string, unknown>, name: string, max: number) => {
  const value = fields[name];
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
};

export async function handleCapture(
  request: Request,
  db: SyncDb | undefined,
  now: number,
  newId: () => string = () => crypto.randomUUID(),
): Promise<Response> {
  if (!db) return text("Wordhoard's sync server isn't set up yet (see docs/SETUP-SYNC.md).", 503);
  const key = keyFrom(request);
  if (!key) {
    return text(
      'Your sync key is missing or mistyped. Check the Authorization header in the Shortcut.',
      401,
    );
  }
  let fields: Record<string, unknown>;
  try {
    fields = await fieldsOf(request);
  } catch {
    return text('Could not read what was sent.', 400);
  }
  const shared = field(fields, 'text', MAX_TEXT) ?? '';
  const { word, context } = splitCapture(shared, field(fields, 'context', MAX_TEXT));
  if (!word && !context) return text('Nothing to add: share a word or a sentence.', 400);

  const title = field(fields, 'title', 300);
  const url = field(fields, 'url', MAX_TEXT);
  const body: WordCaptured = {
    type: 'word_captured',
    word,
    source: 'shortcut',
    ...(context && { context }),
    ...(title && { title }),
    ...(url && { url }),
  };
  const event: WireEvent = { ...body, id: newId(), t: now, device: 'server', v: 1 };
  await storeEvents(db, await accountOf(key), [event], now);
  return text(
    word
      ? `Added "${word}" to your Wordhoard Inbox.`
      : 'Added to your Wordhoard Inbox. Pick the word there.',
  );
}
