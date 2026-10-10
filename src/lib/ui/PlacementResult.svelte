<script lang="ts">
  import type { PlacementResult } from '../events/types';
  import type { PlacementPool } from '../placement/placement';

  // The placement result: vocabulary size, and how much of each frequency band you know.

  interface Props {
    result: PlacementResult;
    pool: PlacementPool;
  }

  let { result, pool }: Props = $props();

  const k = (n: number) =>
    n >= 10_000 ? `${Math.round(n / 1000)}k` : `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  const words = (n: number) => n.toLocaleString('en-GB');
  const round100 = (n: number) => Math.round(n / 100) * 100;
  const rank = (band: number) => pool.bands.find((b) => b.band === band);
  const frontierFrom = $derived(rank(Math.min(...result.frontier))?.rankFrom ?? 0);
  const frontierTo = $derived(rank(Math.max(...result.frontier))?.rankTo ?? 0);
</script>

<section class="result" data-testid="placement-result">
  <p class="label">Your vocabulary</p>
  <p class="size" data-testid="vocab-size">About {words(result.size)} words</p>
  <p class="range">Likely between {words(result.low)} and {words(result.high)}.</p>

  <figure class="chart">
    <figcaption>How much of each band you know, from common words (left) to rare ones.</figcaption>
    <div class="bars" role="list">
      {#each result.bands as b (b.band)}
        {@const r = rank(b.band)}
        {@const frontier = result.frontier.includes(b.band)}
        <div
          class="col"
          role="listitem"
          title="Words ranked {r ? words(r.rankFrom) : ''} to {r
            ? words(r.rankTo)
            : ''}: {Math.round(b.known * 100)}% known"
        >
          <span class="track">
            <span class="fill" class:frontier style:height="{Math.max(b.known * 100, 2)}%"></span>
          </span>
        </div>
      {/each}
    </div>
    <div class="axis" aria-hidden="true">
      <span>{k(pool.bands[0]?.rankFrom ?? 1000)}</span>
      <span>{k(pool.bands[7]?.rankFrom ?? 0)}</span>
      <span>{k(pool.bands.at(-1)?.rankTo ?? 0)}</span>
    </div>
    <p class="legend"><span class="swatch"></span> Your frontier: where new words come from</p>
  </figure>

  <p>
    New words will come from the words ranked about {words(round100(frontierFrom))} to {words(
      round100(frontierTo),
    )}
    in frequency: ones you have probably seen but could not yet use.
  </p>
  {#if result.falseAlarms >= 0.1}
    <p class="note">
      You said yes to {Math.round(result.falseAlarms * 100)}% of the made-up words, so the estimate
      has been lowered to allow for it.
    </p>
  {/if}
  <p class="note">The test comes back once a month with fresh words, to measure your growth.</p>
</section>

<style>
  .result {
    display: grid;
    gap: 10px;
  }

  p {
    margin: 0;
  }

  .label {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .size {
    font-family: var(--serif);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.15;
  }

  .range,
  .note {
    color: var(--muted);
  }

  .note {
    font-size: 0.9rem;
  }

  .chart {
    display: grid;
    gap: 6px;
    margin: 8px 0;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
  }

  figcaption {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .bars {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 2px;
    height: 120px;
    align-items: end;
    border-bottom: 1px solid var(--border);
  }

  .col {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
  }

  .track {
    flex: 1;
    display: flex;
    align-items: flex-end;
  }

  .fill {
    width: 100%;
    border-radius: 4px 4px 0 0;
    background: color-mix(in srgb, var(--brand) 35%, var(--surface));
  }

  .fill.frontier {
    background: var(--accent);
  }

  .axis {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--accent);
  }
</style>
