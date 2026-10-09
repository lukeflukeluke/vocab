<script lang="ts">
  // Bottom tabs, within thumb reach.

  export type Tab = 'today' | 'progress' | 'settings';

  interface Props {
    tab: Tab;
    onchange: (tab: Tab) => void;
  }

  let { tab, onchange }: Props = $props();

  const TABS: { id: Tab; label: string; icon: string }[] = [
    {
      id: 'today',
      label: 'Today',
      icon: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 5v11h12V8H6zm2 2h4v4H8v-4z',
    },
    {
      id: 'progress',
      label: 'Progress',
      icon: 'M4 20V10h3v10H4zm6.5 0V4h3v16h-3zM17 20v-7h3v7h-3z',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5-2.2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
    },
  ];
</script>

<nav class="tabs" aria-label="Main">
  {#each TABS as t (t.id)}
    <button
      class="tab"
      class:on={tab === t.id}
      aria-current={tab === t.id ? 'page' : undefined}
      data-testid="tab-{t.id}"
      onclick={() => onchange(t.id)}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" d={t.icon} />
      </svg>
      {t.label}
    </button>
  {/each}
</nav>

<style>
  .tabs {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 4px calc(env(safe-area-inset-right) + 8px) calc(env(safe-area-inset-bottom) + 4px)
      calc(env(safe-area-inset-left) + 8px);
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .tab {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-height: 52px;
    padding: 6px 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tab.on {
    color: var(--text);
  }

  .tab.on svg {
    color: var(--accent);
  }
</style>
