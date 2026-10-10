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
  import { funnel, LADDER, streak } from '../stats/stats';
  import Ring from './Ring.svelte';

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

  // How much of today is done, for the ring: time spent against time spent plus planned.
  const doneShare = $derived(
    steps === 0
      ? todays.spentSeconds > 0
        ? 1
        : 0
      : todays.spentSeconds / Math.max(1, todays.spentSeconds + todays.estimatedSeconds),
  );
  const hour = new Date(now + tz * 60_000).getUTCHours();
  const greeting =
    hour < 4
      ? 'Burning the midnight oil'
      : hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening';
  const counts = $derived(funnel(vocab.state, today, tz));
  const inHoard = $derived(LADDER.reduce((n, stage) => n + counts[stage], 0));
  const todayIndex = (((today + 3) % 7) + 7) % 7;
</script>

<section class="hero" aria-labelledby="today-heading">
  <div class="hero-top">
    <div>
      <p class="greet">{greeting}</p>
      <h1 id="today-heading">Today</h1>
    </div>
    <Ring value={doneShare} size={76}>
      {#if steps === 0 && todays.spentSeconds > 0}
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path fill="currentColor" d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4z" />
        </svg>
      {:else}
        <span class="ring-num">{steps === 0 ? 0 : minutes}</span>
        <span class="ring-unit">min</span>
      {/if}
    </Ring>
  </div>

  {#if steps === 0}
    <p class="done" data-testid="today-done">All done for today.</p>
    {#if reason}<p class="soft">{reason}</p>{/if}
    <p class="soft">
      {tomorrow ? `Tomorrow: about ${plural(tomorrow, 'review')}.` : 'Come back tomorrow.'}
    </p>
  {:else}
    <ul class="summary" data-testid="today-plan">
      {#if reviews}<li>{plural(reviews, 'review')}</li>{/if}
      {#if newWords}<li class="new">{newWords} new {newWords === 1 ? 'word' : 'words'}</li>{/if}
      {#if leftover.length && !newWords}<li class="new">
          finish {plural(leftover.length, 'new word')}
        </li>{/if}
    </ul>
    {#if todays.backlog}
      <p class="soft">{plural(todays.backlog, 'more review')} will wait until tomorrow.</p>
    {/if}
    {#if reason}<p class="soft">{reason}</p>{/if}
    <button class="btn gold wide start" data-testid="start" onclick={() => start()}>
      {started ? 'Continue' : 'Start'}
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M8 5v14l11-7z" />
      </svg>
    </button>
    {#if reviews >= 2}
      <button class="btn wide ghost" data-testid="quick" onclick={() => start(true)}>
        2-minute mode ({Math.min(reviews, QUICK_REVIEWS)} reviews)
      </button>
    {/if}
  {/if}

  <div class="week" aria-label="This week: {week.thisWeek} study days">
    <div class="gems">
      {#each week.days as studied, i (i)}
        <span class="gem-day" class:studied class:now={i === todayIndex}>
          <span class="gem" aria-hidden="true"></span>
          <span class="letter">{DAYS[i]}</span>
        </span>
      {/each}
    </div>
    <span class="soft small">
      {week.weeks
        ? `${plural(week.weeks, 'week')} in a row with 5+ days`
        : '5 days a week keeps a streak'}
    </span>
  </div>
</section>

{#if inHoard}
  <section class="card hoard" aria-label="Your hoard">
    <div>
      <p class="eyebrow">Your hoard</p>
      <p class="hoard-line">
        <strong>{inHoard}</strong>
        {inHoard === 1 ? 'word' : 'words'} learning,
        <strong class="gold-text">{counts.owned}</strong> owned
      </p>
    </div>
    <div class="ladder-mini" aria-hidden="true">
      {#each LADDER.filter((stage) => counts[stage] > 0) as stage (stage)}
        <span style:flex-grow={counts[stage]} style:background="var(--stage-{stage})"></span>
      {/each}
    </div>
  </section>
{/if}

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
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .hero {
    position: relative;
    display: grid;
    gap: 14px;
    padding: 22px 20px 18px;
    overflow: hidden;
    border-radius: 24px;
    background:
      radial-gradient(120% 90% at 100% 0%, rgb(235 181 75 / 22%), transparent 55%),
      linear-gradient(150deg, var(--hero-1), var(--hero-2));
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
    animation: rise 0.35s var(--ease) both;
  }

  .hero-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .greet {
    margin: 0 0 2px;
    color: #f2c766;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  h1 {
    margin: 0;
    font-size: 2.1rem;
    line-height: 1;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  p {
    margin: 0;
  }

  .ring-num {
    font-family: var(--serif);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
  }

  .ring-unit {
    font-size: 0.7rem;
    opacity: 0.75;
  }

  .soft {
    color: rgb(248 239 220 / 72%);
  }

  .small {
    font-size: 0.85rem;
  }

  .done {
    font-family: var(--serif);
    font-size: 1.3rem;
    font-weight: 600;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .summary li {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgb(255 255 255 / 10%);
    border: 1px solid rgb(255 255 255 / 14%);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .summary li.new {
    background: rgb(242 199 102 / 18%);
    border-color: rgb(242 199 102 / 40%);
    color: #f8dc98;
  }

  .start {
    min-height: 56px;
    font-size: 1.15rem;
  }

  .ghost {
    border-color: rgb(255 255 255 / 20%);
    background: rgb(255 255 255 / 6%);
    color: var(--on-hero);
  }

  .week {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid rgb(255 255 255 / 12%);
  }

  .gems {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }

  .gem-day {
    display: grid;
    justify-items: center;
    gap: 4px;
  }

  .gem {
    width: 16px;
    height: 16px;
    border: 1.5px solid rgb(255 255 255 / 30%);
    border-radius: 3px;
    transform: rotate(45deg);
  }

  .gem-day.studied .gem {
    border-color: #f2c766;
    background: linear-gradient(135deg, #fbe3a0, #e2a52a);
    box-shadow: 0 0 10px rgb(242 199 102 / 55%);
  }

  .letter {
    font-size: 0.72rem;
    font-weight: 700;
    opacity: 0.65;
  }

  .gem-day.now .letter {
    opacity: 1;
    color: #f2c766;
  }

  .hoard {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    animation: rise 0.45s var(--ease) both;
  }

  .hoard-line {
    margin-top: 4px;
    font-size: 1.05rem;
  }

  .hoard-line strong {
    font-family: var(--serif);
    font-size: 1.35rem;
  }

  .gold-text {
    color: var(--accent-text);
  }

  .ladder-mini {
    display: flex;
    gap: 3px;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--surface-2);
  }

  .ladder-mini span {
    flex-basis: 0;
    min-width: 0;
  }

  .placement {
    border-color: var(--accent);
    background: linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--surface);
  }
</style>
