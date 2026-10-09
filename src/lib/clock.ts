// The app's clock. Normally the real time. The hidden "time travel" setting (Settings, tap
// the version 7 times) moves it forward by whole days, to try weeks of scheduling in
// minutes. Time travel always uses a separate test database, so real data is never
// touched by made-up dates.

const KEY = 'vocab.timeTravelDays';
const DAY_MS = 86_400_000;

function read(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : Number(raw) || 0;
  } catch {
    return null;
  }
}

/** Days added to the clock, or null when time travel is off. */
export function timeTravelDays(): number | null {
  return read();
}

/** Turns time travel on (a number of days, 0 or more) or off (null). Reload afterwards. */
export function setTimeTravel(days: number | null): void {
  try {
    if (days === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(Math.max(0, Math.round(days))));
  } catch {
    // Storage blocked: time travel just stays off.
  }
}

/** The current time, moved forward when time travelling. */
export function now(): number {
  return Date.now() + (read() ?? 0) * DAY_MS;
}

/** Minutes to add to UTC for local time: `-new Date().getTimezoneOffset()`. */
export function tzOffsetMinutes(): number {
  return -new Date(now()).getTimezoneOffset();
}

/** Name of the database to use: a separate one while time travelling. */
export function databaseName(): string {
  return read() === null ? 'vocab' : 'vocab-test';
}
