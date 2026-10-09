<script lang="ts">
  import { bookmarklet } from '../inbox/bookmarklet';
  import { formatKey } from '../sync/key';
  import { syncer } from '../sync/sync.svelte';

  // Settings: set up capture (PLAN 13.5), the "Add to Vocab" Shortcut on iPhone and the
  // +Vocab bookmark on PC. Both drop words into the Inbox.

  const origin = location.origin;
  const captureUrl = `${origin}/api/capture`;
  const code = bookmarklet(origin);
  let copied = $state<string | null>(null);
  let dragHint = $state(false);

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
    } catch {
      copied = null;
    }
  }
</script>

<section class="card" data-testid="capture-card" aria-labelledby="capture-heading">
  <h2 id="capture-heading">Capture words</h2>
  <p class="muted small">
    Met a word while reading? Send it to your Inbox in two taps, with the sentence it was in.
  </p>

  <h3>iPhone: the "Add to Vocab" Shortcut</h3>
  {#if !syncer.key}
    <p class="small">
      Turn on sync first (above): the Shortcut sends words through the sync server.
    </p>
  {:else}
    <details>
      <summary>How to make it (about 5 minutes)</summary>
      <ol class="steps">
        <li>
          Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, and name it
          <strong>Add to Vocab</strong>.
        </li>
        <li>
          Tap <strong>i</strong> (Details) and turn on <strong>Show in Share Sheet</strong>. In the
          first line, "Receive ... from Share Sheet", keep only <strong>Text</strong>, and set "If
          there's no input" to <strong>Ask For Text</strong>.
        </li>
        <li>
          Add the action <strong>Get Contents of URL</strong>, with this address:
          <span class="copy">
            <code data-testid="capture-url">{captureUrl}</code>
            <button class="btn small-btn" onclick={() => copy('url', captureUrl)}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </span>
        </li>
        <li>
          Tap <strong>Show More</strong>. Method: <strong>POST</strong>. Headers: add one with the
          key
          <strong>Authorization</strong> and this value:
          <span class="copy">
            <code data-testid="capture-auth">Bearer {formatKey(syncer.key)}</code>
            <button
              class="btn small-btn"
              onclick={() => copy('auth', `Bearer ${formatKey(syncer.key!)}`)}
            >
              {copied === 'auth' ? 'Copied' : 'Copy'}
            </button>
          </span>
        </li>
        <li>
          Request Body: <strong>JSON</strong>. Add a <strong>Text</strong> field with the key
          <strong>text</strong>; for its value, tap and pick <strong>Shortcut Input</strong>.
        </li>
        <li>
          Add the action <strong>Show Notification</strong> and set its text to
          <strong>Contents of URL</strong>.
        </li>
      </ol>
      <p class="small">
        To use it: select a word (or a whole sentence) in Safari or any app, tap
        <strong>Share</strong>, then <strong>Add to Vocab</strong>. You can also run it from the
        Shortcuts app and type a word.
      </p>
    </details>
  {/if}

  <h3>PC: the +Vocab bookmark</h3>
  <p class="small">
    Show the bookmarks bar (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>), then drag this onto it:
    <a
      class="bookmarklet"
      href={code}
      data-testid="bookmarklet"
      draggable="true"
      onclick={(event) => {
        event.preventDefault();
        dragHint = true;
      }}>+Vocab</a
    >
  </p>
  {#if dragHint}
    <p class="small hint" role="status">
      Drag it to the bookmarks bar rather than clicking it here.
    </p>
  {/if}
  <p class="small">To use it: select a word on any page and click <strong>+Vocab</strong>.</p>
</section>

<style>
  .card {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  h3 {
    margin: 6px 0 0;
    font-size: 0.95rem;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--muted);
  }

  .small {
    font-size: 0.9rem;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  .steps {
    display: grid;
    gap: 10px;
    margin: 12px 0;
    padding-left: 1.3em;
    font-size: 0.9rem;
  }

  .copy {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  code {
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--bg);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
    user-select: all;
    min-width: 0;
  }

  .small-btn {
    min-height: 36px;
    padding: 4px 12px;
    font-size: 0.85rem;
  }

  .bookmarklet {
    display: inline-block;
    margin-left: 4px;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--brand);
    color: var(--on-brand);
    font-weight: 700;
    text-decoration: none;
    cursor: grab;
  }

  .hint {
    color: var(--muted);
  }
</style>
