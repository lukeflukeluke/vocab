import { timeTravelDays, tzOffsetMinutes } from '../clock';
import { vocab } from '../state/store.svelte';
import { syncer } from '../sync/sync.svelte';

// Daily reminders (ROADMAP S8): a push notification at the time you choose, on days your
// session isn't done yet. The server sends them (server/reminders.ts); this side turns
// them on and off, and tells the server when today's session is done.

const META = {
  minute: 'reminder.minute',
  doneDay: 'reminder.doneDay',
};

/** The default reminder time: 19:00. */
export const DEFAULT_MINUTE = 19 * 60;

/** Half-hour steps from 6:00 to 23:30, as minutes after midnight. */
export const TIMES = Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30);

export function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export type ReminderState =
  | { phase: 'loading' }
  | { phase: 'unsupported' }
  | { phase: 'blocked' }
  | { phase: 'off' }
  | { phase: 'on'; minute: number };

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function api(path: string, body: unknown): Promise<Response> {
  const key = syncer.key;
  if (!key) throw new Error('Turn on sync first.');
  return fetch(`/api/push/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function subscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

class Reminders {
  state = $state<ReminderState>({ phase: 'loading' });
  error = $state<string | null>(null);

  /** Call once sync is set up. Refreshes the time zone on the server (it changes with DST). */
  async init(): Promise<void> {
    if (!pushSupported() || timeTravelDays() !== null) {
      this.state = { phase: 'unsupported' };
      return;
    }
    if (Notification.permission === 'denied') {
      this.state = { phase: 'blocked' };
      return;
    }
    const saved = await vocab.getMeta(META.minute);
    const sub = saved ? await subscription() : null;
    if (!saved || !sub) {
      this.state = { phase: 'off' };
      return;
    }
    const minute = Number(saved);
    this.state = { phase: 'on', minute };
    if (syncer.key) void this.#save(sub, minute).catch(() => undefined);
  }

  async #save(sub: PushSubscription, minute: number): Promise<void> {
    const res = await api('subscribe', {
      subscription: sub.toJSON(),
      minute,
      tz: tzOffsetMinutes(),
    });
    if (!res.ok) throw new Error(`The server said no (${res.status}).`);
  }

  /** Turns reminders on, or changes the time. Call from a tap: iPhone asks permission then. */
  async enable(minute: number): Promise<void> {
    this.error = null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.state = permission === 'denied' ? { phase: 'blocked' } : { phase: 'off' };
        return;
      }
      let sub = await subscription();
      if (!sub) {
        const res = await fetch('/api/push/key');
        if (!res.ok) throw new Error("The sync server isn't set up yet.");
        const { publicKey } = (await res.json()) as { publicKey: string };
        const registration = await navigator.serviceWorker.ready;
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: fromBase64Url(publicKey),
        });
      }
      await this.#save(sub, minute);
      await vocab.setMeta(META.minute, String(minute));
      this.state = { phase: 'on', minute };
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  async disable(): Promise<void> {
    this.error = null;
    try {
      const sub = await subscription();
      if (sub) {
        await api('unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      await vocab.setMeta(META.minute, null);
      this.state = { phase: 'off' };
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** Asks the server to send a reminder now. */
  async test(): Promise<boolean> {
    this.error = null;
    try {
      const sub = await subscription();
      if (!sub) throw new Error('Reminders are not on for this device.');
      const res = await api('test', { endpoint: sub.endpoint });
      if (!res.ok) throw new Error(`The reminder could not be sent (${res.status}).`);
      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * Today's session is done (on any device): no reminder today. Sent once per study day,
   * and only with sync on, outside time travel.
   */
  async done(day: number): Promise<void> {
    if (!syncer.key || timeTravelDays() !== null) return;
    if (Number((await vocab.getMeta(META.doneDay)) ?? -1) >= day) return;
    const res = await api('done', { day }).catch(() => null);
    if (res?.ok) await vocab.setMeta(META.doneDay, String(day));
  }
}

export const reminders = new Reminders();
