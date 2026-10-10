<script lang="ts">
  import { flushSync, onMount } from 'svelte';
  import { getBank } from '../content/wordBank';
  import { yourBank } from '../content/yourBank';
  import type { EventBody, Rating } from '../events/types';
  import { rateAnswer, usualResponseMs, type Answer, type SelfGrade } from '../scheduler/rating';
  import { enteredWord, type TypedResult } from '../session/answers';
  import {
    meaningOptions,
    splitAtGap,
    splitAtWord,
    wordOptions,
    type Option,
  } from '../session/exercises';
  import { clozeFor, exampleFor } from '../session/prompts';
  import {
    afterKnownCheck,
    claimKnown,
    completeStep,
    currentStep,
    isFinished,
    progress,
    type Session,
  } from '../session/runner';
  import type { ExerciseStep } from '../session/steps';
  import { vocab } from '../state/store.svelte';
  import { onButton, typingInField, withModifier } from './keys';
  import Sentence from './Sentence.svelte';
  import { speak } from './speech';
  import Choice from './steps/Choice.svelte';
  import Recall from './steps/Recall.svelte';
  import Typed from './steps/Typed.svelte';
  import WordPage from './WordPage.svelte';

  // Fixed for the session: words met in it are already in the state when it starts.
  // svelte-ignore state_referenced_locally
  const bank = yourBank(getBank(), vocab.state);

  interface Props {
    session: Session;
    onpause: () => void;
    onfinish: (session: Session) => void;
  }

  let { session: initial, onpause, onfinish }: Props = $props();

  // svelte-ignore state_referenced_locally
  let session = $state.raw(initial);
  let saveError = $state<string | null>(null);

  const step = $derived(currentStep(session));
  const entry = $derived(step ? bank.byId.get(step.entryId) : undefined);
  const done = $derived(Math.round(progress(session) * 100));

  /** When the current step appeared, for answer times. */
  let shownAt = performance.now();
  /** The current exercise's result, set when it is answered. */
  let outcome: { correct: boolean; rating: Rating } | null = null;
  let knownPassed = false;

  // Saves run one after another, so a word is always added before its first review.
  let saving: Promise<void> = Promise.resolve();
  function save(work: () => Promise<unknown>) {
    saving = saving
      .then(async () => {
        await work();
      })
      .catch((err: unknown) => {
        saveError = err instanceof Error ? err.message : String(err);
      });
  }

  function record(body: EventBody) {
    save(() => vocab.record(body));
  }

  function ensureAdded(entryId: string) {
    save(async () => {
      if (!vocab.state.words[entryId]) {
        await vocab.record({ type: 'word_added', entryId, source: 'bank' });
      }
    });
  }

  $effect(() => {
    // Meeting a word adds it to your words, so a paused session picks up from here.
    if (step?.kind === 'page') ensureAdded(step.entryId);
  });

  function report(
    current: ExerciseStep,
    answer: Omit<Answer, 'ms' | 'usualMs'>,
    extra: { answer?: string; chose?: string } = {},
  ) {
    const ms = Math.round(performance.now() - shownAt);
    const usualMs = vocab.deviceId
      ? usualResponseMs(vocab.state, current.exercise, vocab.deviceId)
      : null;
    const rating = rateAnswer({ ...answer, ms, usualMs });
    outcome = { correct: answer.correct, rating };
    ensureAdded(current.entryId);
    record({
      type: 'review',
      entryId: current.entryId,
      track: current.track,
      exercise: current.exercise,
      correct: answer.correct,
      rating,
      ms,
      hintsUsed: answer.hintsUsed,
      promptId: current.promptId,
      ...(extra.answer !== undefined && { answer: extra.answer }),
      ...(extra.chose !== undefined && { chose: extra.chose }),
    });
  }

  function reportChoice(current: ExerciseStep, picked: Option | null) {
    const correct = picked?.id === current.entryId;
    report(
      current,
      { kind: 'choice', correct, hintsUsed: 0 },
      { answer: picked?.id ?? '', ...(picked && !correct && { chose: picked.id }) },
    );
  }

  function reportTyped(current: ExerciseStep, result: TypedResult, hintsUsed: number) {
    const chose = result.correct ? undefined : enteredWord(result.typed, bank, current.entryId);
    report(
      current,
      { kind: 'typed', correct: result.correct, hintsUsed, nearMiss: result.verdict === 'near' },
      { answer: result.typed, ...(chose && { chose }) },
    );
  }

  function reportRecall(current: ExerciseStep, grade: SelfGrade) {
    report(current, { kind: 'self', correct: grade !== 'missed', hintsUsed: 0, selfGrade: grade });
    next(current.key);
  }

  /** "I know this word": a typed check decides (PLAN 3.5). */
  function reportKnown(current: ExerciseStep, result: TypedResult) {
    knownPassed = result.correct;
    ensureAdded(current.entryId);
    if (result.correct) {
      record({ type: 'word_status_set', entryId: current.entryId, status: 'known' });
    } else {
      report(current, { kind: 'typed', correct: false, hintsUsed: 0 }, { answer: result.typed });
    }
  }

  /** A new word to take the place of one you already knew. */
  function replacement(): string | null {
    const taken = new Set(session.steps.map((s) => s.entryId));
    return bank.candidates.find((id) => !vocab.state.words[id] && !taken.has(id)) ?? null;
  }

  function show(updated: Session) {
    flushSync(() => {
      session = updated;
    });
    shownAt = performance.now();
    outcome = null;
    // Focusing inside the tap that moved on lets the iPhone keyboard open by itself.
    const input = document.querySelector<HTMLInputElement>('[data-answer]');
    if (input) input.focus({ preventScroll: true });
    else window.scrollTo({ top: 0 });
    if (isFinished(updated)) onfinish(updated);
  }

  function next(key: string) {
    const current = step;
    if (!current || current.key !== key) return; // A double tap moves on only once.
    if (current.kind === 'exercise' && current.role === 'known') {
      show(afterKnownCheck(session, knownPassed, knownPassed ? replacement() : null));
    } else if (current.kind === 'exercise') {
      show(completeStep(session, outcome ?? { correct: false, rating: 1 }));
    } else {
      show(completeStep(session, { correct: true }));
    }
  }

  function knowIt() {
    show(claimKnown(session));
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onpause();
      return;
    }
    if (typingInField(event) || withModifier(event) || step?.kind !== 'page') return;
    if (event.key === 'Enter' && !onButton(event)) {
      event.preventDefault();
      next(step.key);
    } else if (event.key === 'p' && entry) {
      speak(entry.headword);
    }
  }

  onMount(() => {
    // A step whose word is missing from the bank cannot be shown; skip it.
    if (step && !entry) show(completeStep(session, { correct: true }));
  });
