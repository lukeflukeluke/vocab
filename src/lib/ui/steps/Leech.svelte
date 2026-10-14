<script lang="ts">
  import type { BankEntry } from '../../content/bank';
  import WordPage from '../WordPage.svelte';

  // "This one keeps slipping" (PLAN 6.5): the word page again, and a nudge to make your
  // own memory hook, which sticks far better than a ready-made one. From 8 lapses, an
  // offer to park the word for a month.

  interface Props {
    entry: BankEntry;
    promptIds: string[];
    lapses: number;
    park: boolean;
    /** Your current memory hook, if any. */
    mnemonic?: string;
    oncontinue: (mnemonic: string) => void;
    onpark: () => void;
  }

  let { entry, promptIds, lapses, park, mnemonic = '', oncontinue, onpark }: Props = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(mnemonic);
</script>

<section class="slipping" aria-labelledby="slipping-heading">
  <p class="eyebrow">This one keeps slipping</p>
  <h2 id="slipping-heading">
    You've lost <em>{entry.headword}</em>
    {lapses} times. Let's make it stick.
  </h2>
  <p class="muted">
    Read it again, then write a hook of your own: a silly picture, a sound-alike, or a sentence
    about your own life. Your own beat ready-made ones.
  </p>
</section>

<WordPage {entry} {promptIds} />

<label class="field">
  Your memory hook
  <textarea
    bind:value={text}
    rows="3"
    data-testid="mnemonic"
    placeholder="e.g. A laconic text: 'k.'"
    autocapitalize="sentences"></textarea>
</label>

<div class="actions">
  <button class="btn primary wide" data-testid="continue" onclick={() => oncontinue(text.trim())}>
    {text.trim() && text.trim() !== mnemonic ? 'Save and carry on' : 'Carry on'}
  </button>
  {#if park}
    <button class="btn quiet wide" data-testid="park" onclick={onpark}>
      Park it for a month
    </button>
    <p class="muted small">Dropping a few stubborn words is fine. It comes back in 30 days.</p>
  {/if}
</div>

<style>
  .slipping {
    display: grid;
    gap: 6px;
    padding: 16px 18px;
    border-radius: 16px;
    border-left: 4px solid var(--bad);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--muted);
  }

  .small {
    font-size: 0.85rem;
    text-align: center;
  }

  .field {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 600;
  }

  textarea {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 1.05rem;
    resize: vertical;
  }

  textarea:focus {
    border-color: var(--accent);
    outline: none;
  }

  .actions {
    display: grid;
    gap: 8px;
  }
</style>
