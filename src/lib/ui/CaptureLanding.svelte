<script lang="ts">
  import { splitCapture } from '../content/capture';
  import type { CaptureParams } from '../inbox/bookmarklet';
  import { vocab } from '../state/store.svelte';
  import { syncer } from '../sync/sync.svelte';

  // The small window the PC bookmarklet opens: saves the capture, syncs, and closes.

  interface Props {
    params: CaptureParams;
    /** Resolves once the event log is open and sync is set up. */
    started: Promise<void>;
  }

  let { params, started }: Props = $props();

  let phase = $state<'saving' | 'saved' | 'synced' | 'empty' | 'error'>('saving');
  let message = $state('');
  // svelte-ignore state_referenced_locally
  const capture = splitCapture(params.word, params.context || undefined);

  async function save() {
    await started;
    if (vocab.error) throw new Error(vocab.error);
    await vocab.record({
      type: 'word_captured',
      source: 'bookmarklet',
      ...capture,
      ...(params.title && { title: params.title.slice(0, 300) }),
      ...(params.url && { url: params.url }),
    });
    // Reloading this window must not add it again.
    history.replaceState(null, '', '/');
    phase = 'saved';
    if (syncer.key) {
      await syncer.syncNow();
      if (syncer.status.phase === 'ok') phase = 'synced';
    }
    if (window.opener) setTimeout(() => window.close(), 1500);
  }

  if (!capture.word && !capture.context) phase = 'empty';
  else {
    save().catch((err: unknown) => {
      phase = 'error';
      message = err instanceof Error ? err.message : String(err);
    });
  }
</script>

<main class="landing" data-testid="capture-landing">
  {#if phase === 'empty'}
    <h1>Select a word first</h1>
    <p>Select a word on the page, then click the bookmark again.</p>
  {:else if phase === 'error'}
    <h1>Could not save it</h1>
    <p class="bad" role="alert">{message}</p>
  {:else}
    <p class="word">{capture.word || 'Passage saved'}</p>
    {#if capture.context}<p class="context">{capture.context}</p>{/if}
    <p class="status" data-testid="capture-status" role="status">
      {phase === 'saving'
        ? 'Saving...'
        : phase === 'synced'
          ? 'In your Inbox on all your devices.'
          : 'In your Inbox.'}
    </p>
  {/if}
  <button class="btn" onclick={() => window.close()}>Close</button>
</main>

<style>
  .landing {
    display: grid;
    gap: 14px;
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 20px;
  }

  h1 {
    margin: 0;
    font-size: 1.3rem;
  }

  p {
    margin: 0;
  }

  .word {
    font-family: var(--serif);
    font-size: 2rem;
    font-weight: 600;
  }

  .context {
    color: var(--muted);
    font-family: var(--serif);
  }

  .status {
    font-weight: 600;
  }

  .bad {
    color: var(--bad);
  }
</style>
