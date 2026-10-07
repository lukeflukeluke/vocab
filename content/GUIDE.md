# Writing word-bank entries (content sessions)

How a content session (C1, C2, ...) writes entries. Follow it exactly so every batch
looks and teaches the same way. The fields are defined in `src/lib/content/types.ts`;
`npm run validate:content` checks them.

---

## The routine

1. **Pick the words.** Each batch owns a fixed range of positions in the `candidates`
   array of `content/candidates.json` (0-based, end included), so two content sessions
   can run at the same time without writing the same words:

   | Batch | Positions | File |
   |---|---|---|
   | C1 | 0-156 | `001-batch.json` |
   | C2 | 157-336 | `002-batch.json` |
   | C3 | 337-516 | `003-batch.json` |
   | C4 | 517-696 | `004-batch.json` |
   | C5 | 697-876 | `005-batch.json` |

   Later batches continue in steps of 180. Write every word in the range except ones
   that already have an entry (search `content/entries/`) or are in
   `content/skipped.txt`. That gives about 150 entries.
   - Words with `"source": "editorial"` come first and are always worth an entry.
   - `"learned"` words were ranked by a model. Skip one if an educated adult would
     already know it, or if it is too technical or niche for general academic use.
     Record each skip in `content/skipped.txt` as `word  reason`, so it is not offered
     again.
2. **Choose the sense.** Each candidate lists WordNet senses. Teach the sense that
   matters for academic reading and writing, which is not always the first one. For
   example, `salient` is "most noticeable or important", not the military salient. If a
   word has two senses both worth learning, write two entries (`temper#v`,
   `temper#v.2`) and put the second one in a later batch.
   - Common everyday words on the editorial list (zipf 4.3 or more: `qualify`,
     `founder`, `champion`) are there for their academic sense ("qualify a claim",
     "the plan foundered"). Teach that sense.
3. **Write the entries** into the batch's file in `content/entries/` (a JSON array, in
   list order).
   - Faster: split the words into 5 parts and have 5 helper agents write them in
     parallel, each into its own scratch file, with this guide and the sample entries as
     their brief. Then have one more agent review all of them for meaning (blanks where
     another word fits, odd examples, weak "vs" boxes, doubtful origins), fix what it
     finds, and join the parts into the batch file. C1 was made this way.
4. **Check them:** `npm run validate:content`. Fix every problem it reports.
5. **Make a readable preview** for the owner:
   `npm run validate:content -- --preview NNN-batch.json`. Paste 10-15 random entries
   from it into the pull request description, so the owner can skim them.
6. Finish with the session routine in `CLAUDE.md` (tests, LOG entry, ROADMAP tick, pull
   request).

---

## Field by field

`content/entries/000-sample.json` has 20 finished examples. Match their style.

