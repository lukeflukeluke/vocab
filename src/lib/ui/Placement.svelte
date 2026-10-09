<script lang="ts">
  import { onMount } from 'svelte';
  import type { PlacementAnswer } from '../events/types';
  import {
    CHECKS,
    makeChecks,
    makeTest,
    type CheckItem,
    type PlacementPool,
    type TestItem,
  } from '../placement/placement';
  import { onButton, typingInField, withModifier } from './keys';

  // The placement test (PLAN 3.1): quick yes/no taps, then a few meaning checks.

  interface Props {
    pool: PlacementPool;
    /** Words not to test: ones shown in earlier tests and your own words. */
    exclude: ReadonlySet<string>;
    onfinish: (answers: PlacementAnswer[]) => void;
    oncancel: () => void;
  }

  let { pool, exclude, onfinish, oncancel }: Props = $props();

  const random = Math.random;
  // svelte-ignore state_referenced_locally
  const items: TestItem[] = makeTest(pool, exclude, random);

  let answers = $state<PlacementAnswer[]>([]);
  let checks = $state<CheckItem[] | null>(null);
  let checkIndex = $state(0);
  let picked = $state<number | null>(null);

  const item = $derived(items[answers.length]);
  const check = $derived(checks?.[checkIndex]);
  const total = $derived(items.length + (checks?.length ?? CHECKS));
  const done = $derived(answers.length + checkIndex);

  function say(yes: boolean) {
    if (!item) return;
    answers = [
      ...answers,
      { word: item.word, ...(item.band !== undefined && { band: item.band }), yes },
    ];
    if (answers.length === items.length) {
      checks = makeChecks(pool, answers, random);
      if (!checks.length) onfinish($state.snapshot(answers));
    }
  }

  function undo() {
    if (checks || !answers.length) return;
    answers = answers.slice(0, -1);
  }

  function choose(i: number) {
    if (!check || picked !== null) return;
    picked = i;
    const right = check.options[i]?.right ?? false;
    const word = check.word;
    answers = answers.map((a) => (a.word === word ? { ...a, checked: right } : a));
    // A short pause shows which was right, then on to the next.
    setTimeout(() => {
      picked = null;
      if (checkIndex + 1 >= checks!.length) onfinish($state.snapshot(answers));
      else checkIndex += 1;
    }, 600);
  }

  function onkeydown(event: KeyboardEvent) {
    if (typingInField(event) || withModifier(event) || onButton(event)) return;
    const key = event.key.toLowerCase();
    if (!checks) {
      if (key === 'y' || key === 'arrowright') say(true);
      else if (key === 'n' || key === 'arrowleft') say(false);
      else if (key === 'backspace') undo();
      else return;
    } else {
      const n = Number(key);
      if (n >= 1 && n <= 4) choose(n - 1);
      else if (key === '?' || key === '0') choose(-1);
      else return;
    }
    event.preventDefault();
  }

  onMount(() => window.scrollTo({ top: 0 }));
</script>

<svelte:window {onkeydown} />

<div class="placement" data-testid="placement">
  <div class="bar">
    <button class="close" onclick={oncancel}>Not now</button>
    <div
      class="progress"
      role="progressbar"
      aria-label="Test progress"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div class="fill" style:width="{(done / total) * 100}%"></div>
    </div>
  </div>

  <main class="stage">
    {#if !checks && item}
      <p class="tag">Part 1 of 2 · {answers.length + 1} of {items.length}</p>
      <p class="ask">Do you know what this word means?</p>
      <p class="word" data-testid="test-word" data-fake={item.band === undefined}>{item.word}</p>
      <p class="hint">Some are made up. Only say yes if you could explain it.</p>
      <div class="answers">
        <div class="yesno">
          <button class="btn big no" data-testid="say-no" onclick={() => say(false)}>No</button>
          <button class="btn big primary" data-testid="say-yes" onclick={() => say(true)}>
            Yes
          </button>
        </div>
        <button class="btn quiet" disabled={!answers.length} onclick={undo}>Undo</button>
        <p class="keys"><kbd>Y</kbd> yes · <kbd>N</kbd> no · <kbd>Backspace</kbd> undo</p>
      </div>
    {:else if check}
      <p class="tag">Part 2 of 2 · check {checkIndex + 1} of {checks!.length}</p>
      <p class="ask">You said you know this one. What does it mean?</p>
      <p class="word" data-testid="check-word">{check.word}</p>
      <div class="answers">
        <ol class="options">
          {#each check.options as option, i (option.text)}
            <li>
              <button
                class="option"
                class:right={picked !== null && option.right}
                class:wrong={picked === i && !option.right}
                data-right={option.right}
                disabled={picked !== null}
                onclick={() => choose(i)}
              >
                {option.text}
              </button>
            </li>
          {/each}
        </ol>
        <button class="btn quiet" disabled={picked !== null} onclick={() => choose(-1)}>
          I'm not sure
        </button>
      </div>
    {/if}
  </main>
</div>

<style>
  .placement {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  .bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 16px) 10px
      calc(env(safe-area-inset-left) + 8px);
    background: var(--brand);
    color: var(--on-brand);
  }

  .close {
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .progress {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 0.2s ease;
  }

  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    padding: 20px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 16px)
      calc(env(safe-area-inset-left) + 16px);
  }

  .tag {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .ask,
  .hint {
    margin: 0;
    color: var(--muted);
  }

  .hint {
    font-size: 0.9rem;
  }

  .word {
    margin: 24px 0;
    font-family: var(--serif);
    font-size: 2.4rem;
    font-weight: 700;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .answers {
    display: grid;
    gap: 10px;
    margin-top: auto;
  }

  .yesno {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .big {
    min-height: 64px;
    font-size: 1.2rem;
  }

  .options {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .option {
    width: 100%;
    min-height: 52px;
    padding: 10px 14px;
    border: 1.5px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    text-align: left;
    line-height: 1.3;
    cursor: pointer;
  }

  .option.right {
    border-color: var(--good);
    background: var(--good-bg);
  }

  .option.wrong {
    border-color: var(--bad);
    background: var(--bad-bg);
  }

  .keys {
    margin: 0;
    text-align: center;
  }
</style>
