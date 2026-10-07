<script lang="ts">
  import type { BankEntry } from '../content/bank';
  import { exampleFor } from '../session/prompts';
  import { splitAtWord } from '../session/exercises';
  import Sentence from './Sentence.svelte';
  import { canSpeak, speak } from './speech';

  // The word page (PLAN 4, step 2): the essentials first, the rest a tap away.

  interface Props {
    entry: BankEntry;
    /** Example sentences to show. */
    promptIds: string[];
  }

  let { entry, promptIds }: Props = $props();

  const POS: Record<BankEntry['pos'], string> = {
    n: 'noun',
    v: 'verb',
    adj: 'adjective',
    adv: 'adverb',
    conj: 'conjunction',
    prep: 'preposition',
  };

  const ipa = $derived(entry.ipa?.uk ?? entry.ipa?.us);
  const examples = $derived(promptIds.map((id) => exampleFor(entry, id)));
  const spoken = canSpeak();
</script>

<article class="page" data-testid="word-page">
  <header>
    <div class="title">
      <h1 class="headword">{entry.headword}</h1>
      {#if spoken}
        <button
          class="speak"
          aria-label="Say {entry.headword}"
          data-testid="speak"
          onclick={() => speak(entry.headword)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 9v6h4l5 4V5L8 9H4zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"
            />
          </svg>
        </button>
      {/if}
    </div>
    <p class="meta">
      {#if ipa}<span class="ipa">/{ipa}/</span>{/if}
      <span>{POS[entry.pos]}</span>
      {#if entry.register !== 'neutral'}<span class="chip">{entry.register}</span>{/if}
    </p>
  </header>

  <p class="definition">{entry.definition}</p>

  <ul class="examples">
    {#each examples as example (example.text)}
      <li>
        <Sentence split={splitAtWord(example.text, example.form)} mode="word" />
        <span class="setting">{example.setting}</span>
      </li>
    {/each}
  </ul>

  {#if entry.synonyms.length}
    <section class="vs" aria-label="Compared with similar words">
      <h2>vs</h2>
      <dl>
        {#each entry.synonyms as s (s.word)}
          <dt>{s.word}</dt>
          <dd>{s.vs}</dd>
        {/each}
      </dl>
    </section>
  {/if}

  <details class="more">
    <summary>More about {entry.headword}</summary>
    <div class="more-body">
      <p>{entry.nuance}</p>
      {#if entry.partners.length}
        <h3>Goes with</h3>
        <p>{entry.partners.join(' · ')}</p>
      {/if}
      {#if entry.phrases.length}
        <h3>For essays</h3>
        <p>{entry.phrases.join(' · ')}</p>
      {/if}
      {#if entry.family.length}
        <h3>Family</h3>
        <p>{entry.family.join(', ')}</p>
      {/if}
      {#if entry.antonyms.length}
        <h3>Opposites</h3>
        <p>{entry.antonyms.join(', ')}</p>
      {/if}
      {#if entry.confusables.length}
        <h3>Don't mix up with</h3>
        {#each entry.confusables as c (c.word)}
          <p><strong>{c.word}</strong>: {c.note}</p>
        {/each}
      {/if}
      {#if entry.roots.length || entry.origin}
        <h3>Roots</h3>
        {#each entry.roots as r (r.part)}
          <p><strong>{r.part}</strong>: {r.meaning}</p>
        {/each}
        {#if entry.origin}<p>{entry.origin}</p>{/if}
      {/if}
    </div>
  </details>
</article>

<style>
  .page {
    display: grid;
    gap: 16px;
  }

  header {
    display: grid;
    gap: 2px;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .headword {
    margin: 0;
    font-family: var(--serif);
    font-size: 2.3rem;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  .speak {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0;
    color: var(--muted);
  }

  .ipa {
    font-family: 'Charis SIL', 'Doulos SIL', 'Lucida Sans Unicode', 'Arial Unicode MS', sans-serif;
  }

  .chip {
    padding: 0 8px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 0.8rem;
  }

  .definition {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 500;
  }

  .examples {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .examples li {
    display: grid;
    gap: 2px;
    padding-left: 12px;
    border-left: 3px solid var(--border);
  }

  .examples :global(.sentence) {
    font-size: 1.1rem;
  }

  .setting {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .vs {
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .vs h2 {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .vs dl {
    display: grid;
    gap: 6px;
    margin: 0;
  }

  .vs dt {
    font-weight: 700;
  }

  .vs dd {
    margin: -4px 0 0;
    color: var(--muted);
  }

  .more summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
  }

  .more-body {
    display: grid;
    gap: 6px;
  }

  .more-body h3 {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .more-body p {
    margin: 0;
  }
</style>