</script>

<svelte:window {onkeydown} />

<div class="session">
  <div class="bar">
    <button class="pause" data-testid="pause" onclick={onpause}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
      </svg>
      Pause
    </button>
    <div
      class="progress"
      role="progressbar"
      aria-label="Session progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={done}
    >
      <div class="fill" style:width="{done}%"></div>
    </div>
  </div>

  {#if saveError}
    <p class="error" role="alert">Could not save your answer: {saveError}</p>
  {/if}

  {#if step && entry}
    {#key step.key}
      <main
        class="stage"
        data-testid="step"
        data-kind={step.kind === 'exercise' ? step.exercise : step.kind}
        data-role={step.kind === 'exercise' ? step.role : step.kind}
        data-entry-id={step.entryId}
        data-prompt-id={step.kind === 'page' ? '' : step.promptId}
      >
        {#if step.kind === 'guess'}
          {@const example = exampleFor(entry, step.promptId)}
          <p class="tag new">New word</p>
          <Choice
            question="What do you think {entry.headword} means?"
            options={meaningOptions(entry, bank, step.key)}
            correctId={entry.id}
            unknownLabel="No idea"
            onanswer={() => {}}
            oncontinue={() => next(step.key)}
          >
            {#snippet prompt()}
              <Sentence split={splitAtWord(example.text, example.form)} mode="word" />
            {/snippet}
            {#snippet extra()}
              <button class="btn" data-testid="know-it" onclick={knowIt}>I know this word</button>
            {/snippet}
            {#snippet after(correct)}
              <p class:good={correct}>
                {correct ? 'Good guess!' : 'Now you know. Here it is properly.'}
              </p>
            {/snippet}
          </Choice>
        {:else if step.kind === 'page'}
          <p class="tag new">New word</p>
          <WordPage {entry} promptIds={step.promptIds} />
          <div class="sticky">
            <button class="btn primary wide" data-testid="continue" onclick={() => next(step.key)}>
              Got it
            </button>
            <p class="keys"><kbd>Enter</kbd> continue · <kbd>P</kbd> pronounce</p>
          </div>
        {:else if step.exercise === 'R1'}
          {@const example = exampleFor(entry, step.promptId)}
          <p class="tag">
            {step.role === 'review' ? 'Review' : step.role === 'repeat' ? 'Once more' : 'Check'}
          </p>
          <Choice
            question="What does {entry.headword} mean here?"
            options={meaningOptions(entry, bank, step.key)}
            correctId={entry.id}
            onanswer={(picked) => reportChoice(step, picked)}
            oncontinue={() => next(step.key)}
          >
            {#snippet prompt()}
              <Sentence split={splitAtWord(example.text, example.form)} mode="word" />
            {/snippet}
            {#snippet after(correct)}
              <p class:good={correct}>
                {correct ? 'Right!' : 'Not this time.'}
                {#if entry.everyday}
                  <strong>{entry.headword}</strong> is close to "{entry.everyday}".
                {:else}
                  <strong>{entry.headword}</strong>: {entry.definition}
                {/if}
              </p>
            {/snippet}
          </Choice>
        {:else if step.exercise === 'R3'}
          <p class="tag">Review</p>
          <Recall
            {entry}
            example={exampleFor(entry, step.promptId)}
            onanswer={(grade) => reportRecall(step, grade)}
          />
        {:else if step.exercise === 'P3'}
          {@const cloze = clozeFor(entry, step.promptId)}
          <p class="tag">Review</p>
          <Choice
            question="Which word fits?"
            options={wordOptions(entry, bank, vocab.state, step.key)}
            correctId={entry.id}
            onanswer={(picked) => reportChoice(step, picked)}
            oncontinue={() => next(step.key)}
          >
            {#snippet prompt()}
              <Sentence split={splitAtGap(cloze.text)} mode="gap" />
            {/snippet}
            {#snippet after(correct)}
              <p class:good={correct}>{correct ? 'Right!' : 'It was this one:'}</p>
              <Sentence split={splitAtGap(cloze.text)} mode="gap" fill={cloze.answer} filled />
            {/snippet}
          </Choice>
        {:else if step.role === 'known'}
          <p class="tag">Prove it</p>
          <p class="note">Get it right and it's marked as known. Miss it and we'll learn it.</p>
          <Typed
            {entry}
            cloze={clozeFor(entry, step.promptId)}
            firstLetter={false}
            hints={false}
            retype={false}
            question="Type the word that fits."
            onanswer={(result) => reportKnown(step, result)}
            oncontinue={() => next(step.key)}
          />
        {:else}
          <p class="tag">
            {step.role === 'blank' ? 'New word' : step.role === 'repeat' ? 'Once more' : 'Review'}
          </p>
          <Typed
            {entry}
            cloze={clozeFor(entry, step.promptId)}
            firstLetter={step.firstLetter}
            onanswer={(result, hints) => reportTyped(step, result, hints)}
            oncontinue={() => next(step.key)}
          />
        {/if}
      </main>
    {/key}
  {/if}
</div>

<style>
  .session {
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
    background: var(--bar);
    color: var(--on-bar);
    box-shadow: 0 6px 18px -10px rgb(0 0 0 / 50%);
  }

  .pause {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .progress {
    flex: 1;
    height: 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.14);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #e2a52a, #f6d27a);
    box-shadow: 0 0 10px rgb(242 199 102 / 60%);
    transition: width 0.5s var(--ease);
  }

  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    padding: 20px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 16px)
      calc(env(safe-area-inset-left) + 16px);
    animation: rise 0.3s var(--ease) both;
  }

  .tag {
    align-self: flex-start;
    margin: 0;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .tag.new {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .good {
    color: var(--good);
    font-weight: 600;
  }

  .stage :global(.feedback p) {
    margin: 0;
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .sticky {
    position: sticky;
    bottom: 0;
    display: grid;
    gap: 6px;
    margin-top: auto;
    padding: 16px 0 calc(env(safe-area-inset-bottom) + 4px);
    background: linear-gradient(to bottom, transparent, var(--bg) 24px);
  }

  .keys {
    margin: 0;
    text-align: center;
  }

  .error {
    margin: 0;
    padding: 10px 16px;
    background: var(--bad-bg);
    color: var(--bad);
  }
</style>
