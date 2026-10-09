<script lang="ts">
  import { syncer } from '../sync/sync.svelte';

  // "Synced just now", "Syncing...", "Offline: will sync when you're back online"...

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  const ago = (t: number) => {
    const minutes = Math.round((now - t) / 60_000);
    return minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  };

  const MESSAGES = {
    'not-set-up': 'The sync server is not set up yet.',
    'bad-key': 'The sync key was not accepted.',
    offline: "Offline: it will sync when you're back online.",
    server: 'Sync failed; it will try again in a few minutes.',
  } as const;
</script>

<span class="status" data-testid="sync-status" data-phase={syncer.status.phase}>
  {#if syncer.status.phase === 'syncing'}
    Syncing...
  {:else if syncer.status.phase === 'ok'}
    Synced {ago(syncer.status.at)}.
  {:else if syncer.status.phase === 'error'}
    {MESSAGES[syncer.status.reason]}
  {/if}
</span>

<style>
  .status {
    color: var(--muted);
  }
</style>
