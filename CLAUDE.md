# Vocab (the app is called Wordhoard)

A personal vocabulary app for one person (the repo owner). Its name in the UI, manifest and
icons is **Wordhoard** (Old English "word-hoard", a store of words); the repo, the
Cloudflare project, database names and storage keys (`vocab.*`) keep "vocab". The main device is an iPhone,
the second a PC. It is a local-first PWA: all logic runs on the device; a small sync
server (Cloudflare Pages Functions with D1) relays events between devices.

- Design: `docs/PLAN.md`
- Build order and progress: `docs/ROADMAP.md`
- What each session did: `docs/LOG.md`
- Hosting: `docs/SETUP-CLOUDFLARE.md`; sync database: `docs/SETUP-SYNC.md`; capture:
  `docs/SETUP-CAPTURE.md`; reminders and backups: `docs/SETUP-REMINDERS.md`

## Session routine

The owner starts sessions with prompts from `docs/ROADMAP.md` ("How we work"). Sessions
are build (S1, S2, ... in order), content (C1, C2, ...), feedback (F1, ...) or fix.

At the start:
1. Read the newest 2-3 entries in `docs/LOG.md`.
2. Read this session's item in `docs/ROADMAP.md` and the `docs/PLAN.md` sections it uses.

At the end (the owner set up this routine and wants it every session):
1. `npm test` passes.
2. Tick the ROADMAP checkbox and add a LOG entry **at the top**: date, session, what
   changed, decisions, notes for later sessions, owner to-dos, what's next.
3. Commit, push the session branch, and open a pull request into `main`. Cloudflare adds
   a preview link. Merge only when the owner says so.
4. Tell the owner, in plain words, what to test on the iPhone.

## Which model does the work

The owner wants usage spent where it matters:
- **Small fixes and mechanical changes** (a bug with a clear cause, a rule tweak, copy
  changes, a rebuild, updating tests to match): hand them to a helper agent on Sonnet,
  or Haiku for trivial ones, with a precise brief. The main session states the fix,
  reviews the diff and runs `npm test`.
- **Design, debugging an unclear cause, and final review** stay with the main session.
- Content batches follow `content/GUIDE.md` (Sonnet writers, Opus reviewers).

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server (no service worker) |
| `npm run build` / `npm run preview` | Production build in `dist/` / serve it |
| `npm test` | Everything below, in order |
| `npm run format:check` / `npm run format` | Prettier |
| `npm run check` | svelte-check and TypeScript |
| `npm run test:unit` | Vitest (`src/**/*.test.ts`) |
| `npm run test:e2e` | Playwright on an iPhone-size screen and a desktop screen (builds first) |
| `npm run simulate` | 180-day learner simulation; rewrites `docs/SIMULATION.md` (about 40 s) |
| `npm run validate:content` | Checks every word-bank entry (`-- --preview FILE` prints a batch as Markdown) |
| `.venv/bin/python scripts/wordbank/build.py` | Rebuilds `content/` from open data (see `scripts/wordbank/README.md`) |
| `python3 scripts/make_icons.py` | Redraws the PNG icons (needs Pillow) |

## Architecture rules

- **The event log is the only source of truth** (`src/lib/events/types.ts`,
  `src/lib/db/eventLog.ts`). Stored events are never edited or deleted.
- **Never change an existing event payload shape.** Add a new event type. The reducer
  must keep reading every type ever written and ignore types it does not know.
- **Events are created only by `EventLog.append`** (tests aside, and the server's
  `word_captured` events from the iOS Shortcut, which have no causes). It sets the time
  to `max(clock, latest event + 1)`, so causes sort before effects across devices with
  wrong clocks.
- **State is derived by replay** (`src/lib/state/reducer.ts`). The reducer is pure and
  deterministic: no clock reads, no randomness. It replaces nested objects instead of
  mutating them; `applyEvent` depends on that.
- The UI reads `vocab.state` and writes with `vocab.record(...)`
  (`src/lib/state/store.svelte.ts`).

