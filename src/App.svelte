<script lang="ts">
  import { onMount } from 'svelte';
  import Logo from './lib/Logo.svelte';
  import { isInstalled, isIos, requestPersistentStorage, startServiceWorker } from './lib/platform';
  import { vocab } from './lib/state/store.svelte';

  let offlineReady = $state(false);
  let persistent = $state<boolean | null>(null);
  let installed = $state(true);
  let ios = $state(false);

  const build = `${__APP_VERSION__} · ${__BUILD_COMMIT__} (${__BUILD_BRANCH__})`;

  onMount(() => {
    installed = isInstalled();
    ios = isIos();
    startServiceWorker(() => (offlineReady = true));
    void vocab.init();
    void requestPersistentStorage().then((granted) => (persistent = granted));
  });
</script>

<header class="topbar">
  <Logo size={28} />
  <span class="brand">Vocab</span>
</header>

<main>
  <section class="card">
    <h1>Today</h1>
    <p>Nothing to study yet. The learning screens are being built.</p>
  </section>

  {#if !installed}
    <section class="card tip" aria-label="Install tip">
      <h2>Install the app</h2>
      {#if ios}
        <p>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
      {:else}
        <p>In Chrome or Edge, click the <strong>Install</strong> icon in the address bar.</p>
      {/if}
    </section>
  {/if}

  <section class="card">
    <h2>This device</h2>
    {#if vocab.error}
      <p class="error" role="alert">Could not open storage: {vocab.error}</p>
    {/if}
    <dl>
      <dt>Works offline</dt>
      <dd data-testid="offline-status">{offlineReady ? 'Ready' : 'Not yet'}</dd>

      <dt>Saved events</dt>
      <dd data-testid="event-count">{vocab.ready ? vocab.state.eventCount : '…'}</dd>

      <dt>Storage</dt>
      <dd>
        {persistent === true ? 'Protected' : persistent === false ? 'Not protected' : 'Unknown'}
      </dd>

      <dt>Device</dt>
      <dd data-testid="device-id" data-device-id={vocab.deviceId ?? ''}>
        {vocab.deviceId ? vocab.deviceId.slice(0, 8) : '…'}
      </dd>

      <dt>Version</dt>
      <dd>{build}</dd>
    </dl>
  </section>
</main>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: calc(env(safe-area-inset-top) + 12px) calc(env(safe-area-inset-right) + 16px) 12px
      calc(env(safe-area-inset-left) + 16px);
    background: var(--brand);
    color: var(--on-brand);
  }

  .brand {
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  main {
    display: grid;
    gap: 16px;
    max-width: 640px;
    margin: 0 auto;
    padding: 16px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px)
      calc(env(safe-area-inset-left) + 16px);
  }

  .card {
    padding: 18px 20px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  h1 {
    margin: 0 0 6px;
    font-size: 1.6rem;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 1.05rem;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  .tip {
    border-color: var(--accent);
  }

  .error {
    margin-bottom: 10px;
    color: var(--danger);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
</style>