| Field | What to write |
|---|---|
| `id` | `headword#pos`: `posit#v`, `laconic#adj`, `albeit#conj`. A second sense of the same word and part of speech: `temper#v.2`. |
| `headword` | Exactly as in `candidates.json` (lower case). |
| `pos` | `n`, `v`, `adj`, `adv`, `conj` or `prep`. |
| `sense` | The meaning taught, in a few words. Tells senses apart in lists. |
| `forms` | Every inflected form used anywhere in the entry and accepted as a typed answer: plural (`dichotomies`), `-s`, `-ed`, `-ing` (`posits`, `posited`, `positing`). Empty for adjectives and adverbs. |
| `definition` | One plain sentence, 20 words at most, ending in a full stop. **Never use the word itself or its family** ("If someone is laconic..." is not allowed: the definition is also a test prompt). Start with "To..." for verbs, "A..." for nouns. |
| `register` | `formal`, `neutral` or `informal`. Most academic words are `formal`. |
| `nuance` | 2 or 3 sentences: what it is used about, how it feels (approving, critical, neutral), where it is common, a typical trap. |
| `everyday` | The closest common word or short phrase (3 words at most), for the "closest meaning" exercise. |
| `examples` | Exactly 6. See below. |
| `cloze` | Exactly 3 fill-in-the-blank sentences. See below. |
| `misuse` | Exactly 2 plausible but wrong uses, each with a one-line `why`. See below. |
| `partners` | 3 to 6 common word partners, each containing the word: "a tenuous link", "concede defeat". |
| `phrases` | 2 to 4 essay-ready phrases containing the word, with `...` where the writer continues: "These findings corroborate...". |
| `family` | Related words in other parts of speech ("corroboration", "corroborative"). Also used to stop blanks giving the answer away, so include every close relative. |
| `synonyms` | 1 to 4 near-synonyms, each with `vs`: one sentence (25 words at most) on how it differs. This is the "vs box"; make the distinction genuinely useful. |
| `antonyms` | 0 to 4 opposites. |
| `confusables` | 0 to 3 look-alike or sound-alike words people mix up (tenuous/tenacious, exacerbate/exasperate), each with a short note. |
| `roots` | 0 to 4 meaningful parts with their meaning ("tacere: to be silent (Latin)"). Leave empty if the parts do not help. |
| `siblings` | 0 to 5 other words sharing a root (attenuate, extenuate for tenuous). |
| `origin` | Optional, 40 words at most. **Only include it if you are sure it is right.** A wrong origin story is worse than none. |
| `tags` | 1 to 3 lower-case words. Use the `tag` from `candidates.json` first (`argument`, `reasoning`, `language`, `character`...). |
| `offList` | Only when deliberately adding a word that is not in `candidates.json`. |

### Examples (6)

- **The first example is the "guess first" sentence** (PLAN 4): its context must make
  the meaning fairly easy to guess.
- Use at least 3 different `setting`s, and **at least one `academic`**. Settings:
  `conversation`, `news`, `fiction`, `academic`, `formal`.
- Each uses the word exactly once, in the form named in `form`. Vary the forms for verbs
  and nouns (posits, posited, positing).
- 6 to 30 words, a capital letter at the start, `.` `!` or `?` at the end.
- Natural, modern and specific. Prefer topics a student meets: history, science,
  politics, literature, school, work, friends, the news. Avoid famous quotations.

### Fill-in-the-blank sentences (3)

- Exactly one `___`. `answer` is the form that fits.
- **The context must point clearly to this word**, so a learner who knows it can get it
  without guessing between several words. Add a clue: an explanation after a colon, a
  contrast ("not X but ___"), or a typical partner word.
- Never include the word, its forms or its family anywhere else in the sentence.
- At least 8 words. Do not reuse an example sentence.

### Misuse sentences (2)

- A sentence a learner might really write, using the word once, but wrongly: the wrong
  meaning (a "laconic" three-hour lecture), the wrong kind of thing ("mitigate a
  person"), or wrong grammar ("Albeit it was raining...").
- `why`: one short sentence saying what is wrong, 30 words at most.

### Style rules

- **No em dashes or en dashes anywhere.** Use a comma, colon, semicolon or a normal
  hyphen. The checker rejects them.
- Straight quotes only (`'` and `"`), never curly ones.
- British spelling in your own wording (behaviour, analyse), except headwords, which
  follow `candidates.json`. The `spellings` field there records both forms; the app
  accepts either.
- Plain, friendly English. No jargon in definitions.
- Nothing offensive, political point-scoring or upsetting. Keep examples balanced.

---

## When the checker complains

| Message | Fix |
|---|---|
| `not in content/candidates.json` | Use the exact headword from the list, or add `"offList": true` if deliberate. |
| `must not use the word itself` | Rephrase the definition or everyday word without the word or its family. |
| `gives the answer away` | A form or family word appears in the blank sentence; remove it. |
| `must use "X" exactly once` | The example's `form` does not match the text, or the word appears twice. |
| `form "X" is not the headword or one of forms` | Add the inflection to `forms`. |
| `use a normal hyphen, not a long dash` | Replace the dash. |