## Scheduler (`src/lib/scheduler/`)

- `memory.ts`: FSRS (ts-fsrs) memory per word per track. The reducer updates it on every
  review, so it is part of replayed state. Minute-based learning steps and fuzz are off.
- `planner.ts`: `planDay()` builds what is left of today: due reviews (most at risk
  first), writing tasks, new words, within the day's minutes. Pure: pass in `now` and the
  time-zone offset. Never store a plan; compute it when needed.
- `stages.ts`: the ladder (Queued to Owned) worked out from memory, never stored.
- `rating.ts`: turns an answer into an FSRS rating (PLAN 6.2).
- `budget.ts`: minutes per day, pace, and `NEW_WORDS_BY_MINUTES`.
- `simulation.ts` + `scripts/simulate.ts`: the virtual learner. After changing the
  planner or scheduler, run `npm run simulate`; if the chosen new-word targets change,
  copy them into `NEW_WORDS_BY_MINUTES` and the PLAN 6.7 table.
- A study day runs from 4am to 4am local time (`day.ts`).
- During a word's introduction (PLAN 4), every check is recorded on the recognition track.
  The production track starts the study day after recognition stability reaches 4 days.

## Sessions (`src/lib/session/`, `src/lib/ui/`)

- `build.ts` turns `planDay()` into a list of steps (PLAN 7): about 10 reviews, then each
  new word (guess, page, check) with reviews between, its fill-in-the-blank about 5 items
  later, and a final check at the end. `reviewExercise()` picks R1/R3/P1/P3 per review.
- `runner.ts` moves through the steps (pure functions returning a new `Session`): repeats
  after a miss, "I know this word". A session is never stored; every answer is an event,
  so pausing and coming back rebuilds it from what is left (`unfinishedIntros`).
- `answers.ts` checks typed answers (forms, both spellings, one-letter slips).
- `prompts.ts` picks sentences (`ex0`-`ex5`, `cz0`-`cz2`, stored as `promptId`).
- The word bank is a separate JSON file (`scripts/word-bank-plugin.ts`): entries joined
  with IPA, band and spellings from `candidates.json` at build time. `virtual:word-bank`
  is its URL; `loadBank()` fetches it at start and `getBank()` returns it afterwards. The
  service worker caches it (limit 30 MB). Unit tests use `src/lib/testing/bank.ts`.
- `today.ts`: today's plan and session. New words come from `orderCandidates()`
  (`src/lib/content/candidates.ts`, PLAN 3.4): priority plus frontier fit from the
  latest placement test, minus interference with words met in the last 7 days, with
  variety at the front.
- Steps show `data-entry-id` and `data-prompt-id`; the e2e tests use them to answer.

## Placement, stats, settings

- `src/lib/placement/placement.ts`: the adaptive placement test (PLAN 3.1).
  `AdaptiveTest` asks 50 questions: 3 warm-up words, then the most informative band each
  time (a Bayesian grid over the band you know half of and the slope), 8 fakes, up to 10
  on-the-spot meaning checks. `score()` fits the same model to any stored answers. The
  result is a `placement_done` event (answers kept, so it can be re-scored) in
  `state.placements`. Estimates lean low on purpose (`CAUTION`, the 30th percentile).
- `src/lib/stats/stats.ts`: funnel, recall (first review of a day, not on the day met),
  forecast, weekly streak (5+ days).
- `src/lib/backup.ts`: the export file (all events) and its reader; import merges by id.
- `src/lib/clock.ts`: the app clock. Use `now()` and `tzOffsetMinutes()` from it, never
  `Date.now()`, so time travel works. Time travel (Settings, tap the version 7 times)
  switches to a separate database, `vocab-test`.
- Onboarding shows on first launch only (no events and no `vocab.onboarded` in
  localStorage). e2e tests that skip it set that key with `page.addInitScript`.

## Sync (`server/`, `functions/`, `src/lib/sync/`)

