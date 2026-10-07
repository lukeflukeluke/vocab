<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Option } from '../../session/exercises';
  import { onButton, typingInField, withModifier } from '../keys';

  interface Props {
    question: string;
    options: Option[];
    correctId: string;
    /** Label of the "I don't know" button. */
    unknownLabel?: string;
    /** Called once, with the option picked or null for "I don't know". */
    onanswer: (picked: Option | null) => void;
    oncontinue: () => void;
    prompt: Snippet;
    /** Shown after answering; gets whether the answer was right. */
    after?: Snippet<[boolean]>;
    /** Extra buttons shown before answering. */
    extra?: Snippet;
  }

  let {
    question,
    options,
    correctId,
    unknownLabel = "I don't know",
    onanswer,
    oncontinue,
    prompt,
    after,
    extra,
  }: Props = $props();

  let picked = $state<Option | null | undefined>(undefined);
  const answered = $derived(picked !== undefined);
  const correct = $derived(picked?.id === correctId);

  function choose(option: Option | null) {
    if (answered) return;
    picked = option;
    onanswer(option);
  }

  function onkeydown(event: KeyboardEvent) {
    if (typingInField(event) || withModifier(event)) return;
    if (!answered) {
      const n = Number(event.key);
      if (n >= 1 && n <= options.length) {
        event.preventDefault();
        choose(options[n - 1]!);
      } else if (event.key === '?' || event.key === '0') {
        event.preventDefault();
        choose(null);
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && !onButton(event)) {
      event.preventDefault();
      oncontinue();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="prompt">
  {@render prompt()}
  <h2 class="question">{question}</h2>
</div>

<div class="answers">
  <ol class="options" aria-label="Options">
    {#each options as option, i (option.id)}
      <li>
        <button
          class="option"
          class:right={answered && option.id === correctId}
          class:wrong={answered && picked?.id === option.id && !correct}
          class:faded={answered && option.id !== correctId && picked?.id !== option.id}
          disabled={answered}
          aria-pressed={picked?.id === option.id}
          data-option-id={option.id}
          onclick={() => choose(option)}
        >
          <span class="num" aria-hidden="true">{i + 1}</span>
          <span class="text">{option.text}</span>
          {#if answered && option.id === correctId}
            <span class="mark" aria-label="right answer">✓</span>
          {:else if answered && picked?.id === option.id}
            <span class="mark" aria-label="your answer">✗</span>
          {/if}
        </button>
      </li>
    {/each}
  </ol>

  {#if !answered}
    <div class="row">
      <button class="btn quiet" data-testid="unknown" onclick={() => choose(null)}>
        {unknownLabel}
      </button>
      {@render extra?.()}
    </div>
    <p class="keys">
      <kbd>1</kbd>-<kbd>{options.length}</kbd> choose · <kbd>?</kbd>
      {unknownLabel}
    </p>
  {:else}
    <div class="feedback" class:good={correct} role="status">
      {@render after?.(correct)}
    </div>
    <button class="btn primary wide" data-testid="continue" onclick={oncontinue}>Continue</button>
    <p class="keys"><kbd>Enter</kbd> continue</p>
  {/if}
</div>

<style>
  .prompt {
    display: grid;
    gap: 14px;
  }

  .question {
    margin: 0;
    color: var(--muted);
    font-size: 1rem;
    font-weight: 600;
  }

  .answers {
    display: grid;
    gap: 10px;
    margin-top: auto;
    padding-top: 20px;
  }

  .options {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 10px 14px;
    border: 1.5px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    text-align: left;
    line-height: 1.3;
    cursor: pointer;
    touch-action: manipulation;
  }

  .option:disabled {
    cursor: default;
  }

  .option:not(:disabled):active {
    border-color: var(--brand);
  }

  .num {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--bg);
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .text {
    flex: 1;
  }

  .mark {
    flex: none;
    font-weight: 700;
  }

  .right {
    border-color: var(--good);
    background: var(--good-bg);
  }

  .right .mark {
    color: var(--good);
  }

  .wrong {
    border-color: var(--bad);
    background: var(--bad-bg);
  }

  .wrong .mark {
    color: var(--bad);
  }

  .faded {
    opacity: 0.5;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
  }

  .feedback {
    display: grid;
    gap: 6px;
  }

  .feedback:empty {
    display: none;
  }

  .keys {
    margin: 0;
    text-align: center;
  }
</style>
