<script lang="ts">
  import { getBank } from '../content/wordBank';
  import type { SessionSummary } from '../session/runner';

  const bank = getBank();

  interface Props {
    summary: SessionSummary;
    onclose: () => void;
  }

  let { summary, onclose }: Props = $props();

  const percent = $derived(
    summary.answered ? Math.round((summary.correct / summary.answered) * 100) : 100,
  );
  const words = (ids: string[]) => ids.flatMap((id) => bank.byId.get(id) ?? []);

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window {onkeydown} />

<main class="summary" data-testid="summary">
  <h1>Session done</h1>
  <p class="score">
    <strong>{summary.correct}</strong> of {summary.answered} right
    <span class="muted">({percent}%)</span>
  </p>

  {#if summary.newWords.length}
    <section>
      <h2>New today</h2>
      <ul>
        {#each words(summary.newWords) as entry (entry.id)}
          <li><strong>{entry.headword}</strong> <span class="muted">{entry.sense}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if summary.known.length}
    <section>
      <h2>Already known</h2>
      <p>
        {words(summary.known)
          .map((e) => e.headword)
          .join(', ')}
      </p>
    </section>
  {/if}

  {#if summary.missed.length}
    <section>
      <h2>Worth another look</h2>
      <ul>
        {#each words(summary.missed) as entry (entry.id)}
          <li><strong>{entry.headword}</strong> <span class="muted">{entry.sense}</span></li>
        {/each}
      </ul>
      <p class="muted small">These come back sooner, so they stick.</p>
    </section>
  {/if}

  <div class="end">
    <button class="btn primary wide" data-testid="done" onclick={onclose}>Done</button>
  </div>
</main>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 640px;
    margin: 0 auto;
    padding: 24px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px)
      calc(env(safe-area-inset-left) + 16px);
  }

  h1 {
    margin: 0;
    font-size: 1.8rem;
  }

  h2 {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  p {
    margin: 0;
  }

  .score {
    font-size: 1.3rem;
  }

  ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li strong {
    font-family: var(--serif);
    font-size: 1.15rem;
  }

  .muted {
    color: var(--muted);
  }

  .small {
    margin-top: 6px;
    font-size: 0.9rem;
  }

  .end {
    margin-top: 8px;
  }
</style>
