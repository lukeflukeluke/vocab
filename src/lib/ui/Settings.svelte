<script lang="ts">
  import { backupFileName, makeBackup, parseBackup } from '../backup';
  import { now as clockNow, setTimeTravel, timeTravelDays } from '../clock';
  import type { Settings } from '../events/types';
  import { vocab } from '../state/store.svelte';
  import { syncer } from '../sync/sync.svelte';
  import MinutesPicker from './MinutesPicker.svelte';
  import CaptureCard from './CaptureCard.svelte';
  import SyncCard from './SyncCard.svelte';

  // Settings (PLAN 6.7, 13.4): daily time, target retention, a busy period, backups, and
  // a hidden time-travel switch for testing. The device details live here too.

  interface Props {
    offlineReady: boolean;
    persistent: boolean | null;
  }

  let { offlineReady, persistent }: Props = $props();

  const settings = $derived(vocab.state.settings);
  const build = `${__APP_VERSION__} · ${__BUILD_COMMIT__} (${__BUILD_BRANCH__})`;

  let message = $state<{ text: string; bad?: boolean } | null>(null);
  let busyStart = $state(vocab.state.settings.busyStart ?? '');
  let busyEnd = $state(vocab.state.settings.busyEnd ?? '');
  let versionTaps = $state(0);
  const travel = timeTravelDays();
  const showTravel = $derived(travel !== null || versionTaps >= 7);

  async function change(patch: Partial<Settings>) {
    try {
      await vocab.record({ type: 'settings_changed', patch });
    } catch (err) {
      message = { text: `Could not save: ${String(err)}`, bad: true };
    }
  }

  const RETENTION = [
    { value: 0.85, label: 'Lighter', note: 'fewer reviews; you will forget a little more' },
    { value: 0.9, label: 'Balanced', note: 'recommended' },
    { value: 0.95, label: 'Stronger', note: 'about twice the reviews, for exams' },
  ];

  async function saveBusy() {
    if (!busyStart || !busyEnd || busyEnd < busyStart) {
      message = { text: 'Pick a start date and an end date after it.', bad: true };
      return;
    }
    await change({ busyStart, busyEnd });
    message = { text: 'Busy period saved. New words pause 5 days before it starts.' };
  }

  async function clearBusy() {
    busyStart = '';
    busyEnd = '';
    await change({ busyStart: null, busyEnd: null });
    message = { text: 'Busy period cleared.' };
  }

  async function exportBackup() {
    try {
      const events = await vocab.allEvents();
      const at = clockNow();
      const text = makeBackup(events, vocab.deviceId ?? 'unknown', at);
      const name = backupFileName(at);
      const file = new File([text], name, { type: 'application/json' });
      // On iPhone the share sheet saves to Files; elsewhere a normal download.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      message = { text: `Backup ready: ${events.length} events.` };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // Share cancelled.
      message = { text: `Could not export: ${String(err)}`, bad: true };
    }
  }

  async function importBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const events = parseBackup(await file.text());
      const added = await vocab.importEvents(events);
      // Restored events may be older than anything synced so far: send the whole log.
      if (added) void syncer.backupImported();
      message = {
        text: added
          ? `Imported ${added} events. Everything else was already here.`
          : 'Nothing new in that backup: it was all here already.',
      };
    } catch (err) {
      message = { text: err instanceof Error ? err.message : String(err), bad: true };
    }
  }

  function travelTo(days: number | null) {
    setTimeTravel(days);
    location.reload();
  }
</script>

