<script lang="ts">
  import { bank } from '../content/wordBank';
  import { DAY_MS } from '../scheduler/memory';
  import { planDay, type DayPlan } from '../scheduler/planner';
  import { buildSession, unfinishedIntros } from '../session/build';
  import { startSession, type Session } from '../session/runner';
  import { vocab } from '../state/store.svelte';

  // The Today card: what is left of today's session and a button to start it.
  // S5 turns this into the full Today screen.

  interface Props {
    onstart: (session: Session) => void;
  }

  let { onstart }: Props = $props();

  const now = Date.now();
  const tz = -new Date().getTimezoneOffset();

  function plan(at: number): DayPlan {
    return planDay({
      state: vocab.state,
      now: at,
      tzOffsetMinutes: tz,
      candidates: bank.candidates,
    });
  }

  const today = $derived(vocab.ready ? plan(now) : null);
  const leftover = $derived(vocab.ready ? unfinishedIntros(vocab.state, now, tz) : []);
  const tomorrow = $derived.by(() => {
    if (!vocab.ready) return 0;
    const next = plan(now + DAY_MS);
    return next.reviews.length + next.backlog;
  });
  const reviews = $derived(today?.reviews.length ?? 0);
  const newWords = $derived(today?.newWords.length ?? 0);
  const steps = $derived(reviews + newWords + leftover.length);
  const minutes = $derived(Math.max(1, Math.round((today?.estimatedSeconds ?? 0) / 60)));
  const started = $derived((today?.spentSeconds ?? 0) > 0);
  const counts = $derived.by(() => {
    let learning = 0;
    let known = 0;
    for (const word of Object.values(vocab.state.words)) {
      if (word.status === 'known') known++;
      else if (word.status === 'active' && word.memory.recognition) learning++;
    }
    return { learning, known };
  });
  const bankLeft = $derived(bank.candidates.some((id) => !vocab.state.words[id]));

  const reasons: Partial<Record<DayPlan['newWordsReason'], string>> = {
    'done-for-today': "That's today's new words done.",
    'heavy-day': 'A heavy review day, so fewer new words.',
    'very-heavy-day': 'A heavy review day, so no new words.',
    'out-of-time': 'No time left today for new words.',
    'catch-up': 'Catching up on reviews first, so no new words today.',
    busy: 'Busy period: no new words until it is over.',
  };
  const reason = $derived(
    today && newWords < today.newWordsTarget
      ? !bankLeft && today.newWordsReason === 'on-target'
        ? "You've met every word in the bank. More are on the way."
        : reasons[today.newWordsReason]
      : undefined,
  );

  function start() {
    if (!today) return;
    const built = buildSession({
      plan: today,
      state: vocab.state,
      bank,
      now: Date.now(),
      tzOffsetMinutes: tz,
    });
    onstart(startSession(built, Date.now()));
  }

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
</script>

<section class="card today" aria-labelledby="today-heading">
  <h1 id="today-heading">Today</h1>
  {#if !vocab.ready}
    <p class="muted">{vocab.error ? 'Storage is not available.' : 'Loading...'}</p>
  {:else if steps === 0}
    <p class="done" data-testid="today-done">All done for today.</p>
    {#if reason}<p class="muted">{reason}</p>{/if}
    <p class="muted">
      {tomorrow ? `Tomorrow: about ${plural(tomorrow, 'review')}.` : 'Come back tomorrow.'}
    </p>
  {:else}
    <ul class="summary" data-testid="today-plan">
      {#if reviews}<li><strong>{reviews}</strong> {reviews === 1 ? 'review' : 'reviews'}</li>{/if}
      {#if newWords}<li>
          <strong>{newWords}</strong> new {newWords === 1 ? 'word' : 'words'}
        </li>{/if}
      {#if leftover.length && !newWords}<li>finish {plural(leftover.length, 'new word')}</li>{/if}
      <li>about <strong>{minutes}</strong> min</li>
    </ul>
    {#if reason}<p class="muted">{reason}</p>{/if}
    <button class="btn primary wide start" data-testid="start" onclick={start}>
      {started ? 'Continue' : 'Start'}
    </button>
  {/if}
  {#if vocab.ready && counts.learning + counts.known > 0}
    <p class="words">
      Your words: {counts.learning} learning{#if counts.known}, {counts.known} known{/if}
    </p>
  {/if}
</section>

<style>
  .today {
    display: grid;
    gap: 10px;
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  p {
    margin: 0;
  }

  .muted,
  .words {
    color: var(--muted);
  }

  .words {
    font-size: 0.9rem;
  }

  .done {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
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
</style>
