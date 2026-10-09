<script lang="ts">
  import { onMount } from 'svelte';
  import { getBank } from '../content/wordBank';
  import type { PlacementAnswer, PlacementResult as Result } from '../events/types';
  import { score, type PlacementPool } from '../placement/placement';
  import { vocab } from '../state/store.svelte';
  import Placement from './Placement.svelte';
  import PlacementResult from './PlacementResult.svelte';
  import TopBar from './TopBar.svelte';

  // Takes the placement test, saves the result, and shows it.

  interface Props {
    /** Label of the button under the result. */
    continueLabel?: string;
    oncontinue: () => void;
    oncancel: () => void;
  }

  let { continueLabel = 'Continue', oncontinue, oncancel }: Props = $props();

  let pool = $state<PlacementPool | null>(null);
  let result = $state<Result | null>(null);
  let error = $state<string | null>(null);

  /** Words from earlier tests and your own words: a retest uses fresh ones. */
  function exclude(): Set<string> {
    const bank = getBank();
    const words = new Set<string>();
    for (const p of vocab.state.placements) for (const a of p.answers) words.add(a.word);
    for (const id of Object.keys(vocab.state.words)) {
      const entry = bank.byId.get(id);
      if (entry) words.add(entry.headword);
    }
    return words;
  }

  async function finish(answers: PlacementAnswer[]) {
    if (!pool) return;
    const scored = score(pool, answers);
    try {
      await vocab.record({ type: 'placement_done', answers, result: scored });
      result = scored;
      window.scrollTo({ top: 0 });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(async () => {
    try {
      pool = (await import('../../../content/placement.json')).default as unknown as PlacementPool;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  });
</script>

{#if error}
  <TopBar />
  <main class="page">
    <p role="alert">Something went wrong: {error}</p>
    <button class="btn" onclick={oncancel}>Back</button>
  </main>
{:else if result && pool}
  <TopBar />
  <main class="page">
    <PlacementResult {result} {pool} />
    <button class="btn primary wide" data-testid="placement-continue" onclick={oncontinue}>
      {continueLabel}
    </button>
  </main>
{:else if pool}
  <Placement {pool} exclude={exclude()} onfinish={finish} {oncancel} />
{:else}
  <TopBar />
  <main class="page"><p>Loading the test...</p></main>
{/if}

<style>
  .page {
    display: grid;
    gap: 16px;
    max-width: 640px;
    margin: 0 auto;
    padding: 24px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px)
      calc(env(safe-area-inset-left) + 16px);
  }
</style>
