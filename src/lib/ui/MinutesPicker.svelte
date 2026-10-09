<script lang="ts">
  // Daily time choice (PLAN 6.7), with what each choice means once things are steady
  // (from the S2 simulation, docs/SIMULATION.md).

  interface Props {
    value: number;
    onchange: (minutes: number) => void;
    label: string;
  }

  let { value, onchange, label }: Props = $props();

  const CHOICES: { minutes: number; typical: string }[] = [
    { minutes: 5, typical: 'about 1 new word a day' },
    { minutes: 10, typical: 'about 2 new words a day' },
    { minutes: 15, typical: 'about 3 new words a day' },
    { minutes: 20, typical: 'about 4 new words a day' },
    { minutes: 30, typical: '5 or 6 new words a day' },
    { minutes: 45, typical: 'about 8 new words a day' },
  ];

  const current = $derived(CHOICES.find((c) => c.minutes === value));
</script>

<fieldset class="picker">
  <legend>{label}</legend>
  <div class="chips">
    {#each CHOICES as c (c.minutes)}
      <button
        type="button"
        class="chip"
        class:on={c.minutes === value}
        aria-pressed={c.minutes === value}
        data-minutes={c.minutes}
        onclick={() => onchange(c.minutes)}
      >
        {c.minutes} min
      </button>
    {/each}
  </div>
  {#if current}
    <p class="typical">{current.minutes} minutes: {current.typical} once reviews build up.</p>
  {/if}
</fieldset>

<style>
  .picker {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: 8px;
    padding: 0;
    font-weight: 600;
  }

  .chips {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .chip {
    min-height: 48px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    font-weight: 600;
    cursor: pointer;
  }

  .chip.on {
    border-color: var(--brand);
    background: var(--brand);
    color: var(--on-brand);
  }

  .typical {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  @media (prefers-color-scheme: dark) {
    .chip.on {
      border-color: #6366f1;
      background: #4f46e5;
    }
  }
</style>
