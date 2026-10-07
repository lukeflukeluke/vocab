<script lang="ts">
  import type { Split } from '../session/exercises';

  interface Props {
    split: Split;
    /** 'word' highlights the word; 'gap' shows a blank (with `fill` or a hint in it). */
    mode: 'word' | 'gap';
    /** Text shown in the gap: a hint such as "l..." or the answer once known. */
    fill?: string;
    /** The gap holds the answer (styled as filled in rather than as a hint). */
    filled?: boolean;
  }

  let { split, mode, fill = '', filled = false }: Props = $props();
</script>

<p class="sentence">
  {split.before}{#if mode === 'word'}<mark>{split.middle}</mark>{:else}<span
      class="gap"
      class:filled
      aria-label={filled ? fill : 'blank'}>{fill || ' '}</span
    >{/if}{split.after}
</p>

<style>
  .sentence {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.3rem;
    line-height: 1.5;
    color: var(--text);
  }

  mark {
    padding: 0 3px;
    border-radius: 4px;
    background: var(--mark);
    color: inherit;
    font-weight: 700;
  }

  .gap {
    display: inline-block;
    min-width: 4.5em;
    padding: 0 4px;
    border-bottom: 2px solid var(--muted);
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    letter-spacing: 0.05em;
    text-align: center;
    white-space: pre;
  }

  .gap.filled {
    border-bottom-color: var(--good);
    color: var(--good);
    font-family: var(--serif);
    font-size: 1em;
    font-weight: 700;
    letter-spacing: 0;
  }
</style>
