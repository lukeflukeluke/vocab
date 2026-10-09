<script lang="ts">
  import type { BankEntry } from '../../content/bank';
  import type { Example } from '../../content/types';
  import type { SelfGrade } from '../../scheduler/rating';
  import { splitAtWord } from '../../session/exercises';
  import { onButton, typingInField, withModifier } from '../keys';
  import Sentence from '../Sentence.svelte';

  // R3, quick recall: say the meaning in your head, reveal it, and say how it went.

  interface Props {
    entry: BankEntry;
    example: Example;
    onanswer: (grade: SelfGrade) => void;
  }

  let { entry, example, onanswer }: Props = $props();

  let shown = $state(false);
  let graded = false;

  const grades: { grade: SelfGrade; label: string }[] = [
    { grade: 'missed', label: 'Missed' },
    { grade: 'fuzzy', label: 'Fuzzy' },
    { grade: 'got', label: 'Got it' },
  ];

  function grade(value: SelfGrade) {
    if (!shown || graded) return;
    graded = true;
    onanswer(value);
  }

  function onkeydown(event: KeyboardEvent) {
    if (typingInField(event) || withModifier(event)) return;
    if (!shown && (event.key === ' ' || event.key === 'Enter') && !onButton(event)) {
      event.preventDefault();
      shown = true;
    } else if (shown && ['1', '2', '3'].includes(event.key)) {
      event.preventDefault();
      grade(grades[Number(event.key) - 1]!.grade);
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="prompt">
  <Sentence split={splitAtWord(example.text, example.form)} mode="word" />
  <h2 class="question">What does <em>{entry.headword}</em> mean? Say it in your head.</h2>
  {#if shown}
    <div class="reveal" role="status">
      <p class="definition">{entry.definition}</p>
      {#if entry.everyday}
        <p class="everyday">Close to: <strong>{entry.everyday}</strong></p>
      {/if}
    </div>
  {/if}
</div>

<div class="answers">
  {#if !shown}
    <button class="btn primary wide" data-testid="reveal" onclick={() => (shown = true)}>
      Show meaning
    </button>
    <p class="keys"><kbd>Space</kbd> show meaning</p>
  {:else}
    <p class="ask">How did you do?</p>
    <div class="grades">
      {#each grades as g, i (g.grade)}
        <button class="btn grade {g.grade}" data-grade={g.grade} onclick={() => grade(g.grade)}>
          {g.label}
          <span class="keys-inline" aria-hidden="true">{i + 1}</span>
        </button>
      {/each}
    </div>
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

  .reveal {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .reveal p {
    margin: 0;
  }

  .definition {
    font-size: 1.1rem;
  }

  .everyday {
    color: var(--muted);
  }

  .answers {
    display: grid;
    gap: 10px;
    margin-top: auto;
    padding-top: 20px;
  }

  .ask {
    margin: 0;
    color: var(--muted);
    text-align: center;
  }

  .grades {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .grade {
    min-height: 56px;
    padding: 8px;
  }

  .missed {
    border-color: var(--bad);
    color: var(--bad);
  }

  .got {
    border-color: var(--good);
    color: var(--good);
  }

  .keys-inline {
    display: none;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 400;
  }

  @media (hover: hover) and (pointer: fine) {
    .keys-inline {
      display: inline;
    }
  }

  .keys {
    margin: 0;
    text-align: center;
  }
</style>
