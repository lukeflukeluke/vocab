<script lang="ts">
  import { entryFromSense, formIn, lemmaCandidates, wordsOf } from '../content/capture';
  import { lookUp, type Found, type Meaning } from '../content/dictionary';
  import type { EntryPos } from '../content/types';
  import { getBank } from '../content/wordBank';
  import { yourBank } from '../content/yourBank';
  import type { CaptureSorted } from '../events/types';
  import { sortCapture, type Chosen } from '../inbox/inbox';
  import { splitAtWord } from '../session/exercises';
  import type { Capture } from '../state/state';
  import { vocab } from '../state/store.svelte';
  import { syncer } from '../sync/sync.svelte';
  import Sentence from './Sentence.svelte';

  // Sorting one captured word: pick the word (if a passage was shared), pick the meaning
  // that fits your sentence, then Learn, Already know, or Ignore.

  interface Props {
    capture: Capture;
    onclose: () => void;
  }

  let { capture, onclose }: Props = $props();

  const POS: Record<EntryPos, string> = {
    n: 'noun',
    v: 'verb',
    adj: 'adjective',
    adv: 'adverb',
    conj: 'conjunction',
    prep: 'preposition',
  };

  // svelte-ignore state_referenced_locally
  let word = $state(capture.word);
  let found = $state<Found[] | null>(null);
  let lookupError = $state<string | null>(null);
  /** Index into `meanings`, or -1 for a meaning you write. */
  let picked = $state<number | null>(null);
  let own = $state('');
  let ownPos = $state<EntryPos>('n');
  let saving = $state(false);
  let error = $state<string | null>(null);

  const bank = $derived(yourBank(getBank(), vocab.state));
  const meanings = $derived(found?.flatMap((f) => f.meanings) ?? []);
  const headword = $derived(found?.[0]?.headword ?? lemmaCandidates(word)[0] ?? word);
  const split = $derived(capture.context && word ? splitAtWord(capture.context, word) : null);

  $effect(() => {
    const w = word;
    if (!w) return;
    found = null;
    lookupError = null;
    picked = null;
    let current = true;
    lookUp(w, getBank()).then(
      (result) => {
        if (!current) return;
        found = result;
        const all = result.flatMap((f) => f.meanings);
        picked = all.length === 1 ? 0 : all.length === 0 ? -1 : null;
      },
      (err: unknown) => {
        if (current) lookupError = err instanceof Error ? err.message : String(err);
        picked = -1;
      },
    );
    return () => {
      current = false;
    };
  });

  function isYours(m: Meaning): boolean {
    return m.kind === 'bank' && vocab.state.words[m.entry.id]?.status === 'active';
  }

  function chosen(): Chosen | null {
    if (picked === null) return null;
    const context = capture.context;
    const form = context ? (formIn(context, [word]) ?? word) : word;
    if (picked === -1) {
      if (!own.trim()) return null;
      return {
        kind: 'new',
        entry: entryFromSense({ headword, pos: ownPos, definition: own, context, form }),
      };
    }
    const m = meanings[picked];
    if (!m) return null;
    if (m.kind === 'bank') return { kind: 'bank', entryId: m.entry.id };
    return {
      kind: 'new',
      entry: entryFromSense({
        headword: m.headword,
        pos: m.pos,
        definition: m.gloss,
        context,
        form,
      }),
    };
  }

  const canLearn = $derived(picked !== null && (picked !== -1 || own.trim().length > 0));

  async function decide(decision: CaptureSorted['decision']) {
    saving = true;
    error = null;
    try {
      const events = sortCapture(vocab.state, bank, capture, decision, chosen());
      for (const body of events) await vocab.record(body);
      void syncer.syncNow();
      onclose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      saving = false;
    }
  }
</script>

