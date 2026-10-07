# Session log

Newest first. Every session adds an entry at the top.

---

## 2026-10-07 · C1: Content batch 1

**Done**
- 150 new entries in `content/entries/001-batch.json`: candidate positions 0-156 (all
  from the editorial list), so the bank now has 170 words. 72 adjectives, 40 nouns, 29
  verbs, 9 adverbs; 127 formal, 23 neutral. All pass the checker.
- Made with five writers in parallel (30 words each, `content/GUIDE.md` as the brief),
  then one reviewer per part. Reviewers changed 24 to 28 of each 30 entries, mostly
  blanks where a close synonym also fitted ("possibly" for conceivably, "trace" for
  vestige), plus entries that mixed two senses (pacify, profane, buoyant, episodic),
  a few doubtful origins removed or corrected, and a handful of unnatural examples.
- Five words skipped and recorded in `content/skipped.txt` (uninterested, prejudiced,
  inexcusable: everyday words; disenfranchised, melodrama: same family as an entry).
- `content/GUIDE.md`: each batch now owns a fixed range of candidate positions (C2 is
  157-336, then steps of 180), so content sessions can run at the same time; the
  parallel writers-plus-reviewers method is described, with writers on Sonnet 5.5 and
  reviewers on Opus 5.5 at high effort from C2 on. The ROADMAP prompt names the batch.

**Decisions**
- One entry teaches one sense; other senses get a sentence in the nuance and may get
  their own entry later.
- The seven headwords that candidates.json lists in American spelling (lackluster,
  idolize, stigmatize, urbanization, fervor, meager, somber) keep that spelling as the
  id and headword, but their sentences use British spelling, with every form of both
  spellings in `forms`.
- Origins only where the writer and reviewer were both sure (118 of 150 have one).

**Notes for later sessions**
- Some blanks still allow a near-twin (tirade/rant, placate/appease, elated/thrilled).
  An app change would help: if the typed answer is one of the entry's `synonyms`, say
  "Close: that's a near-synonym. Here the word is X" and rate it Hard instead of Again.
  A good F1 item.
- **Must fix in S5 (before C3 merges):** the word bank is built into the main script
  (718 KB with 170 entries, about 4 KB per entry). Workbox only caches files up to 2 MB
  for offline use, so at about 450 entries the app would stop working offline. Move the
  bank to its own JSON file (cached and loaded at start) or raise
  `maximumFileSizeToCacheInBytes`, and add an e2e check that the bank is precached.
- `e2e/session.spec.ts` now reads answers from every file in `content/entries/`.
- A second entry is worth writing later for utilitarian (the philosophy sense) and
  perhaps impenetrable (literal) and epithet (the insult sense).
- With 170 entries, R1 distractors now come from the same part of speech for nouns,
  verbs and adjectives. Adverbs (10) still borrow from other parts of speech sometimes.

**Owner to-do:** skim about 15 entries in the pull request preview and flag anything that
reads wrong, then say "merge". After the merge the app has 170 words to teach.

**Next:** S5 (onboarding, Today screen, stats) can start now. C2 can run alongside it.

---

## 2026-10-07 · S4: Learning screens

**Done**
- **Sessions.** The Today card shows what is left of today ("5 new words, about 5 min")
  and a Start button. A session follows PLAN 7: up to 10 reviews, then each new word with
  about 5 reviews after it, then the rest, then a last check on each new word. Progress
  bar at the top; Pause goes home, and Start (now "Continue") picks up where you were,
  even after closing the app. A summary at the end: score, new words, words to look at
  again.
- **Meeting a new word (PLAN 4):** guess first (pick 1 of 4 or "No idea", not counted),
  the word page (word, pronunciation button, IPA, part of speech, definition, two
  examples from different settings, the "vs" box, and "More about..." with nuance,
  partners, essay phrases, family, opposites, look-alikes and roots), an immediate check
  with a new sentence, a fill-in-the-blank with the first letter about 5 items later, and
  a final check at the end.
- **"I know this word"** on the guess screen (PLAN 3.5): a typed fill-in-the-blank with no
  hints. Right: the word is marked Known and another new word takes its place. Wrong: it
  is taught as normal.
- **Exercises R1, R3, P1, P3**, with "I don't know" everywhere, the hint ladder (first
  letter, number of letters, meaning, then the answer), typed-answer checking (any case,
  any form of the word, British or American spelling, one-letter slips on words of 5+
  letters count as Hard), and retyping the answer after a miss. A missed item comes back
  3 items later with another sentence (at most twice per word per session).
- **Ratings** from `rateAnswer` with your usual time per exercise on this device; every
  answer is saved as it is given.
- **Pronunciation** with the phone's own text-to-speech (British voice preferred).
- **iPhone:** answers in the bottom half of the screen, 48-56px buttons, the answer box
  just under the sentence (so the keyboard cannot cover it) and focused as each typed item
  opens, autocorrect/capitalisation/spellcheck off, 20px text in the box (no zoom), safe
  areas.
- **PC keys:** 1-4 choose, Enter check/continue, Space reveal (R3, then 1-3 to grade),
  ? I don't know, H or Alt+H hint, P pronounce, Esc pause. Shown on screen only when there
  is a mouse.
- Tests: 123 unit tests (37 new: answers, spellings, sentences, distractors, session
  order, runner) and 23 end-to-end runs on the two screen sizes: a full first session at iPhone size, a miss with
  retyping and the repeat, a one-letter slip, pause and resume across a reload, "I know
  this word", answer-box checks, a keyboard-only session on desktop, and seeded history
  for R3 and P3.

**Decisions**
- **The word bank is joined at build time** (`virtual:word-bank`), so the app carries
  only the written entries plus IPA, band and spellings, not the 1.5 MB candidate list.
  New entries in `content/entries/` appear after the next build.
