<script lang="ts">
  import { vocab } from '../state/store.svelte';
  import { isValidKey } from '../sync/key';
  import { syncer } from '../sync/sync.svelte';
  import MinutesPicker from './MinutesPicker.svelte';
  import PlacementFlow from './PlacementFlow.svelte';
  import TopBar from './TopBar.svelte';

  // First launch: a welcome, the placement test, your daily time, then your first session.

  interface Props {
    /** Called when onboarding is done; `start` asks for the first session straight away. */
    ondone: (start: boolean) => void;
  }

  let { ondone }: Props = $props();

  let step = $state<'welcome' | 'test' | 'time' | 'join'>('welcome');
  let typed = $state('');
  let joining = $state(false);
  let joinError = $state<string | null>(null);

  /** Another device already has your words: link to it instead of starting afresh. */
  async function join() {
    joining = true;
    joinError = null;
    await syncer.useKey(typed);
    joining = false;
    if (syncer.status.phase === 'ok') ondone(false);
    else if (syncer.status.phase === 'error') joinError = syncer.status.message;
  }
  let minutes = $state(vocab.state.settings.dailyMinutes);
  let weekendDiffers = $state(vocab.state.settings.weekendMinutes !== null);
  let weekend = $state(vocab.state.settings.weekendMinutes ?? vocab.state.settings.dailyMinutes);
  let saving = $state(false);

  async function finish(start: boolean) {
    saving = true;
    try {
      await vocab.record({
        type: 'settings_changed',
        patch: { dailyMinutes: minutes, weekendMinutes: weekendDiffers ? weekend : null },
      });
      ondone(start);
    } finally {
      saving = false;
    }
  }
</script>

{#if step === 'test'}
  <PlacementFlow
    continueLabel="Next: your daily time"
    oncontinue={() => (step = 'time')}
    oncancel={() => (step = 'welcome')}
  />
{:else}
  <TopBar />
  <main class="page" data-testid="onboarding">
    {#if step === 'welcome'}
      <h1>Welcome to Vocab</h1>
      <p>
        A few minutes a day to learn the words of strong academic reading and writing, and to
        actually use them.
      </p>
      <ul class="points">
        <li>Each word is met properly: a guess, its page, then quick checks.</li>
        <li>Reviews come back just before you would forget.</li>
        <li>Words move up a ladder from <em>seen</em> to <em>owned</em>.</li>
      </ul>
      <p>First, a 2-minute test finds your level, so you only learn words worth learning.</p>
      <div class="actions">
        <button class="btn primary wide" data-testid="begin-test" onclick={() => (step = 'test')}>
          Find my level
        </button>
        <button class="btn quiet wide" data-testid="skip-test" onclick={() => (step = 'time')}>
          Skip the test for now
        </button>
        <button class="btn quiet wide" data-testid="join" onclick={() => (step = 'join')}>
          I already use Vocab on another device
        </button>
      </div>
    {:else if step === 'join'}
      <h1>Link this device</h1>
      <p>
        On your other device, open Settings, Sync. Make a sync key there (or tap "Show key" if you
        already have one) and type it in here.
      </p>
      <label class="field">
        Sync key
        <input
          type="text"
          bind:value={typed}
          data-testid="join-key"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="characters"
          spellcheck="false"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
        />
      </label>
      {#if typed.trim() && !isValidKey(typed)}
        <p class="bad">That key doesn't look right. Check each character.</p>
      {/if}
      {#if joinError}<p class="bad" role="alert">{joinError}</p>{/if}
      <div class="actions">
        <button
          class="btn primary wide"
          data-testid="join-go"
          disabled={!isValidKey(typed) || joining}
          onclick={join}
        >
          {joining ? 'Fetching your words...' : 'Link and fetch my words'}
        </button>
        <button class="btn quiet wide" onclick={() => (step = 'welcome')}>Back</button>
      </div>
    {:else}
      <h1>Your daily time</h1>
      <p>Pick what you can keep up most days. Sessions are built to fit it.</p>
      <MinutesPicker label="Minutes a day" value={minutes} onchange={(m) => (minutes = m)} />
      <label class="toggle">
        <input type="checkbox" bind:checked={weekendDiffers} />
        Different time at weekends
      </label>
      {#if weekendDiffers}
        <MinutesPicker
          label="Minutes on Saturday and Sunday"
          value={weekend}
          onchange={(m) => (weekend = m)}
        />
      {/if}
      <p class="muted">You can change this any time in Settings.</p>
      <div class="actions">
        <button
          class="btn primary wide"
          data-testid="start-first"
          disabled={saving}
          onclick={() => finish(true)}
        >
          Start my first session
        </button>
        <button class="btn quiet wide" disabled={saving} onclick={() => finish(false)}>
          Not now
        </button>
      </div>
    {/if}
  </main>
{/if}

<style>
  .page {
    display: grid;
    gap: 16px;
    max-width: 640px;
    margin: 0 auto;
    padding: 24px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px)
      calc(env(safe-area-inset-left) + 16px);
  }

  h1 {
    margin: 0;
    font-size: 1.8rem;
  }

  p {
    margin: 0;
  }

  .points {
    display: grid;
    gap: 6px;
    margin: 0;
    padding-left: 20px;
  }

  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .field {
    display: grid;
    gap: 6px;
    color: var(--muted);
  }

  .field input {
    width: 100%;
    min-height: 52px;
    padding: 8px 12px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    /* 16px or more stops iPhone zooming in. */
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1.05rem;
  }

  .bad {
    color: var(--bad);
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
  }

  .toggle input {
    width: 22px;
    height: 22px;
  }

  .actions {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
</style>
