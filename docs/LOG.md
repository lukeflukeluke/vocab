# Session log

Newest first. Every session adds an entry at the top.

---

## 2026-10-06 · S1: Foundations

**Done**
- Repo layout: `docs/` (PLAN, ROADMAP, this log, Cloudflare guide), `CLAUDE.md`, `README.md`.
- App skeleton: Svelte 5, Vite 8, TypeScript. Installable PWA (vite-plugin-pwa) that
  works offline. iPhone home-screen setup: icon, full-screen mode, white status-bar text
  over the indigo header, safe areas.
- Icons: a ladder (the "knowing a word is a ladder" idea), top rung in amber. Drawn by
  `scripts/make_icons.py`; the same drawing is in `public/favicon.svg` and
  `src/lib/Logo.svelte`.
- Data layer:
  - event types: `word_added`, `word_status_set`, `note_set`, `review`,
    `settings_changed`
  - `EventLog`: IndexedDB through Dexie, with a device id per install
  - the replay reducer, plus `applyEvent` for cheap updates after a local action
  - the `vocab` store the UI uses
- Placeholder home screen. It shows "Works offline", saved events, storage protection,
  device id and build version, plus an install tip when opened in a browser tab.
- Tests:
  - 19 unit tests, including a two-device sync simulation with clocks 5 minutes apart
  - 8 end-to-end tests on an iPhone-size and a desktop screen: home, storage survives a
    reload, manifest and icons, works offline
- Cloud-session startup hook (`.claude/hooks/session-start.sh`) runs `npm install`.

**Decisions**
- Event time = `max(clock, latest event + 1)`. Without it, an edit made on a device whose
  clock is behind could sort before the thing it edits, and be lost on replay. A test
  covers this.
- Canonical event order is (time, id), so every device replays identically.
- The reducer ignores unknown event types and events about words never added, so an
  older app version can still read a log written by a newer one.
- Pinned `@playwright/test` 1.56.1 (matches the preinstalled Chromium) and TypeScript
  6.x (svelte-check does not support 7).

**Notes for later sessions**
- S2: ts-fsrs is available on npm (5.x). FSRS state should be computed from
  `word.reviews` during replay or on demand. Keep the reducer free of clock reads; pass
  "now" into planning functions instead.
- S2 or later: replay is fast at today's sizes; add snapshots only when measurements
  say so.
- S4: the base font is 17px; keep inputs at 16px or more so iOS does not zoom.
- S6: decide between Cloudflare Pages Functions (same project as the app, likely
  simpler) and a separate Worker for the sync API.

**Owner to-do**
1. Merge this into `main` (say "merge" in the session).
2. Connect Cloudflare: `docs/SETUP-CLOUDFLARE.md` (about 10 minutes).
3. On your iPhone, add the app to your home screen and check it opens in Airplane Mode.

**Next:** S2, the scheduler and time tailoring. S3, the word bank pipeline, can run in
a second session on the same day.