- **Sessions are not stored.** Every answer is an event, so a paused session is rebuilt
  from today's plan, plus any new word whose blank or final check is still to do.
- **Which exercise a review uses**, until R2, R4 and P2 exist: recognition alternates R1
  and R3 (a failed R1 comes back as R1). Production starts with P3 when you have 3 other
  words to choose from, then P1 with the first letter, then plain P1.
- **Distractors** are other entries' definitions: same part of speech first, then a
  similar frequency band, never a word listed in the "vs" box. With 20 sample entries the
  nouns, adverb and conjunction borrow from other parts of speech; C1 fixes that.
- **The guess and the word page are not reviews.** The word is added (`word_added`) when
  its page opens. The "I know this" check is saved as a review only when it fails.
- **In-session repeats are saved as reviews**, like Anki's relearning steps; FSRS-6
  handles same-day reviews.

**Notes for later sessions**
- S5: `Today.svelte` is a stand-in for the Today screen; the planner's `candidates` are
  just bank entries by priority (`bank.candidates`). Placement and frontier fit go there.
- PLAN 3.5's "surprise check in about 60 days" for Known words is not built: known words
  leave the queue. It needs a planner change (S5 or S9).
- Writing tasks (U1) are left out of sessions until S10.
- The UK IPA from ipa-dict puts stress marks before the vowel ("dʒˈʌkstɐpˌəʊz"). Fine to
  read, but a later session could move them to the start of the syllable.
- Vite prints a warning that `vite.config.ts` imports files without extensions (for its
  future native config loader). Harmless today.
- The live app will start real learning once this is merged: the 20 sample words are
  real entries, so that is fine, but the preview link keeps its data separate.

**Owner to-do:** on the pull request's preview link (not the home-screen app), tap Start
and do the whole session on your iPhone. Try a wrong answer, "I don't know", a hint,
the speaker button, "I know this word", and Pause halfway. Note anything awkward (text
size, buttons, speed, wording), then say "merge".

**Next:** S5 (onboarding, Today screen, stats). It needs C1 merged first, so C1 can run
now.

---

## 2026-10-06 · S3: Word bank pipeline

**Done**
- `scripts/wordbank/` (Python, see its README): `fetch.py` downloads Open English WordNet
  2022, ipa-dict (UK and US IPA), and Wikipedia and OpenSubtitles word counts into
  `data/raw/` (not committed); `build.py` makes `content/` in about 40 s.
- `content/candidates.json`: 3,000 words (5,849 senses): 1,471 from the editorial list,
  1,529 ranked by a model trained on it. Each has frequency band, IPA, word family,
  British/American spellings where they differ, and the editorial `tag`.
- `content/placement.json`: 16 frequency bands (headword ranks 1,000 to 42,000) with 64
  ordinary words each plus glosses, and 250 fake words.
- `content/dictionary/`: short definitions for 41,312 words, one file per letter (4.6 MB).
- Entry format `src/lib/content/types.ts`, checker `src/lib/content/validate.ts`
  (`npm run validate:content`, part of `npm test`), with 10 tests that break a good entry
  in each way and confirm it is caught.
- `content/GUIDE.md` for content sessions; `content/skipped.txt` for words they skip.
- 20 sample entries in `content/entries/000-sample.json` (laconic, posit, salient,
  corroborate, tenuous, mitigate, ubiquitous, ostensibly, albeit, cogent, tacit,
  exacerbate, nuance, pragmatic, ephemeral, juxtapose, dichotomy, undermine, sycophant,
  concede), all passing the checker.

**Decisions**
- **No Wiktionary:** cloud sessions cannot reach kaikki.org. WordNet supplies senses,
  glosses and families; origin stories are written by content sessions only when sure.
  PLAN 11.3 updated.
- **Academic-ness needs judgement.** Frequency features alone ranked encyclopedic words
  (rugby, rural, anime) high and missed laconic, cogent and tacit. Fix: an editorial list
  (`scripts/wordbank/curated.txt`, about 1,600 words in 18 groups) plus a logistic
  regression trained on it to rank the remaining frontier words.
- Frontier is zipf 1.9 to 3.9 (headword ranks about 6,000 to 38,000). Editorial words
  bypass it; very common editorial words are there for an academic sense (qualify,
  founder) and rank last.
- Inflected forms ("appointed") and transparent derivatives ("unhappiness") of a more
  common word are folded into it. WordNet's "colloquial" and "disparaging" labels apply to
  whole synonym groups, so they only filter non-editorial words.
- The entry schema is TypeScript types plus the checker, not a separate JSON Schema file,
  so the app and the checks share one definition.

**Notes for later sessions**
- S4: load entries from `content/entries/*.json`; join `candidates.json` by `headword`
  for IPA, band and spellings. Accept both spellings in typed answers. Example 1 of each
  entry is the "guess first" sentence. Distractors for R1 and R4 come from other entries'
  `definition` and `everyday` of the same part of speech.
- S5: `placement.json` bands have `size` (headwords in the band) for the vocabulary
  estimate; the planner's `candidates` should be entry ids ordered by candidate priority
  and frontier fit.
- S7: `content/dictionary/{letter}.json` maps word to `[[pos, gloss], ...]`.
- The learned half of the candidate list is noisy toward the end; content sessions skip
  weak words and record them in `content/skipped.txt`.
- Rebuilding needs the venv (`scripts/wordbank/requirements.txt`), not installed by the
  session hook on purpose.

**Owner to-do:** skim a few sample entries in the pull request, then say "merge".

**Next:** S4, the learning screens. C1 (the first 150 entries) can now run alongside it.

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
