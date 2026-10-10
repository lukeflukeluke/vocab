<script lang="ts">
  import { now as clockNow, tzOffsetMinutes } from '../clock';
  import { studyDay } from '../scheduler/day';
  import type { Stage } from '../scheduler/stages';
  import { vocab } from '../state/store.svelte';
  import { forecast, funnel, LADDER, retention, streak } from '../stats/stats';

  // Progress you can trust (PLAN 10): Words Owned first, then the ladder, recall, what is
  // coming, consistency and vocabulary size.

  interface Props {
    onplacement: () => void;
  }

  let { onplacement }: Props = $props();

  const tz = tzOffsetMinutes();
  const today = studyDay(clockNow(), tz);

  const counts = $derived(funnel(vocab.state, today, tz));
  const recall = $derived(retention(vocab.state, today, tz));
  const coming = $derived(forecast(vocab.state, today, tz, 30));
  const week = $derived(streak(vocab.state, today, tz));
  const placement = $derived(vocab.state.placements.at(-1));
  const placementsWithSize = $derived(vocab.state.placements.map((p) => p.result.size));

  const STAGE_LABEL: Record<Stage, string> = {
    queued: 'Queued',
    learning: 'Met today',
    recognise: 'Recognise',
    recall: 'Recall',
    use: 'Use',
    owned: 'Owned',
    known: 'Known already',
    suspended: 'Paused',
    ignored: 'Ignored',
  };
  const STAGE_HINT: Partial<Record<Stage, string>> = {
    recognise: 'you know it when you see it',
    recall: 'you can bring it to mind',
    use: 'you have used it in a sentence',
    owned: 'it has stuck for months',
  };

  const ladderMax = $derived(Math.max(1, ...LADDER.map((s) => counts[s])));
  const week7 = $derived(coming.slice(0, 7));
  const week7Max = $derived(Math.max(1, ...week7));
  const next30 = $derived(coming.reduce((a, b) => a + b, 0));
  const dayName = (offset: number) =>
    offset === 0
      ? 'Today'
      : new Date(clockNow() + offset * 86_400_000).toLocaleDateString('en-GB', {
          weekday: 'short',
        });
  const percent = (passed: number, total: number) => Math.round((passed / total) * 100);
  const words = (n: number) => n.toLocaleString('en-GB');
</script>

<section class="card hero">
  <div class="hero-row">
    <div>
      <p class="label">Words owned</p>
      <p class="big" data-testid="owned">{counts.owned}</p>
    </div>
    <svg class="gem-big" viewBox="136 96 276 292" aria-hidden="true">
      <polygon points="136,200 196,136 216,200" fill="#f6cf6a" />
      <polygon points="196,136 316,136 296,200 216,200" fill="#fbe3a0" />
      <polygon points="316,136 376,200 296,200" fill="#e8b143" />
      <polygon points="136,200 216,200 256,388" fill="#e6a730" />
      <polygon points="216,200 296,200 256,388" fill="#f2bd4b" />
      <polygon points="296,200 376,200 256,388" fill="#c98a1c" />
    </svg>
  </div>
  <p class="soft">
    Owned words have been used in a sentence and remembered for months. Everything else is on its
    way up.
  </p>
</section>

