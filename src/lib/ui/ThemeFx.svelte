<script lang="ts">
  import { seededRandom } from '../random';
  import { theme, type ThemeFlash } from '../theme.svelte';

  // The finishing touch of a theme switch (src/lib/theme.svelte.ts): gold stars twinkle
  // in when it turns dark, a warm glow spreads from the button when it turns light.
  // Decoration only: it never takes taps, and it goes after a second and a half.

  const STARS = 16;
  const LIFE_MS = 1600;

  let shown = $state<ThemeFlash | null>(null);

  $effect(() => {
    const flash = theme.flash;
    if (!flash) return;
    shown = flash;
    const timer = setTimeout(() => {
      if (shown?.id === flash.id) shown = null;
    }, LIFE_MS);
    return () => clearTimeout(timer);
  });

  function stars(id: number) {
    const random = seededRandom(id * 7919);
    return Array.from({ length: STARS }, () => ({
      left: 4 + random() * 92,
      top: 4 + random() * 70,
      size: 8 + random() * 14,
      delay: random() * 0.5,
    }));
  }
</script>

{#if shown}
  {#key shown.id}
    <div class="fx {shown.to}" aria-hidden="true" style:--x="{shown.x}px" style:--y="{shown.y}px">
      {#if shown.to === 'dark'}
        <span class="halo"></span>
        {#each stars(shown.id) as star, i (i)}
          <svg
            class="star"
            viewBox="0 0 24 24"
            style:left="{star.left}%"
            style:top="{star.top}%"
            style:width="{star.size}px"
            style:height="{star.size}px"
            style:animation-delay="{star.delay}s"
          >
            <path d="M12 0 14.6 9.4 24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
          </svg>
        {/each}
      {:else}
        <span class="glow"></span>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .fx {
    position: fixed;
    inset: 0;
    z-index: 50;
    overflow: hidden;
    pointer-events: none;
  }

  .star {
    position: absolute;
    fill: #f6d27a;
    opacity: 0;
    filter: drop-shadow(0 0 6px rgb(246 210 122 / 80%));
    animation: twinkle 1.1s ease-in-out both;
  }

  @keyframes twinkle {
    0% {
      opacity: 0;
      transform: scale(0.2) rotate(0deg);
    }
    40% {
      opacity: 1;
      transform: scale(1) rotate(45deg);
    }
    100% {
      opacity: 0;
      transform: scale(0.4) rotate(90deg);
    }
  }

  .halo,
  .glow {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: 40px;
    height: 40px;
    margin: -20px 0 0 -20px;
    border-radius: 50%;
  }

  .halo {
    border: 2px solid rgb(246 210 122 / 70%);
    animation: halo 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes halo {
    from {
      opacity: 1;
      transform: scale(0.5);
    }
    to {
      opacity: 0;
      transform: scale(9);
    }
  }

  .glow {
    background: radial-gradient(circle, rgb(255 214 120 / 75%), rgb(255 190 80 / 0%) 70%);
    animation: glow 1.2s ease-out both;
  }

  @keyframes glow {
    from {
      opacity: 0.9;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(24);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fx {
      display: none;
    }
  }
</style>
