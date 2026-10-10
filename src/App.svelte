<script lang="ts">
  import { onMount } from 'svelte';
  import { now as clockNow, timeTravelDays, tzOffsetMinutes } from './lib/clock';
  import { getBank, loadBank } from './lib/content/wordBank';
  import { yourBank } from './lib/content/yourBank';
  import { captureParams } from './lib/inbox/bookmarklet';
  import { unsorted } from './lib/inbox/inbox';
  import { isInstalled, isIos, requestPersistentStorage, startServiceWorker } from './lib/platform';
  import { summarize, type Session, type SessionSummary } from './lib/session/runner';
  import { todaysSession } from './lib/session/today';
  import { vocab } from './lib/state/store.svelte';
  import { reminders } from './lib/reminders/reminders.svelte';
  import { syncer } from './lib/sync/sync.svelte';
  import CaptureLanding from './lib/ui/CaptureLanding.svelte';
  import Inbox from './lib/ui/Inbox.svelte';
  import Onboarding from './lib/ui/Onboarding.svelte';
  import PlacementFlow from './lib/ui/PlacementFlow.svelte';
  import Progress from './lib/ui/Progress.svelte';
  import SessionScreen from './lib/ui/SessionScreen.svelte';
  import Settings from './lib/ui/Settings.svelte';
  import { prepareSpeech } from './lib/ui/speech';
  import Summary from './lib/ui/Summary.svelte';
  import TabBar, { type Tab } from './lib/ui/TabBar.svelte';
  import Today from './lib/ui/Today.svelte';
  import TopBar from './lib/ui/TopBar.svelte';

  type View =
    | { name: 'tabs' }
    | { name: 'session'; session: Session }
    | { name: 'summary'; summary: SessionSummary }
    | { name: 'placement' };

  let view = $state<View>({ name: 'tabs' });
  let tab = $state<Tab>('today');

  let bankReady = $state(false);
  let bankError = $state<string | null>(null);
  let offlineReady = $state(false);
  /** A new version of the app has taken over; it shows after a reload. */
  let updateReady = $state(false);
  let persistent = $state<boolean | null>(null);
  let installed = $state(true);
  let ios = $state(false);
  const travel = timeTravelDays();
  /** Opened by the PC bookmarklet: just save the captured word. */
  const capturing = captureParams(location.search);
  /** The event log is open and sync is set up. */
  const started = vocab.init().then(() => syncer.init());
  if (!capturing) void started.then(() => reminders.init());
  const inboxCount = $derived(unsorted(vocab.state).length);

  /** First launch: nothing recorded yet and the welcome not dismissed on this device. */
  const ONBOARDED = 'vocab.onboarded';
  let onboarded = $state(true);
  const ready = $derived(vocab.ready && bankReady);
  // Decided once at start: recording the placement result must not end onboarding early.
  let onboarding = $state(false);
  let decided = false;
  $effect(() => {
    if (!ready || decided) return;
    decided = true;
    onboarding = !onboarded && vocab.state.eventCount === 0;
  });

  const canReload = $derived(updateReady && view.name === 'tabs' && !onboarding);
  // Coming back to the app (from another app, or a locked phone) is a quiet moment to
  // switch to the new version, unless you are mid-session or have typed something.
  $effect(() => {
    if (!canReload) return;
    const onVisible = () => {
      const typing = [...document.querySelectorAll('input, textarea')].some(
        (el) => (el as HTMLInputElement).value,
      );
      if (document.visibilityState === 'visible' && !typing) location.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  onMount(() => {
    installed = isInstalled();
    ios = isIos();
    try {
      onboarded = localStorage.getItem(ONBOARDED) !== null;
    } catch {
      onboarded = false;
    }
    if (capturing) return;
    startServiceWorker(
      () => (offlineReady = true),
      () => (updateReady = true),
    );
    loadBank().then(
      () => (bankReady = true),
      (err: unknown) => (bankError = err instanceof Error ? err.message : String(err)),
    );
    void requestPersistentStorage().then((granted) => (persistent = granted));
    prepareSpeech();
  });

  function home(to: Tab = tab) {
    view = { name: 'tabs' };
    tab = to;
    window.scrollTo({ top: 0 });
  }

  function finishOnboarding(start: boolean) {
    try {
      localStorage.setItem(ONBOARDED, '1');
    } catch {
      // Storage blocked: the welcome may show again, which is harmless.
    }
    onboarded = true;
    onboarding = false;
    if (start) {
      view = {
        name: 'session',
        session: todaysSession(
          vocab.state,
          yourBank(getBank(), vocab.state),
          clockNow(),
          tzOffsetMinutes(),
        ),
      };
    }
  }
</script>

{#if travel !== null}
  <p class="test-mode" data-testid="test-mode">Test mode, day +{travel}. Real data untouched.</p>
{/if}

{#if capturing}
  <CaptureLanding params={capturing} {started} />
{:else if !ready}
  <TopBar />
  <main class="page">
    {#if vocab.error || bankError}
      <section class="card">
        <h1>Something went wrong</h1>
        <p class="error" role="alert">{vocab.error ?? bankError}</p>
        <button class="btn" onclick={() => location.reload()}>Try again</button>
      </section>
    {:else}
      <p class="muted">Loading...</p>
    {/if}
  </main>
{:else if onboarding}
  <Onboarding ondone={finishOnboarding} />
{:else if view.name === 'session'}
  <SessionScreen
    session={view.session}
    onpause={() => {
      void syncer.syncNow();
      home('today');
    }}
    onfinish={(session) => {
      void syncer.syncNow();
      view = { name: 'summary', summary: summarize(session) };
    }}
  />
{:else if view.name === 'placement'}
  <PlacementFlow continueLabel="Done" oncontinue={() => home('progress')} oncancel={() => home()} />
{:else if view.name === 'summary'}
  <TopBar />
  <Summary summary={view.summary} onclose={() => home('today')} />
{:else}
  <TopBar />
  {#if canReload}
    <p class="update" role="status" data-testid="update-ready">
      A new version is ready.
      <button class="btn quiet" onclick={() => location.reload()}>Reload</button>
    </p>
  {/if}
  <main class="page with-tabs">
    {#if tab === 'today'}
      <Today
        onstart={(session) => (view = { name: 'session', session })}
        onplacement={() => (view = { name: 'placement' })}
        oninbox={() => home('inbox')}
      />
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
    {:else if tab === 'inbox'}
      <Inbox onsetup={() => home('settings')} />
    {:else if tab === 'progress'}
      <Progress onplacement={() => (view = { name: 'placement' })} />
    {:else}
      <Settings {offlineReady} {persistent} />
    {/if}
  </main>
  <TabBar {tab} {inboxCount} onchange={(t) => home(t)} />
{/if}

<style>
  .page {
    display: grid;
    gap: 16px;
    max-width: 640px;
    margin: 0 auto;
    padding: 16px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px)
      calc(env(safe-area-inset-left) + 16px);
  }

  .with-tabs {
    /* Room for the tab bar. */
    padding-bottom: calc(env(safe-area-inset-bottom) + 88px);
  }

  .card {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
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

  .tip p,
  .muted {
    color: var(--muted);
  }

  .tip {
    border-color: var(--accent);
  }

  .error {
    color: var(--danger);
  }

  .update {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 4px 8px;
    margin: 0;
    padding: 4px calc(env(safe-area-inset-right) + 16px) 4px calc(env(safe-area-inset-left) + 16px);
    background: var(--mark);
    font-size: 0.9rem;
  }

  .update .btn {
    min-height: 36px;
    padding: 4px 10px;
    color: var(--text);
    text-decoration: underline;
  }

  .test-mode {
    position: fixed;
    right: 0;
    bottom: calc(env(safe-area-inset-bottom) + 64px);
    left: 0;
    z-index: 4;
    margin: 0 auto;
    width: max-content;
    max-width: calc(100% - 32px);
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--accent);
    color: #1b1a2b;
    font-size: 0.8rem;
    font-weight: 700;
    pointer-events: none;
  }
</style>
