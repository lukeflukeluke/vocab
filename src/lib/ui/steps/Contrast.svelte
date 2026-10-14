<script lang="ts">
  import type { BankEntry } from '../../content/bank';
  import { splitAtGap, type ContrastItem } from '../../session/exercises';
  import { onButton, typingInField, withModifier } from '../keys';
  import Sentence from '../Sentence.svelte';

  // P4, contrast drill (PLAN 5): two words you mix up, and a few sentences. Pick which
  // word fits each, then check them all at once.

  interface Props {
    word: BankEntry;
    other: BankEntry;
    items: ContrastItem[];
    /** Called once: all right or not, and whether `other` was picked where `word` belonged. */
    onanswer: (allRight: boolean, choseOther: boolean) => void;
    oncontinue: () => void;
  }

  let { word, other, items, onanswer, oncontinue }: Props = $props();

  let picks = $state<(string | null)[]>([]);
  let checked = $state(false);
  const pair = $derived([word, other]);
  const ready = $derived(items.every((_, i) => picks[i]));
  const allRight = $derived(items.every((item, i) => picks[i] === item.answerId));

  function pick(i: number, id: string) {
    if (checked) return;
    const next = [...picks];
    next[i] = id;
    picks = next;
  }

  function check() {
    if (!ready || checked) return;
    checked = true;
    const choseOther = items.some((item, i) => item.answerId === word.id && picks[i] === other.id);
    onanswer(allRight, choseOther);
  }

  function onkeydown(event: KeyboardEvent) {
    if (typingInField(event) || withModifier(event) || onButton(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (checked) oncontinue();
      else check();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="drill">
  <h2 class="question">
    You mix up <strong>{word.headword}</strong> and <strong>{other.headword}</strong>. Which fits
    each sentence?
  </h2>
  <div class="pair">
    {#each pair as e (e.id)}
      <p class="sense"><strong>{e.headword}</strong> {e.definition}</p>
    {/each}
  </div>

  <ol class="items">
    {#each items as item, i (i)}
      {@const right = checked && picks[i] === item.answerId}
      <li class:right class:wrong={checked && !right} data-item={i} data-answer-id={item.answerId}>
        <Sentence
          split={splitAtGap(item.text)}
          mode="gap"
          fill={checked ? item.fill : ''}
          filled={checked}
        />
        <div class="choices" role="radiogroup" aria-label="Which word fits">
          {#each pair as e (e.id)}
            <button
              class="choice"
              class:on={picks[i] === e.id}
              role="radio"
              aria-checked={picks[i] === e.id}
              disabled={checked}
              data-option-id={e.id}
              onclick={() => pick(i, e.id)}
            >
              {e.headword}
            </button>
          {/each}
        </div>
      </li>
    {/each}
  </ol>

  {#if checked}
    <p class="result" class:good={allRight} role="status">
      {allRight
        ? 'All right: you can tell them apart.'
        : 'Not quite. The right words are filled in.'}
    </p>
    <button class="btn primary wide" data-testid="continue" onclick={oncontinue}>Continue</button>
  {:else}
    <button class="btn primary wide" data-testid="check" disabled={!ready} onclick={check}>
      Check
    </button>
  {/if}
</div>

<style>
  .drill {
    display: grid;
    gap: 14px;
  }

  .question {
    margin: 0;
    font-size: 1.15rem;
  }

  .pair {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface-2);
  }

  .sense {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .sense strong {
    color: var(--text);
    font-family: var(--serif);
  }

  .items {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .items li {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1.5px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .items li :global(.sentence) {
    font-size: 1.1rem;
  }

  .items li.right {
    border-color: var(--good);
    background: var(--good-bg);
  }

  .items li.wrong {
    border-color: var(--bad);
    background: var(--bad-bg);
    animation: shake 0.35s ease-in-out;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .choice {
    min-height: 44px;
    padding: 6px 10px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--surface-2);
    font-family: var(--serif);
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
  }

  .choice.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .result {
    margin: 0;
    color: var(--bad);
    font-weight: 600;
  }

  .result.good {
    color: var(--good);
  }
</style>
