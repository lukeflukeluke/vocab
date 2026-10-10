<script lang="ts">
  import { onMount } from 'svelte';
  import type { BankEntry } from '../../content/bank';
  import type { Cloze } from '../../content/types';
  import { checkTyped, normalize, type TypedResult } from '../../session/answers';
  import { gapHint, splitAtGap } from '../../session/exercises';
  import { onButton, typingInField, withModifier } from '../keys';
  import Sentence from '../Sentence.svelte';

  type Hint = 'first' | 'count' | 'meaning';

  interface Props {
    entry: BankEntry;
    cloze: Cloze;
    /** Show the first letter from the start (not counted as a hint). */
    firstLetter: boolean;
    /** Offer the hint ladder (PLAN 5). The "I know this" check has none. */
    hints?: boolean;
    /** Make you type the answer once after a miss. */
    retype?: boolean;
    question?: string;
    onanswer: (result: TypedResult, hintsUsed: number) => void;
    oncontinue: () => void;
  }

  let {
    entry,
    cloze,
    firstLetter,
    hints: offerHints = true,
    retype: needRetype = true,
    question = 'Type the missing word.',
    onanswer,
    oncontinue,
  }: Props = $props();

  let value = $state('');
  let result = $state<TypedResult | null>(null);
  let used = $state<Hint[]>([]);
  let input = $state<HTMLInputElement>();

  const split = $derived(splitAtGap(cloze.text));
  const ladder = $derived<Hint[]>(
    firstLetter ? ['count', 'meaning'] : ['first', 'count', 'meaning'],
  );
  const nextHint = $derived(ladder.find((h) => !used.includes(h)));
  const answered = $derived(result !== null);
  const retyping = $derived(needRetype && result !== null && !result.correct);
  const retyped = $derived(retyping && matchesAnswer(value));
  const canContinue = $derived(answered && (!retyping || retyped));

  const hintLabel: Record<Hint, string> = {
    first: 'First letter',
    count: 'Number of letters',
    meaning: 'Meaning',
  };

  function matchesAnswer(text: string): boolean {
    const typed = normalize(text);
    if (!typed) return false;
    const check = checkTyped(typed, cloze.answer, entry);
    return check.verdict === 'exact';
  }

  function submit() {
    if (answered) {
      if (canContinue) oncontinue();
      return;
    }
    const checked = checkTyped(value, cloze.answer, entry);
    if (checked.verdict === 'empty') return;
    finish(checked);
  }

  function dontKnow() {
    if (answered) return;
    finish({ verdict: 'wrong', correct: false, typed: normalize(value), expected: cloze.answer });
  }

  function finish(checked: TypedResult) {
    result = checked;
    onanswer(checked, used.length);
    if (!checked.correct && needRetype) value = '';
    focusInput();
  }

  function hint() {
    if (answered) return;
    if (nextHint) used = [...used, nextHint];
    else dontKnow();
    focusInput();
  }

  function focusInput() {
    input?.focus({ preventScroll: true });
    keepVisible();
  }

  /** Scrolls the answer box above the iPhone keyboard once it has opened. */
  function keepVisible() {
    setTimeout(() => input?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  }

  onMount(() => {
    focusInput();
    const viewport = window.visualViewport;
    const onResize = () => {
      if (document.activeElement === input) keepVisible();
    };
    viewport?.addEventListener('resize', onResize);
    return () => viewport?.removeEventListener('resize', onResize);
  });

  function onInputKey(event: KeyboardEvent) {
    // A "?" is never part of an answer, so it means "I don't know" here too.
    if (event.key === '?' && !answered) {
      event.preventDefault();
      dontKnow();
    } else if (event.altKey && event.code === 'KeyH') {
      event.preventDefault();
      hint();
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (typingInField(event) || withModifier(event)) return;
    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      hint();
    } else if (event.key === '?') {
      event.preventDefault();
      dontKnow();
    } else if (event.key === 'Enter' && !onButton(event) && canContinue) {
      event.preventDefault();
      oncontinue();
    }
  }

  const showFirst = $derived(firstLetter || used.includes('first'));
  const showCount = $derived(used.includes('count'));
  const gapText = $derived(answered ? cloze.answer : gapHint(cloze.answer, showFirst, showCount));
</script>

<svelte:window {onkeydown} />

<div class="prompt">
  <Sentence {split} mode="gap" fill={gapText} filled={answered} />
  {#if used.includes('meaning') || (answered && !result?.correct)}
    <p class="meaning"><span class="label">Meaning</span> {entry.definition}</p>
  {/if}
  <h2 class="question">{question}</h2>

  <form
    class="answer"
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    <label class="sr-only" for="answer">Your answer</label>
    <input
      id="answer"
      bind:this={input}
      bind:value
      data-answer
      class:right={answered && result?.correct}
      class:wrong={answered && !result?.correct && !retyped}
      class:retyped
      type="text"
      inputmode="text"
      enterkeyhint={answered ? 'next' : 'done'}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="none"
      spellcheck="false"
      placeholder={retyping ? `Type "${cloze.answer}"` : ''}
      onkeydown={onInputKey}
      onfocus={keepVisible}
    />

    {#if result}
      <div class="feedback" role="status">
        {#if result.verdict === 'exact'}
          <p class="good">Right!</p>
        {:else if result.verdict === 'form'}
          <p class="good">Right word. This sentence needs <strong>{cloze.answer}</strong>.</p>
        {:else if result.verdict === 'near'}
          <p class="good">Nearly! It's spelled <strong>{cloze.answer}</strong>.</p>
        {:else}
          <p class="bad">
            The answer is <strong>{cloze.answer}</strong>{#if result.typed}, not "{result.typed}"{/if}.
          </p>
          {#if needRetype}
            <p class="muted">
              {retyped ? 'That helps it stick.' : 'Type it once to help it stick.'}
            </p>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="actions">
      {#if !answered}
        <button class="btn primary wide" type="submit" disabled={!value.trim()}>Check</button>
        <div class="row">
          <button class="btn quiet" type="button" data-testid="unknown" onclick={dontKnow}>
            I don't know
          </button>
          {#if offerHints}
            <button class="btn" type="button" data-testid="hint" onclick={hint}>
              {nextHint ? `Hint: ${hintLabel[nextHint].toLowerCase()}` : 'Show answer'}
            </button>
          {/if}
        </div>
        <p class="keys">
          <kbd>Enter</kbd> check · <kbd>?</kbd> I don't know
          {#if offerHints}<span>· <kbd>Alt</kbd>+<kbd>H</kbd> hint</span>{/if}
        </p>
      {:else}
        <button
          class="btn primary wide"
          type="submit"
          data-testid="continue"
          disabled={!canContinue}
        >
          Continue
        </button>
        <p class="keys"><kbd>Enter</kbd> continue</p>
      {/if}
    </div>
  </form>
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

  .meaning {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }

  .label {
    display: block;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .answer {
    display: grid;
    gap: 12px;
  }

  input {
    width: 100%;
    min-height: 54px;
    padding: 10px 14px;
    border: 2px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    /* 16px or more stops iPhone zooming in. */
    font-size: 1.25rem;
    font-family: inherit;
    outline: none;
    scroll-margin: 120px;
  }

  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  input.right,
  input.retyped {
    border-color: var(--good);
    background: var(--good-bg);
    animation: pop 0.35s var(--ease);
  }

  input.wrong {
    border-color: var(--bad);
    animation: shake 0.35s ease-in-out;
  }

  .feedback p {
    margin: 0;
  }

  .feedback {
    display: grid;
    gap: 4px;
  }

  .good {
    color: var(--good);
    font-weight: 600;
  }

  .bad {
    color: var(--bad);
    font-weight: 600;
  }

  .muted {
    color: var(--muted);
  }

  .actions {
    display: grid;
    gap: 8px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .keys {
    margin: 0;
    text-align: center;
  }
</style>
