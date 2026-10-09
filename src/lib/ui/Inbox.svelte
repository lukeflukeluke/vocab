<script lang="ts">
  import { splitCapture } from '../content/capture';
  import { unsorted } from '../inbox/inbox';
  import type { Capture } from '../state/state';
  import { vocab } from '../state/store.svelte';
  import { syncer } from '../sync/sync.svelte';
  import SortCapture from './SortCapture.svelte';

  // The Inbox tab (PLAN 3.3): add a word you just met, and sort captured words into
  // Learn, Already know or Ignore.

  interface Props {
    /** Opens Settings, where the Shortcut and bookmarklet are set up. */
    onsetup: () => void;
  }

  let { onsetup }: Props = $props();

  let word = $state('');
  let context = $state('');
  let adding = $state(false);
  let error = $state<string | null>(null);
  let openId = $state<string | null>(null);

  const items = $derived(unsorted(vocab.state));
  const open = $derived(openId ? vocab.state.captures[openId] : undefined);
  const recent = $derived(
    Object.values(vocab.state.captures)
      .filter((c) => c.sorted)
      .sort((a, b) => b.sorted!.t - a.sorted!.t)
      .slice(0, 5),
  );

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const capture = splitCapture(word, context.trim() || undefined);
    if (!capture.word && !capture.context) return;
    adding = true;
    error = null;
    try {
      const recorded = await vocab.record({ type: 'word_captured', source: 'app', ...capture });
      word = '';
      context = '';
      openId = recorded.id;
      void syncer.syncNow();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      adding = false;
    }
  }

  function label(c: Capture): string {
    return c.word || 'Pick a word';
  }

  const DECIDED = { learn: 'Learning', known: 'Known', ignore: 'Ignored' } as const;
  const SOURCE = { app: 'Added here', shortcut: 'From iPhone', bookmarklet: 'From PC' } as const;
</script>

{#if open && !open.sorted}
  <SortCapture capture={open} onclose={() => (openId = null)} />
{:else}
  <section class="card" aria-labelledby="add-heading">
    <h1 id="add-heading">Inbox</h1>
    <form class="add" onsubmit={add}>
      <label class="field">
        Met a new word?
        <input
          type="text"
          bind:value={word}
          placeholder="Type the word"
          data-testid="inbox-word"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="done"
        />
      </label>
      <label class="field">
        Where did you see it? (optional)
        <textarea
          bind:value={context}
          rows="2"
          placeholder="Paste the sentence"
          data-testid="inbox-context"></textarea>
      </label>
      <button class="btn primary" data-testid="inbox-add" disabled={adding || !word.trim()}>
        Add
      </button>
      {#if error}<p class="bad" role="alert">{error}</p>{/if}
    </form>
  </section>

  <section class="card" aria-labelledby="sort-heading" data-testid="inbox-list">
    <h2 id="sort-heading">To sort{items.length ? ` (${items.length})` : ''}</h2>
    {#if items.length}
      <ul class="items">
        {#each items as c (c.id)}
          <li>
            <button
              class="item"
              data-testid="inbox-item"
              data-capture-id={c.id}
              onclick={() => (openId = c.id)}
            >
              <span class="word" class:pick={!c.word}>{label(c)}</span>
              {#if c.context}<span class="context">{c.context}</span>{/if}
              <span class="meta">{SOURCE[c.source]}{c.title ? ` · ${c.title}` : ''}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted" data-testid="inbox-empty">
        Nothing to sort. Words you capture while reading land here.
      </p>
      <button class="btn quiet setup" onclick={onsetup}>Set up capture on iPhone and PC</button>
    {/if}
  </section>

  {#if recent.length}
    <section class="card" aria-labelledby="recent-heading">
      <h2 id="recent-heading">Recently sorted</h2>
      <ul class="recent">
        {#each recent as c (c.id)}
          <li>
            <span>{c.word || 'A passage'}</span>
            <span class="muted">{DECIDED[c.sorted!.decision]}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

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

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--muted);
  }

  .bad {
    color: var(--bad);
  }

  .add {
    display: grid;
    gap: 12px;
  }

  .field {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .field input,
  .field textarea {
    width: 100%;
    min-height: 48px;
    padding: 10px 12px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    /* 16px or more stops iPhone zooming in. */
    font: inherit;
    font-size: 1.05rem;
    resize: vertical;
  }

  .items,
  .recent {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .word {
    font-family: var(--serif);
    font-size: 1.2rem;
    font-weight: 600;
  }

  .word.pick {
    color: var(--muted);
    font-family: inherit;
    font-size: 1rem;
  }

  .context {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    color: var(--text);
    font-size: 0.92rem;
  }

  .meta {
    color: var(--muted);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }

  .recent li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .setup {
    justify-self: start;
    padding-left: 0;
  }
</style>
