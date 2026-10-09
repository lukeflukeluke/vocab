# Word-bank pipeline

Builds the inputs for the word bank from open data. Only needed when changing the
candidate list, the placement pool or the dictionary; content sessions just use the
committed files in `content/`.

```
python3 -m venv .venv
.venv/bin/pip install -r scripts/wordbank/requirements.txt
.venv/bin/python scripts/wordbank/fetch.py    # downloads into data/raw/ (about 70 MB, not committed)
.venv/bin/python -W ignore scripts/wordbank/build.py   # about 40 s
```

## What it makes

| File | What it is |
|---|---|
| `content/candidates.json` | 3,000 academic-frontier words, best first, with WordNet senses, frequency band, IPA, word family and British/American spellings |
| `content/placement.json` | Placement test pool: 16 frequency bands (headword ranks 1,000 to 42,000) with 64 words each, and 250 fake words |
| `content/dictionary/*.json` | Short definitions for 41,000 words, one file per first letter, for words captured from reading (build session S7) |

## How it decides

- **Words:** single-word, lower-case lemmas from Open English WordNet 2022 with at least
  one teachable sense. Senses with slur, obscenity or brand labels are dropped. Labels
  like "colloquial" or "disparaging" are set on whole groups of synonyms in WordNet, so
  they only filter words that are not on the editorial list.
- **Frequency:** wordfreq, summed over each word's inflected forms (`posit`, `posits`,
  `posited`...). Ranks and bands use these family-level frequencies.
- **See-through words are folded into their base:** inflected forms ("appointed" from
  "appoint") and transparent derivatives ("unhappiness", "laconically") of a more common
  word.
- **Word families** (WordNet derivation links between words sharing a stem, and
  British/American spelling pairs) get one headword; the others are listed as its family.
- **Academic-ness:** `curated.txt` is an editorial list of about 1,600 high-value words in
  themed groups, written by Claude. Every editorial word is a candidate. A logistic
  regression (`scoring.py`) learns what editorial words look like (kind of meaning, word
  endings, formality measured as Wikipedia vs film-subtitle frequency, frequency) and
  ranks the other frontier words (zipf 1.9 to 3.9) to fill the list.
- **Placement words** are ordinary dictionary words (in the pronunciation dictionary, 5+
  letters, not specialist or sensitive), each with a definition that does not give the
  word away (no form of the word, no part of a compound, no close relative), so the
  test's meaning checks test knowledge, not spelling. If the first sense's definition
  gives it away another sense is used; words with none are left out. **Fake words** come from a letter model of
  common words, and are rejected if they are real, contain a real word, start a real
  word, or are one letter from one.

## Why not Wiktionary

The plan named Wiktionary extracts from kaikki.org, but Claude Code cloud sessions cannot
reach kaikki.org. WordNet covers senses, glosses and families; origin stories are written
in content sessions, and only when the writer is sure of them.