- The server is Cloudflare Pages Functions (`functions/api/sync.ts`, `health.ts`) in the
  same project as the app, with a D1 binding named `DB` (set in the dashboard; there is
  no `wrangler.toml`). Preview deployments bind a separate database. The logic is in
  `server/sync.ts` and runs on any `SyncDb` (a D1 subset); `server/sqlite.ts` adapts
  Node's SQLite for tests. Tables are created on first use.
- Main endpoint: `POST /api/sync` with `Authorization: Bearer <key>` and
  `{cursor, events}`; returns `{cursor, events, more}`. The account is a SHA-256 hash of
  the key; the cursor is the server's row number. Inserts ignore ids already there, so
  sending twice is harmless. The server never reads or changes event bodies (it only
  writes new ones for iOS Shortcut captures, `POST /api/capture`).
- The client (`engine.ts`) pushes events with `t` at or after the `sync.pushed`
  watermark and pulls after `sync.cursor`; both and the key live in the Dexie `meta`
  table, so the time-travel database has its own (and sync is off in time travel).
  Merging is `vocab.importEvents` plus replay. Store writes run one at a time so an
  import cannot replay over a fresh answer.
- `sync.svelte.ts` (`syncer`) runs it on open, every 3 minutes while visible, on focus
  and on reconnect, after a session pauses or finishes, and after a backup import.
- Keys (`key.ts`): 24 Crockford base32 characters plus a check character.
- `server/*.test.ts` run under Vitest with Node types; `server/devices.test.ts` syncs two
  in-memory devices with skewed clocks. `e2e/sync.spec.ts` drives an iPhone and a PC
  against the real server code.

## Capture and the Inbox (`src/lib/inbox/`, `src/lib/content/capture.ts`)

- A captured word is a `word_captured` event (`state.captures`); `capture_sorted` sorts it
  (learn, known, ignore; the first decision stands). `sortCapture()` in `inbox.ts` works
  out the events for a decision.
- Routes: the Inbox's quick-add box; the PC bookmarklet (`bookmarklet.ts`), which opens
  the app at `/?capture&w=&s=&t=&u=` in a small window (`CaptureLanding.svelte`) that
  records the event locally and syncs; the iOS Shortcut, which posts to
  `/api/capture` (`server/capture.ts`). That endpoint is the one place the server
  writes an event (device `server`), because a link on iPhone would open Safari's
  separate storage.
- Words not in the bank get an entry made on the device (`entryFromSense`, id
  `my:headword#pos.hash`, same on every device), saved as an `entry_created` event in
  `state.entries`. It has the definition, your sentence as example and blank, and a
  "word for this meaning" blank; the rich fields are empty, and screens must cope.
- `yourBank(getBank(), state)` (`content/yourBank.ts`) is the bank screens and sessions
  use: the shipped entries, the made ones, and captured sentences added to their words
  (as `ex6`, `cz3`... after the written ones). A captured word is guessed from your own
  sentence (`capturedPrompt`). The planner already puts captured words first.
- The compact dictionary is `virtual:dictionary` (26 JSON files by first letter, fetched
  when needed, cached by the service worker). `lookUp()` in `content/dictionary.ts`
  guesses dictionary forms (`lemmaCandidates`: "posited" to "posit").

## Reminders and backups (`server/reminders.ts`, `src/lib/reminders/`)

