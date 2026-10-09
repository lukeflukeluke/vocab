<script lang="ts">
  import { onMount } from 'svelte';
  import type { PlacementAnswer } from '../events/types';
  import {
    AdaptiveTest,
    QUESTIONS,
    type PlacementPool,
    type Question,
  } from '../placement/placement';
  import { onButton, typingInField, withModifier } from './keys';

  // The placement test (PLAN 3.1): quick yes/no taps that get harder while you know the
  // words, with a meaning check now and then on a "yes".

  interface Props {
    pool: PlacementPool;
    /** Words not to test: ones shown in earlier tests and your own words. */
    exclude: ReadonlySet<string>;
    onfinish: (answers: PlacementAnswer[]) => void;
    oncancel: () => void;
  }

  let { pool, exclude, onfinish, oncancel }: Props = $props();

  // svelte-ignore state_referenced_locally
  const test = new AdaptiveTest(pool, exclude, Math.random);

  let question = $state<Question>(test.next());
  let asked = $state(0);
  let picked = $state<number | null>(null);

  function show() {
    question = test.next();
    asked = test.asked;
    if (question.kind === 'done') onfinish(structuredClone(test.answers));
  }

  function say(yes: boolean) {
    if (question.kind !== 'word') return;
    test.answerWord(yes);
    show();
  }

  function undo() {
    if (question.kind !== 'word' || !test.answers.length) return;
    test.undo();
    show();
  }

  function choose(i: number) {
    if (question.kind !== 'check' || picked !== null) return;
    picked = i;
    const right = question.check.options[i]?.right ?? false;
    // A short pause shows which was right, then on to the next.
    setTimeout(() => {
      picked = null;
      test.answerCheck(right);
      show();
    }, 600);
  }

  function onkeydown(event: KeyboardEvent) {
    if (typingInField(event) || withModifier(event) || onButton(event)) return;
    const key = event.key.toLowerCase();
    if (question.kind === 'word') {
      if (key === 'y' || key === 'arrowright') say(true);
      else if (key === 'n' || key === 'arrowleft') say(false);
      else if (key === 'backspace') undo();
      else return;
    } else if (question.kind === 'check') {
      const n = Number(key);
      if (n >= 1 && n <= 4) choose(n - 1);
      else if (key === '?' || key === '0') choose(-1);
      else return;
    } else return;
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
      aria-valuemax={QUESTIONS}
      aria-valuenow={asked}
    >
      <div class="fill" style:width="{(asked / QUESTIONS) * 100}%"></div>
    </div>
  </div>

  <main class="stage">
    {#if question.kind === 'word'}
      <p class="tag">Question {asked + 1} of {QUESTIONS}</p>
      <p class="ask">Do you know what this word means?</p>
      <p class="word" data-testid="test-word" data-fake={question.band === undefined}>
        {question.word}
      </p>
      <p class="hint">
        Some are made up. Only say yes if you could explain it. The words get harder as you go.
      </p>
      <div class="answers">
        <div class="yesno">
          <button class="btn big no" data-testid="say-no" onclick={() => say(false)}>No</button>
          <button class="btn big primary" data-testid="say-yes" onclick={() => say(true)}>
            Yes
          </button>
        </div>
        <button class="btn quiet" disabled={!asked} onclick={undo}>Undo</button>
        <p class="keys"><kbd>Y</kbd> yes · <kbd>N</kbd> no · <kbd>Backspace</kbd> undo</p>
      </div>
    {:else if question.kind === 'check'}
      <p class="tag">Question {asked + 1} of {QUESTIONS} · quick check</p>
      <p class="ask">You said you know this one. What does it mean?</p>
      <p class="word" data-testid="check-word">{question.check.word}</p>
      <div class="answers">
        <ol class="options">
          {#each question.check.options as option, i (option.text)}
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
