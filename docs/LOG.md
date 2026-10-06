# Session log

Newest first. Every session adds an entry at the top.

---

## 2026-10-06 · S2: The scheduler and time tailoring

**Done**
- `src/lib/scheduler/`:
  - FSRS memory per track (ts-fsrs 5, FSRS-6), updated by the reducer on every review
  - the 4am study day
  - ratings from answers (PLAN 6.2), with the usual answer time per exercise and device
  - the stage ladder, including dropping back down
  - the unlock and sibling rules
  - the daily planner: due reviews most at risk first, writing tasks, new words; time
    budget from your pace; heavy-day throttle; catch-up mode; "busy week ahead" mode;
    weekend minutes; "what's left today" after studying
- The simulation (`src/lib/scheduler/simulation.ts`, `npm run simulate`): a virtual
  learner on the real planner and reducer. Results in `docs/SIMULATION.md`; they set
  `NEW_WORDS_BY_MINUTES` and the PLAN 6.7 table.
- New event type `sentence_written` (U1/U3 sentence with an accepted verdict), needed for
  the Use and Owned stages. New settings `busyStart` and `busyEnd`. `ReviewRecord` now
  keeps the device. No review events have been written anywhere yet, so nothing old
  needed migrating.
- Tests: 76 unit tests, including the planner rules, FSRS matching ts-fsrs run directly,
  and a simulation whose day-by-day state equals a full replay of its events.

**Decisions**
- **Recognition retires once production has been passed.** After the first passed
  production review, recognition is not scheduled on its own. The simulation showed about
  25% fewer daily reviews and more words reaching Use and Owned, with the same recall.
  PLAN 5 and 6.3 updated.
- **Priority each day: reviews, then writing tasks, then new words**, which fill the time
  left up to the day's most. Writing tasks are capped at the day's new-word target + 2.
- **New-word targets (most per day): 5 min 3, 10 min 3, 15 min 5, 20 min 6, 30 min 7,
  45 min 10.** These are the smallest targets within 10% of the best "Use or Owned after
  6 months" (steadier days than the very best). Typical steady day at 15 min: 33 reviews,
  3 writing tasks, 3 new words.
- Every word needs one accepted sentence to reach Use, so writing costs about a minute
  per word. That is the main reason 15 minutes gives about 3 new words a day, not the 5
  the plan first guessed.
- FSRS minute-based learning steps are off. The session runner places in-session repeats,
  and FSRS-6 handles same-day reviews. Lapses only count failed reviews at least 12 hours
  after the previous one.
- Heavy-day throttle: compares today's due reviews with the average reviews per study
  day over the last 14 days (introduction days excluded); only active after 14 days of
  history.

**Notes for later sessions**
- S3/S5: the planner takes `candidates` (bank entry ids, best first). Priority scoring and
  the 7-day interference rule for confusables (PLAN 3.4, 6.6) belong in building that list.
- S4: during an introduction, record every check on the **recognition** track (including
  the first-letter blank). Use `rateAnswer` with `usualResponseMs(state, exercise,
  deviceId)`. Exercise choice per review (PLAN 5) is not built yet.
- S5: pass `tzOffsetMinutes = -new Date().getTimezoneOffset()`. Plans can include
  writing tasks before S10 builds them; show them as "coming soon" or leave them out of
  the session until then. Busy-period and weekend settings need UI.
- S9: contrast drills are not in the planner yet. Leech counts are in `Memory.lapses`.
- S15: memory is computed with default FSRS parameters. When personal parameters arrive,
  replay should read the final parameters first, then rebuild every memory with them.
- ts-fsrs counts elapsed days by UTC calendar day, so a review just after UTC midnight
  can look a day later to FSRS. That only matters for late-night study, and it is small.

**Owner to-do**
1. Read the Results table in `docs/SIMULATION.md` (2 minutes) and tell me your daily
   time. 15 minutes means about 3 new words, 3 sentences and 33 reviews on a typical day.
2. Say "merge". Nothing changes on screen yet; the planner is used from S4.

**Next:** S3, the word bank pipeline.

---

## 2026-10-06 · Setup: Cloudflare and iPhone

**Done**
- The owner connected Cloudflare Pages: project `vocab-build`, live at
  https://vocab-build.pages.dev, built from `main`.
- The owner installed the app on the iPhone home screen. "Works offline" shows Ready, and
  the app opens in Airplane Mode.
- Pull request previews work: the Cloudflare bot comments on each pull request with a
  per-commit Preview URL and a Branch Preview URL (the branch name, shortened, e.g.
  `claude-vocab-app-design-gz0b.vocab-build.pages.dev`).
- Recorded the address in `CLAUDE.md` and ticked Day 0 and S1's owner steps in the ROADMAP.

**Notes for later sessions**
- The first attempt to create the Pages project failed with Cloudflare's "An unknown
  error occurred", then later went through. If it happens again: check the account email
  is verified, retry, or try another browser.
- Cloud sessions cannot reach `pages.dev` (network policy). The owner can allow it under
  the environment's Network access settings if a session ever needs to check the live
  site.

**Owner to-do:** say "merge".

**Next:** S2, the scheduler and time tailoring.

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