- Web Push, no packages: `server/webpush.ts` (RFC 8291 encryption, checked against the
  RFC's test vector; VAPID). The VAPID key pair is made on first use and kept in the D1
  `config` table, so there is no secret to set.
- `/api/push/{key,subscribe,unsubscribe,done,test}`; `push_subs` holds each device's
  subscription, time (6:00 to 23:30, half hours) and time zone (refreshed on every app
  start). A device posts `done` with the study day when Today has nothing left.
- `POST /api/tick` sends due reminders (once a day, up to 3 hours late, not when the day
  is done) and, if an R2 bucket is bound as `BACKUPS`, a weekly backup per account in the
  normal backup format. Pages cannot run timers, so `.github/workflows/tick.yml` calls it
  every 10 minutes. The tick needs no key: repeating it is harmless.
- The service worker loads `public/push-sw.js` (`workbox.importScripts`) to show pushes.
- A new version shows a "Reload" banner on the main tabs, and reloads by itself when the
  app comes back from the background (not mid-session, not with text typed).

## Word bank (`content/`)

- `candidates.json`, `placement.json`, `dictionary/` are generated by
  `scripts/wordbank/build.py`; do not edit them by hand. To change which words are
  candidates, edit `scripts/wordbank/curated.txt` or the build, then rebuild.
- `entries/*.json` are written by content sessions following `content/GUIDE.md`, in the
  format of `src/lib/content/types.ts`. `npm test` runs the entry checker.
- `content/` is excluded from Prettier.

## Design (`src/app.css`, `src/lib/theme.svelte.ts`)

- Look: warm and literary. "Paper" (light: parchment, ink, gold) and "Ink" (dark: night
  blue, warm text, brighter gold). Headings, headwords and big numbers use Fraunces
  (`@fontsource-variable/fraunces`, bundled and cached offline); UI text is the system
  sans. The gold cut gem is the mark (`src/lib/Logo.svelte`, `public/favicon.svg`,
  `scripts/make_icons.py`, kept identical).
- Colours are tokens on `<html data-theme="light|dark">` in `src/app.css`. Use them
  (`--surface`, `--accent`, `--accent-text`, `--stage-*`...); never hard-code a colour
  or add a `prefers-color-scheme` block in a component. Hero cards (`--hero-1/2`) and the
  top bar (`--bar`) stay dark in both themes, so text on them is light.
- The theme choice (Automatic, Paper, Ink) is per device in localStorage
  `wordhoard.theme`; `index.html` applies it before the first paint and sets
  `darkreader-lock` so the Dark Reader extension leaves the app alone.
- A tapped theme switch is animated (`theme.set(choice, element)`): the new theme grows in
  a circle from the button (View Transitions API, instant where unsupported), then
  `ThemeFx.svelte` adds twinkling stars (to dark) or a warm glow (to light).
- Shared pieces in `app.css`: `.btn` (`.primary`, `.gold` for the one main action,
  `.quiet`, `.wide`), `.eyebrow`, and the `rise`, `pop`, `shake` animations. Motion stays
  small and is switched off for reduced-motion users.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; Svelte 5 runes.
- Unit tests sit next to the code as `*.test.ts`. IndexedDB tests use `fake-indexeddb`.
  End-to-end tests live in `e2e/`.
- Prettier: 100 columns, single quotes. Markdown is not auto-formatted.
- **Mobile first.** Check every screen at iPhone size. Text inputs need a font size of at
  least 16px or iOS zooms in. Respect `env(safe-area-inset-*)`. Answer boxes turn off
  autocorrect, autocapitalize and spellcheck.
- UI text is plain, short and friendly.
- **No em dashes or en dashes anywhere** (UI text, docs, comments, commit messages). The
  owner prefers a normal hyphen, or a rewritten sentence.

## Pinned versions (check before upgrading)

- `@playwright/test` is pinned to **1.56.1** because its Chromium build (1194) is the
  one preinstalled in Claude Code cloud sessions (`/opt/pw-browsers`). Do not run
  `playwright install`.
- `typescript` stays on **6.x**: svelte-check does not support 7 yet.

## Deploy

Cloudflare Pages project `vocab-build`: the live app is **https://vocab-build.pages.dev**,
built from `main`; every other branch and pull request gets a preview link. The owner's
iPhone runs the live app from the home screen, and its data is tied to that address, so
never change the project name or domain without a data export/import plan.

Build command `npm run build`, output `dist`, Node version from `.node-version`.
Response headers are in `public/_headers`. The app shows the version, commit and
branch it was built from (`CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH`).

Cloud sessions' network policy blocks `pages.dev`, so sessions cannot open the live site;
the owner checks previews on the iPhone.
