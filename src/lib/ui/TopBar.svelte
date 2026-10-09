<script lang="ts">
  import type { Snippet } from 'svelte';
  import Logo from '../Logo.svelte';
  import { syncer } from '../sync/sync.svelte';

  // The brand bar at the top of every page. It also sits under the iPhone status bar, whose
  // text is white (apple-mobile-web-app-status-bar-style), so it must stay dark.

  interface Props {
    title?: string;
    children?: Snippet;
  }

  let { title = 'Vocab', children }: Props = $props();
</script>

<header class="topbar">
  <Logo size={28} />
  <span class="brand">{title}</span>
  {#if children}<span class="extra">{@render children()}</span>{/if}
  {#if syncer.key && syncer.status.phase !== 'test-mode'}
    <span
      class="sync"
      class:problem={syncer.status.phase === 'error'}
      data-testid="sync-badge"
      title={syncer.status.phase === 'error' ? syncer.status.message : 'Sync'}
    >
      <span class="dot" class:busy={syncer.status.phase === 'syncing'}></span>
      {syncer.status.phase === 'syncing'
        ? 'Syncing'
        : syncer.status.phase === 'error'
          ? syncer.status.reason === 'offline'
            ? 'Offline'
            : 'Not synced'
          : 'Synced'}
    </span>
  {/if}
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 3;
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

  .extra {
    margin-left: auto;
  }

  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0.85;
  }

  .extra + .sync {
    margin-left: 12px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ade80;
  }

  .dot.busy {
    background: var(--accent);
  }

  .problem .dot {
    background: #f87171;
  }
</style>
