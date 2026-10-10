<script lang="ts">
  import type { Snippet } from 'svelte';

  // A progress ring with something in the middle (Today: minutes left, or a tick).

  interface Props {
    /** 0 to 1. */
    value: number;
    size?: number;
    children?: Snippet;
  }

  let { value, size = 72, children }: Props = $props();
  const R = 15.5;
  const C = 2 * Math.PI * R;
  const shown = $derived(Math.min(1, Math.max(0, value)));
</script>

<div
  class="ring"
  style:width="{size}px"
  style:height="{size}px"
  role="img"
  aria-label="{Math.round(shown * 100)}% of today done"
>
  <svg viewBox="0 0 36 36" aria-hidden="true">
    <circle class="track" cx="18" cy="18" r={R} />
    <circle
      class="fill"
      cx="18"
      cy="18"
      r={R}
      stroke-dasharray={C}
      stroke-dashoffset={C * (1 - shown)}
    />
  </svg>
  <div class="middle">{@render children?.()}</div>
</div>

<style>
  .ring {
    position: relative;
    flex: none;
  }

  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  circle {
    fill: none;
    stroke-width: 3.2;
  }

  .track {
    stroke: rgb(255 255 255 / 14%);
  }

  .fill {
    stroke: #f2c766;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.8s var(--ease);
  }

  .middle {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    color: #f8efdc;
  }
</style>