<section class="card">
  <h2>Daily time</h2>
  <MinutesPicker
    label="Minutes a day"
    value={settings.dailyMinutes}
    onchange={(m) => change({ dailyMinutes: m })}
  />
  <label class="toggle">
    <input
      type="checkbox"
      data-testid="weekend-toggle"
      checked={settings.weekendMinutes !== null}
      onchange={(e) =>
        change({ weekendMinutes: e.currentTarget.checked ? settings.dailyMinutes : null })}
    />
    Different time at weekends
  </label>
  {#if settings.weekendMinutes !== null}
    <MinutesPicker
      label="Minutes on Saturday and Sunday"
      value={settings.weekendMinutes}
      onchange={(m) => change({ weekendMinutes: m })}
    />
  {/if}
  <p class="muted small">
    Changes ease in: new words adjust first, reviews follow over a week or two.
  </p>
</section>

<section class="card">
  <h2>How much to remember</h2>
  <div class="choices" role="radiogroup" aria-label="Target recall">
    {#each RETENTION as r (r.value)}
      <button
        class="choice"
        class:on={settings.targetRetention === r.value}
        role="radio"
        aria-checked={settings.targetRetention === r.value}
        data-retention={r.value}
        onclick={() => change({ targetRetention: r.value })}
      >
        <strong>{r.label}: {Math.round(r.value * 100)}%</strong>
        <span class="muted small">{r.note}</span>
      </button>
    {/each}
  </div>
  <p class="muted small">Reviews are timed so you still recall about this share of words.</p>
</section>

<section class="card">
  <h2>Busy period</h2>
  <p class="muted small">
    Exams or deadlines coming? New words pause 5 days before, so the busy days stay light.
  </p>
  <div class="dates">
    <label>From <input type="date" bind:value={busyStart} data-testid="busy-start" /></label>
    <label>To <input type="date" bind:value={busyEnd} data-testid="busy-end" /></label>
  </div>
  <div class="row">
    <button class="btn" onclick={saveBusy}>Save</button>
    {#if settings.busyStart}
      <button class="btn quiet" onclick={clearBusy}>Clear</button>
    {/if}
  </div>
</section>

<SyncCard />
<CaptureCard />

<section class="card">
  <h2>Backup</h2>
  <p class="muted small">
    Your data lives on this device until sync arrives. Export a backup once a week and keep it in
    Files or iCloud Drive.
  </p>
  <div class="row">
    <button class="btn primary" data-testid="export" onclick={exportBackup}>Export</button>
    <label class="btn">
      Import
      <input
        class="sr-only"
        type="file"
        accept=".json,application/json"
        data-testid="import"
        onchange={importBackup}
      />
    </label>
  </div>
  <p class="muted small">Importing adds what is missing and never deletes anything.</p>
</section>

{#if message}
  <p class="message" class:bad={message.bad} role="status" data-testid="settings-message">
    {message.text}
  </p>
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
    <dd>
      <button class="version" data-testid="version" onclick={() => (versionTaps += 1)}>
        {build}
      </button>
    </dd>
  </dl>
</section>

{#if showTravel}
  <section class="card travel" data-testid="time-travel">
    <h2>Time travel (testing)</h2>
    <p class="muted small">
      Moves the clock forward to try weeks of scheduling in minutes. It uses a separate test copy of
      the app's data, so your real words and reviews are never touched.
    </p>
    {#if travel === null}
      <button class="btn" data-testid="travel-on" onclick={() => travelTo(0)}>
        Start with test data
      </button>
    {:else}
      <p><strong>Test mode, day +{travel}.</strong></p>
      <div class="row">
        <button class="btn" data-testid="travel-day" onclick={() => travelTo(travel + 1)}>
          +1 day
        </button>
        <button class="btn" data-testid="travel-week" onclick={() => travelTo(travel + 7)}>
          +7 days
        </button>
        <button class="btn quiet" data-testid="travel-off" onclick={() => travelTo(null)}>
          Back to real data
        </button>
      </div>
    {/if}
  </section>
{/if}

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

  .choices {
    display: grid;
    gap: 8px;
  }

  .choice {
    display: grid;
    gap: 2px;
    min-height: 52px;
    padding: 8px 14px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    text-align: left;
    cursor: pointer;
  }

  .choice.on {
    border-color: var(--brand);
    box-shadow: inset 0 0 0 1px var(--brand);
  }

  .dates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .dates label {
    display: grid;
    gap: 4px;
    color: var(--muted);
    font-size: 0.85rem;
  }

  input[type='date'] {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    /* 16px or more stops iPhone zooming in. */
    font: inherit;
    font-size: 1rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .message {
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--good-bg);
    color: var(--good);
  }

  .message.bad {
    background: var(--bad-bg);
    color: var(--bad);
  }

  .error {
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

  .version {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: right;
    cursor: default;
  }

  .travel {
    border-color: var(--accent);
  }

  @media (prefers-color-scheme: dark) {
    .choice.on {
      border-color: #818cf8;
      box-shadow: inset 0 0 0 1px #818cf8;
    }
  }
</style>
