<script lang="ts">
  import { isInstalled, isIos } from '../platform';
  import { DEFAULT_MINUTE, reminders, timeLabel, TIMES } from '../reminders/reminders.svelte';
  import { syncer } from '../sync/sync.svelte';

  // Settings: a daily reminder at the time you choose, only on days your session isn't
  // done yet.

  const current = $derived(reminders.state);
  // svelte-ignore state_referenced_locally
  let minute = $state(reminders.state.phase === 'on' ? reminders.state.minute : DEFAULT_MINUTE);
  let busy = $state(false);
  let tested = $state(false);
  const iosBrowser = isIos() && !isInstalled();

  $effect(() => {
    if (current.phase === 'on') minute = current.minute;
  });

  async function run(work: () => Promise<unknown>) {
    busy = true;
    tested = false;
    try {
      await work();
    } finally {
      busy = false;
    }
  }
</script>

<section class="card" data-testid="reminder-card" aria-labelledby="reminder-heading">
  <h2 id="reminder-heading">Daily reminder</h2>
  {#if current.phase === 'loading'}
    <p class="muted">Checking...</p>
  {:else if current.phase === 'unsupported' || iosBrowser}
    <p class="muted small">
      {iosBrowser
        ? 'Reminders work in the app on your Home Screen (iOS 16.4 or later). Open Vocab from there.'
        : "This browser can't show reminders."}
    </p>
  {:else if !syncer.key}
    <p class="muted small">Turn on sync first (above): reminders come from the sync server.</p>
  {:else if current.phase === 'blocked'}
    <p class="small">
      Notifications are blocked for Vocab. Allow them in your
      {isIos() ? 'iPhone Settings, Notifications, Vocab' : "browser's site settings"}, then come
      back here.
    </p>
  {:else}
    <p class="muted small">
      One notification a day at this time, only if you haven't finished today's session.
    </p>
    <label class="field">
      Remind me at
      <select
        bind:value={minute}
        data-testid="reminder-time"
        disabled={busy}
        onchange={() => {
          if (current.phase === 'on') void run(() => reminders.enable(minute));
        }}
      >
        {#each TIMES as t (t)}
          <option value={t}>{timeLabel(t)}</option>
        {/each}
      </select>
    </label>
    {#if current.phase === 'on'}
      <p data-testid="reminder-status">On, at {timeLabel(current.minute)}.</p>
      <div class="row">
        <button
          class="btn"
          data-testid="reminder-test"
          disabled={busy}
          onclick={() => run(async () => (tested = await reminders.test()))}
        >
          Send a test
        </button>
        <button
          class="btn quiet"
          data-testid="reminder-off"
          disabled={busy}
          onclick={() => run(() => reminders.disable())}
        >
          Turn off
        </button>
      </div>
      {#if tested}<p class="small" role="status">Sent. It should arrive in a few seconds.</p>{/if}
    {:else}
      <button
        class="btn primary"
        data-testid="reminder-on"
        disabled={busy}
        onclick={() => run(() => reminders.enable(minute))}
      >
        Turn on reminders
      </button>
    {/if}
  {/if}
  {#if reminders.error}<p class="bad small" role="alert">{reminders.error}</p>{/if}
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
    font-size: 0.9rem;
  }

  .bad {
    color: var(--bad);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .field {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  select {
    min-height: 48px;
    padding: 8px 12px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 1.05rem;
  }
</style>
