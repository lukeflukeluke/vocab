<script lang="ts">
  import { now as clockNow, tzOffsetMinutes } from '../clock';
  import { orderCandidates } from '../content/candidates';
  import { getBank } from '../content/wordBank';
  import { yourBank } from '../content/yourBank';
  import { unsorted } from '../inbox/inbox';
  import { reminders } from '../reminders/reminders.svelte';
  import { paceFromHistory } from '../scheduler/budget';
  import { studyDay } from '../scheduler/day';
  import { DAY_MS } from '../scheduler/memory';
  import { planDay, type DayPlan } from '../scheduler/planner';
  import { QUICK_REVIEWS, unfinishedIntros } from '../session/build';
  import type { Session } from '../session/runner';
  import { todaysSession } from '../session/today';
  import { vocab } from '../state/store.svelte';
  import { streak } from '../stats/stats';

  // The Today screen (PLAN 7): what is left of today, Start, and 2-minute mode.

  interface Props {
    onstart: (session: Session) => void;
    onplacement: () => void;
    oninbox: () => void;
  }

  let { onstart, onplacement, oninbox }: Props = $props();

  const bank = $derived(yourBank(getBank(), vocab.state));
  const toSort = $derived(unsorted(vocab.state).length);
  const now = clockNow();
  const tz = tzOffsetMinutes();
  const today = studyDay(now, tz);

  /** Days between placement tests (PLAN 3.1: monthly). */
  const RETEST_DAYS = 30;

  const candidates = $derived(orderCandidates(bank, vocab.state, now, tz));

  function plan(at: number): DayPlan {
    return planDay({ state: vocab.state, now: at, tzOffsetMinutes: tz, candidates });
  }

  const todays = $derived(plan(now));
  const leftover = $derived(unfinishedIntros(vocab.state, now, tz));
  const tomorrow = $derived.by(() => {
    const next = plan(now + DAY_MS);
    return next.reviews.length + next.backlog;
  });
  const reviews = $derived(todays.reviews.length);
  const newWords = $derived(todays.newWords.length);
  const steps = $derived(reviews + newWords + leftover.length);
  // Writing tasks (U1) arrive in S10; until then their time is not part of a session.
  const minutes = $derived(
    Math.max(
      1,
      Math.round(
        (todays.estimatedSeconds - todays.writing.length * paceFromHistory(vocab.state).writing) /
          60,
      ),
    ),
  );
  const started = $derived(todays.spentSeconds > 0);
  // Nothing left today: no reminder needed (server/reminders.ts).
  $effect(() => {
    if (steps === 0) void reminders.done(today);
  });
  const week = $derived(streak(vocab.state, today, tz));
  const lastPlacement = $derived(vocab.state.placements.at(-1));
  const placementDue = $derived(
    !lastPlacement || today - studyDay(lastPlacement.t, tz) >= RETEST_DAYS,
  );
  const bankLeft = $derived(candidates.length > 0);

  const reasons: Partial<Record<DayPlan['newWordsReason'], string>> = {
    'done-for-today': "That's today's new words done.",
    'heavy-day': 'A heavy review day, so fewer new words.',
    'very-heavy-day': 'A heavy review day, so no new words.',
    'out-of-time': 'No time left today for new words.',
    'catch-up': 'Catching up on reviews first, so no new words today.',
    busy: 'Busy period: no new words until it is over.',
  };
  const reason = $derived(
    newWords < todays.newWordsTarget
      ? !bankLeft && todays.newWordsReason === 'on-target'
        ? "You've met every word in the bank. More are on the way."
        : reasons[todays.newWordsReason]
      : undefined,
  );

  function start(quick = false) {
    onstart(todaysSession(vocab.state, bank, clockNow(), tz, quick));
  }

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
</script>

<section class="card today" aria-labelledby="today-heading">
  <h1 id="today-heading">Today</h1>
  {#if steps === 0}
    <p class="done" data-testid="today-done">All done for today.</p>
    {#if reason}<p class="muted">{reason}</p>{/if}
    <p class="muted">
      {tomorrow ? `Tomorrow: about ${plural(tomorrow, 'review')}.` : 'Come back tomorrow.'}
    </p>
  {:else}
    <p class="minutes">About <strong>{minutes}</strong> min</p>
    <ul class="summary" data-testid="today-plan">
      {#if reviews}<li>{plural(reviews, 'review')}</li>{/if}
      {#if newWords}<li>{newWords} new {newWords === 1 ? 'word' : 'words'}</li>{/if}
      {#if leftover.length && !newWords}<li>finish {plural(leftover.length, 'new word')}</li>{/if}
    </ul>
    {#if todays.backlog}
      <p class="muted">{plural(todays.backlog, 'more review')} will wait until tomorrow.</p>
    {/if}
    {#if reason}<p class="muted">{reason}</p>{/if}
    <button class="btn primary wide start" data-testid="start" onclick={() => start()}>
      {started ? 'Continue' : 'Start'}
    </button>
    {#if reviews >= 2}
      <button class="btn wide" data-testid="quick" onclick={() => start(true)}>
        2-minute mode ({Math.min(reviews, QUICK_REVIEWS)} reviews)
      </button>
    {/if}
  {/if}

  <div class="week" aria-label="This week: {week.thisWeek} study days">
    {#each week.days as studied, i (i)}
      <span class="day" class:studied>{DAYS[i]}</span>
    {/each}
    <span class="muted small">
      {week.weeks
        ? `${plural(week.weeks, 'week')} in a row with 5+ days`
        : '5 days a week keeps a streak'}
    </span>
  </div>
</section>

{#if toSort}
  <section class="card" data-testid="inbox-card">
    <h2>{toSort === 1 ? '1 word' : `${toSort} words`} in your Inbox</h2>
    <p>Sort them and the ones you want to learn come first.</p>
    <button class="btn wide" onclick={oninbox}>Open the Inbox</button>
  </section>
{/if}

{#if placementDue}
  <section class="card placement" data-testid="placement-card">
    {#if lastPlacement}
      <h2>Monthly check</h2>
      <p>Retake the 2-minute test with fresh words to see how your vocabulary has grown.</p>
    {:else}
      <h2>Find your level</h2>
      <p>A 2-minute test finds the words worth learning for you, and your vocabulary size.</p>
    {/if}
    <button class="btn wide" data-testid="take-placement" onclick={onplacement}>
      Take the test
    </button>
  </section>
{/if}

<style>
  .card {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--muted);
  }

  .small {
    font-size: 0.85rem;
  }

  .done {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .minutes {
    font-size: 1.1rem;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 1.05rem;
  }

  .start {
    margin-top: 6px;
    min-height: 54px;
    font-size: 1.1rem;
  }

  .week {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }

  .day {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .day.studied {
    border-color: var(--accent);
    background: var(--accent);
    color: #1b1a2b;
  }

  .week .small {
    margin-left: 6px;
  }

  .placement {
    border-color: var(--accent);
  }
</style>