<section class="card">
  <h2>The ladder</h2>
  <ol class="ladder">
    {#each LADDER as stage (stage)}
      <li>
        <span class="name">
          {STAGE_LABEL[stage]}
          {#if STAGE_HINT[stage]}<span class="hint">{STAGE_HINT[stage]}</span>{/if}
        </span>
        <span class="bar" aria-hidden="true">
          <span
            class="fill"
            style:background="var(--stage-{stage})"
            style:width="{(counts[stage] / ladderMax) * 100}%"
          ></span>
        </span>
        <span class="count" data-testid="stage-{stage}">{counts[stage]}</span>
      </li>
    {/each}
  </ol>
  {#if counts.known || counts.queued}
    <p class="muted small">
      {#if counts.known}{counts.known} marked as already known.{/if}
      {#if counts.queued}{counts.queued} waiting to be met.{/if}
    </p>
  {/if}
</section>

<section class="card">
  <h2>Recall, last 30 days</h2>
  <div class="recall">
    {#each recall as r (r.track)}
      <div>
        <p class="label">{r.track === 'recognition' ? 'Seeing the word' : 'Producing the word'}</p>
        {#if r.total}
          <p class="mid">{percent(r.passed, r.total)}%</p>
          <p class="muted small">{r.passed} of {r.total} reviews</p>
        {:else}
          <p class="mid muted">-</p>
          <p class="muted small">No reviews yet</p>
        {/if}
      </div>
    {/each}
  </div>
  <p class="muted small">
    Aim for about {Math.round(vocab.state.settings.targetRetention * 100)}%. Much lower means too
    many new words; much higher means you could go faster.
  </p>
</section>

<section class="card">
  <h2>Coming up</h2>
  <div class="forecast" role="list" aria-label="Reviews due each day this week">
    {#each week7 as n, i (i)}
      <div class="col" role="listitem" title="{dayName(i)}: {n} reviews">
        <span class="value">{n}</span>
        <span class="track">
          <span class="fill" style:height="{Math.max((n / week7Max) * 100, n ? 6 : 2)}%"></span>
        </span>
        <span class="day">{dayName(i)}</span>
      </div>
    {/each}
  </div>
  <p class="muted small">About {next30} reviews in the next 30 days.</p>
</section>

<section class="card">
  <h2>Consistency</h2>
  <p>
    <strong data-testid="streak">{week.weeks}</strong>
    {week.weeks === 1 ? 'week' : 'weeks'} in a row with 5 or more study days.
  </p>
  <p class="muted small">This week so far: {week.thisWeek} of 7 days.</p>
</section>

<section class="card">
  <h2>Vocabulary size</h2>
  {#if placement}
    <p class="mid">About {words(placement.result.size)} words</p>
    <p class="muted small">
      Likely {words(placement.result.low)} to {words(placement.result.high)}, from your test on
      {new Date(placement.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
      {#if placementsWithSize.length > 1}
        First test: {words(placementsWithSize[0]!)}.
      {/if}
    </p>
  {:else}
    <p class="muted">Take the placement test to see your vocabulary size.</p>
  {/if}
  <button class="btn wide" onclick={onplacement}>
    {placement ? 'Retake the test' : 'Take the test'}
  </button>
</section>

<style>
  .card {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  p {
    margin: 0;
  }

  .hero {
    background:
      radial-gradient(100% 120% at 100% 0%, rgb(235 181 75 / 25%), transparent 60%),
      linear-gradient(150deg, var(--hero-1), var(--hero-2));
    border: 0;
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
  }

  .hero-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hero .label {
    color: #f2c766;
  }

  .gem-big {
    width: 64px;
    height: 68px;
    filter: drop-shadow(0 6px 14px rgb(235 181 75 / 45%));
  }

  .soft {
    color: rgb(248 239 220 / 75%);
  }

  .label {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .big {
    font-family: var(--serif);
    font-size: 3.4rem;
    font-weight: 600;
    line-height: 1;
  }

  .mid {
    font-size: 1.6rem;
    font-weight: 700;
  }

  .muted {
    color: var(--muted);
  }

  .small {
    font-size: 0.85rem;
  }

  .ladder {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ladder li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.5em;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 4px;
    align-items: center;
  }

  .name {
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    align-items: baseline;
    font-weight: 600;
  }

  .hint {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 400;
  }

  .ladder .bar {
    grid-column: 1;
    height: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .ladder .fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 0.6s var(--ease);
  }

  .count {
    grid-column: 2;
    grid-row: 1 / span 2;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .recall {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .forecast {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    height: 130px;
  }

  .forecast .col {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    min-width: 0;
  }

  .forecast .value {
    color: var(--muted);
    font-size: 0.75rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .forecast .track {
    flex: 1;
    display: flex;
    align-items: flex-end;
    border-bottom: 1px solid var(--border);
  }

  .forecast .fill {
    width: 100%;
    border-radius: 4px 4px 0 0;
    background: linear-gradient(
      180deg,
      var(--accent),
      color-mix(in srgb, var(--accent) 45%, var(--surface))
    );
  }

  .forecast .day {
    color: var(--muted);
    font-size: 0.7rem;
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
  }
</style>