<section class="card" data-testid="sort-capture" aria-labelledby="sort-word">
  <button class="btn quiet back" onclick={onclose}>Back to Inbox</button>

  {#if !word}
    <h1 id="sort-word">Which word?</h1>
    <p class="muted">Tap the word you want to learn.</p>
    <p class="passage">
      {#each wordsOf(capture.context ?? '') as w, i (i)}
        <button class="pick" data-testid="pick-word" data-word={w} onclick={() => (word = w)}>
          {w}
        </button>{' '}
      {/each}
    </p>
    <button
      class="btn quiet"
      data-testid="sort-ignore"
      disabled={saving}
      onclick={() => decide('ignore')}
    >
      Ignore this one
    </button>
  {:else}
    <h1 id="sort-word" class="headword">{word}</h1>
    {#if split?.middle}
      <p class="context"><Sentence {split} mode="word" /></p>
    {:else if capture.context}
      <p class="context">{capture.context}</p>
    {/if}
    {#if capture.title}<p class="meta">{capture.title}</p>{/if}

    <fieldset class="meanings">
      <legend>Which meaning fits?</legend>
      {#if !found && !lookupError}
        <p class="muted">Looking it up...</p>
      {:else}
        {#if lookupError}
          <p class="bad">Could not open the dictionary ({lookupError}).</p>
        {:else if !meanings.length}
          <p class="muted" data-testid="not-found">
            Not in the dictionary. Write what it means to learn it anyway.
          </p>
        {/if}
        {#each found ?? [] as f (f.headword)}
          {#if (found?.length ?? 0) > 1}<p class="group">{f.headword}</p>{/if}
          {#each f.meanings as m (m.kind === 'bank' ? m.entry.id : `${m.pos}:${m.gloss}`)}
            {@const i = meanings.indexOf(m)}
            <label class="meaning" class:on={picked === i}>
              <input
                type="radio"
                name="meaning"
                value={i}
                checked={picked === i}
                onchange={() => (picked = i)}
                data-testid="meaning"
                data-entry-id={m.kind === 'bank' ? m.entry.id : ''}
              />
              <span>
                <span class="pos">{POS[m.kind === 'bank' ? m.entry.pos : m.pos]}</span>
                {m.kind === 'bank' ? m.entry.definition : m.gloss}
                {#if m.kind === 'bank'}
                  <span class="chip">{isYours(m) ? 'In your words' : 'Full entry'}</span>
                {/if}
              </span>
            </label>
          {/each}
        {/each}
        <label class="meaning" class:on={picked === -1}>
          <input
            type="radio"
            name="meaning"
            checked={picked === -1}
            onchange={() => (picked = -1)}
            data-testid="meaning-own"
          />
          <span>{meanings.length ? 'None of these: write it yourself' : 'Write the meaning'}</span>
        </label>
        {#if picked === -1}
          <div class="own">
            <input
              type="text"
              bind:value={own}
              placeholder="What it means here"
              data-testid="own-meaning"
              autocomplete="off"
              autocapitalize="off"
            />
            <select bind:value={ownPos} aria-label="Part of speech" data-testid="own-pos">
              {#each Object.entries(POS) as [value, name] (value)}
                <option {value}>{name}</option>
              {/each}
            </select>
          </div>
        {/if}
      {/if}
    </fieldset>

    {#if error}<p class="bad" role="alert">{error}</p>{/if}
    <div class="actions">
      <button
        class="btn primary"
        data-testid="sort-learn"
        disabled={saving || !canLearn}
        onclick={() => decide('learn')}
      >
        Learn
      </button>
      <button
        class="btn"
        data-testid="sort-known"
        disabled={saving}
        onclick={() => decide('known')}
      >
        I know it
      </button>
      <button
        class="btn quiet"
        data-testid="sort-ignore"
        disabled={saving}
        onclick={() => decide('ignore')}
      >
        Ignore
      </button>
    </div>
    <p class="muted small">Learn puts it first in line for your next session.</p>
  {/if}
</section>

<style>
  .card {
    display: grid;
    gap: 12px;
    padding: 18px 20px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 1.4rem;
  }

  .headword {
    font-family: var(--serif);
    font-size: 2rem;
  }

  p {
    margin: 0;
  }

  .back {
    justify-self: start;
    min-height: 40px;
    padding-left: 0;
  }

  .muted {
    color: var(--muted);
  }

  .small {
    font-size: 0.85rem;
  }

  .bad {
    color: var(--bad);
  }

  .meta {
    color: var(--muted);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .context,
  .passage {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bg);
    font-family: var(--serif);
    font-size: 1.1rem;
    line-height: 1.6;
  }

  .pick {
    padding: 2px 4px;
    border: 0;
    border-radius: 6px;
    background: none;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline dotted var(--muted);
    text-underline-offset: 4px;
  }

  .meanings {
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

  .group {
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .meaning {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border: 2px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
  }

  .meaning.on {
    border-color: var(--accent);
  }

  .meaning input {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 2px 0 0;
    accent-color: var(--brand);
  }

  .pos {
    color: var(--muted);
    font-size: 0.85rem;
    font-style: italic;
  }

  .chip {
    display: inline-block;
    margin-left: 4px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--bg);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .own {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .own input,
  .own select {
    min-height: 48px;
    padding: 8px 12px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 1.05rem;
    min-width: 0;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .actions .btn {
    padding: 10px 8px;
  }
</style>
