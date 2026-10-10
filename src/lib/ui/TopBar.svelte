<script lang="ts">
  import type { Snippet } from 'svelte';
  import Logo from '../Logo.svelte';
  import { syncer } from '../sync/sync.svelte';
  import { theme } from '../theme.svelte';

  // The brand bar at the top of every page. It also sits under the iPhone status bar, whose
  // text is white (apple-mobile-web-app-status-bar-style), so it stays dark in both themes.

  interface Props {
    title?: string;
    children?: Snippet;
  }

  let { title = 'Wordhoard', children }: Props = $props();
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
  <button
    class="mode"
    class:alone={!(syncer.key && syncer.status.phase !== 'test-mode') && !children}
    data-testid="theme-toggle"
    aria-label={theme.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    onclick={() => theme.toggle()}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      {#if theme.current === 'dark'}
        <path
          fill="currentColor"
          d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 1.2 3h-2.4L12 2zm0 20-1.2-3h2.4L12 22zM2 12l3-1.2v2.4L2 12zm20 0-3 1.2v-2.4L22 12zM4.9 4.9l3 1.3-1.7 1.7-1.3-3zm14.2 14.2-3-1.3 1.7-1.7 1.3 3zM4.9 19.1l1.3-3 1.7 1.7-3 1.3zM19.1 4.9l-1.3 3-1.7-1.7 3-1.3z"
        />
      {:else}
        <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" />
      {/if}
    </svg>
  </button>
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
    background: var(--bar);
    color: var(--on-bar);
    box-shadow:
      0 1px 0 rgb(255 255 255 / 6%),
      0 6px 18px -10px rgb(0 0 0 / 50%);
  }

  .brand {
    font-family: var(--serif);
    font-size: 1.35rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .mode {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-left: 4px;
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 50%;
    background: rgb(255 255 255 / 6%);
    color: #f2c766;
    cursor: pointer;
  }

  .mode.alone {
    margin-left: auto;
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
    background: #5fd394;
    box-shadow: 0 0 0 3px rgb(95 211 148 / 20%);
  }

  .dot.busy {
    background: #f2c766;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .problem .dot {
    background: #f87171;
  }
</style>
