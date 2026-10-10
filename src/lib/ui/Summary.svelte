<script lang="ts">
  import { getBank } from '../content/wordBank';
  import { yourBank } from '../content/yourBank';
  import { vocab } from '../state/store.svelte';
  import type { SessionSummary } from '../session/runner';

  const bank = yourBank(getBank(), vocab.state);

  interface Props {
    summary: SessionSummary;
    onclose: () => void;
  }

  let { summary, onclose }: Props = $props();

  const percent = $derived(
    summary.answered ? Math.round((summary.correct / summary.answered) * 100) : 100,
  );
  const words = (ids: string[]) => ids.flatMap((id) => bank.byId.get(id) ?? []);
  const cheer = $derived(
    percent >= 90 ? 'Superb session' : percent >= 70 ? 'Nicely done' : 'Session done',
  );
  /** Positions of the little gems that float up behind the score. */
  const SPARKS = [8, 22, 37, 55, 68, 82, 93];

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window {onkeydown} />

<main class="summary" data-testid="summary">
  <section class="hero">
    <div class="sparks" aria-hidden="true">
      {#each SPARKS as left, i (left)}
        <span style:left="{left}%" style:animation-delay="{i * 0.18}s"></span>
      {/each}
    </div>
    <p class="eyebrow">Session done</p>
    <h1>{cheer}</h1>
    <div class="stats">
      <p class="stat">
        <strong>{percent}%</strong>
        <span>{summary.correct} of {summary.answered} right</span>
      </p>
      {#if summary.newWords.length}
        <p class="stat">
          <strong>+{summary.newWords.length}</strong>
          <span>{summary.newWords.length === 1 ? 'word' : 'words'} in your hoard</span>
        </p>
      {/if}
    </div>
  </section>

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

  .hero {
    position: relative;
    display: grid;
    gap: 10px;
    padding: 24px 20px;
    overflow: hidden;
    border-radius: 24px;
    background:
      radial-gradient(120% 90% at 50% 0%, rgb(235 181 75 / 30%), transparent 60%),
      linear-gradient(150deg, var(--hero-1), var(--hero-2));
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
    animation: rise 0.4s var(--ease) both;
  }

  .hero .eyebrow {
    color: #f2c766;
  }

  h1 {
    margin: 0;
    font-size: 2.2rem;
    line-height: 1.05;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
    margin-top: 6px;
  }

  .stat {
    display: grid;
  }

  .stat strong {
    font-family: var(--serif);
    font-size: 2.2rem;
    font-weight: 600;
    line-height: 1.1;
    color: #f8dc98;
  }

  .stat span {
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .sparks span {
    position: absolute;
    bottom: -12px;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: linear-gradient(135deg, #fbe3a0, #e2a52a);
    opacity: 0;
    transform: rotate(45deg);
    animation: float 2.4s ease-out 2 both;
  }

  @keyframes float {
    0% {
      opacity: 0;
      transform: translateY(0) rotate(45deg) scale(0.6);
    }
    20% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translateY(-190px) rotate(45deg) scale(1);
    }
  }

  section:not(.hero) {
    padding: 16px 18px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }

  h2 {
    margin: 0 0 8px;
    color: var(--accent-text);
    font-family: var(--sans);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  p {
    margin: 0;
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
