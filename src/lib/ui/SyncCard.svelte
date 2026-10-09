<script lang="ts">
  import { formatKey, isValidKey, newSyncKey } from '../sync/key';
  import { syncer } from '../sync/sync.svelte';
  import SyncStatusText from './SyncStatusText.svelte';

  // Settings: link this device to your others with a sync key (PLAN 13.2).

  let mode = $state<'idle' | 'new' | 'enter'>('idle');
  let fresh = $state('');
  let typed = $state('');
  let showKey = $state(false);
  let copied = $state(false);
  let busy = $state(false);

  const typedValid = $derived(isValidKey(typed));

  function makeKey() {
    fresh = newSyncKey();
    mode = 'new';
    copied = false;
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(formatKey(key));
      copied = true;
    } catch {
      copied = false;
    }
  }

  async function connect(key: string) {
    busy = true;
    try {
      await syncer.useKey(key);
      mode = 'idle';
      typed = '';
      fresh = '';
    } finally {
      busy = false;
    }
  }
</script>

<section class="card" data-testid="sync-card">
  <h2>Sync</h2>
  {#if syncer.status.phase === 'test-mode'}
    <p class="muted small">Sync is off while time travelling, so test data stays separate.</p>
  {:else if syncer.key}
    <p>This device is linked. <SyncStatusText /></p>
    <div class="row">
      <button class="btn" data-testid="sync-now" onclick={() => syncer.syncNow()}>Sync now</button>
      <button class="btn quiet" onclick={() => (showKey = !showKey)}>
        {showKey ? 'Hide key' : 'Show key'}
      </button>
    </div>
    {#if showKey}
      <p class="key" data-testid="sync-key">{formatKey(syncer.key)}</p>
      <div class="row">
        <button class="btn" onclick={() => copy(syncer.key!)}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p class="muted small">Enter this key on your other device to link it. Keep it private.</p>
    {/if}
    <button class="btn quiet" data-testid="sync-off" onclick={() => syncer.turnOff()}>
      Turn off on this device
    </button>
  {:else if mode === 'new'}
    <p>Your sync key:</p>
    <p class="key" data-testid="new-key">{formatKey(fresh)}</p>
    <p class="muted small">
      On your other device, open Settings, Sync, "I have a key" and type this in. Keep it private:
      anyone with it can read your words.
    </p>
    <div class="row">
      <button class="btn" onclick={() => copy(fresh)}>{copied ? 'Copied' : 'Copy'}</button>
      <button
        class="btn primary"
        data-testid="use-new-key"
        disabled={busy}
        onclick={() => connect(fresh)}
      >
        Turn on sync
      </button>
    </div>
    <button class="btn quiet" onclick={() => (mode = 'idle')}>Cancel</button>
  {:else if mode === 'enter'}
    <label class="field">
      Sync key from your other device
      <input
        type="text"
        bind:value={typed}
        data-testid="key-input"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
      />
    </label>
    {#if typed.trim() && !typedValid}
      <p class="bad small">That key doesn't look right. Check each character.</p>
    {/if}
    <p class="muted small">
      Words on this device are combined with your other device's. Nothing is lost.
    </p>
    <div class="row">
      <button
        class="btn primary"
        data-testid="use-typed-key"
        disabled={!typedValid || busy}
        onclick={() => connect(typed)}
      >
        Link this device
      </button>
      <button class="btn quiet" onclick={() => (mode = 'idle')}>Cancel</button>
    </div>
  {:else}
    <p class="muted small">
      Keep your words in step between your iPhone and PC. Make a key on one device, then enter it on
      the other.
    </p>
    <div class="row">
      <button class="btn primary" data-testid="make-key" onclick={makeKey}>Make a sync key</button>
      <button class="btn" data-testid="have-key" onclick={() => (mode = 'enter')}>
        I have a key
      </button>
    </div>
  {/if}
  {#if syncer.key && syncer.status.phase === 'error' && syncer.status.reason === 'not-set-up'}
    <p class="bad small">
      The sync server isn't set up yet. It needs a database in Cloudflare: see docs/SETUP-SYNC.md in
      the repo (about 10 minutes). Your words are safe on this device meanwhile.
    </p>
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

  .small {
    font-size: 0.85rem;
  }

  .bad {
    color: var(--bad);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .key {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1.05rem;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
    user-select: all;
  }

  .field {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .field input {
    width: 100%;
    min-height: 48px;
    padding: 8px 12px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    /* 16px or more stops iPhone zooming in. */
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1.05rem;
  }
</style>
