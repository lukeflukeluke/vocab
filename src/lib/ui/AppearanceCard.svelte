<script lang="ts">
  import { theme, type ThemeChoice } from '../theme.svelte';

  // Settings: light, dark, or follow the phone or computer. Kept on this device only.

  const CHOICES: { value: ThemeChoice; label: string; hint: string }[] = [
    { value: 'system', label: 'Automatic', hint: 'Follows your device' },
    { value: 'light', label: 'Paper', hint: 'Light' },
    { value: 'dark', label: 'Ink', hint: 'Dark' },
  ];
</script>

<section class="card" aria-labelledby="appearance-heading">
  <h2 id="appearance-heading">Appearance</h2>
  <div class="modes" role="radiogroup" aria-label="Theme">
    {#each CHOICES as c (c.value)}
      <button
        class="mode"
        class:on={theme.choice === c.value}
        role="radio"
        aria-checked={theme.choice === c.value}
        data-theme-choice={c.value}
        onclick={(event) => theme.set(c.value, event.currentTarget)}
      >
        <span class="swatch {c.value}" aria-hidden="true"></span>
        <span class="label">{c.label}</span>
        <span class="hint">{c.hint}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .card {
    display: grid;
    gap: 12px;
    padding: 18px 20px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .mode {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 10px 6px;
    border: 1.5px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .mode.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .swatch {
    width: 100%;
    max-width: 72px;
    height: 40px;
    margin-bottom: 6px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }

  .swatch.light {
    background: linear-gradient(135deg, #fffcf6 50%, #f4eee2 50%);
  }

  .swatch.dark {
    background: linear-gradient(135deg, #171b2e 50%, #0e1120 50%);
  }

  .swatch.system {
    background: linear-gradient(135deg, #fffcf6 50%, #171b2e 50%);
  }

  .label {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .hint {
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
