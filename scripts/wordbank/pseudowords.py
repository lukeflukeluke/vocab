"""Fake but English-looking words for the placement test (PLAN 3.1).

Claiming to know a fake word shows over-claiming, so the placement score can be
corrected for it. The fakes come from a letter-trigram model of real words, then are
filtered so none of them is, or obviously contains, a real word.
"""

import bisect
import random
import string
from collections import defaultdict

ORDER = 3  # letters of context
START, END = "^" * ORDER, "$"
VOWELS = set("aeiouy")
# Fragments that would make a fake word rude or upsetting.
BLOCKED = ("sex", "ass", "cum", "fuk", "fuc", "shit", "piss", "tit", "nig", "fag", "rap", "porn", "kill", "die", "dead", "cock", "dick")


def train(words: list[str]) -> dict[str, dict[str, int]]:
    model: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for word in words:
        padded = START + word + END
        for i in range(len(padded) - ORDER):
            model[padded[i : i + ORDER]][padded[i + ORDER]] += 1
    return model


def generate(model, rng: random.Random, max_len: int = 12) -> str:
    out = START
    while len(out) < max_len + ORDER:
        options = model.get(out[-ORDER:])
        if not options:
            break
        letters, weights = zip(*sorted(options.items()))
        nxt = rng.choices(letters, weights=weights)[0]
        if nxt == END:
            break
        out += nxt
    return out[ORDER:]


def plausible(word: str, endings: set[str]) -> bool:
    if not 6 <= len(word) <= 10 or word[-2:] not in endings:
        return False
    if any(b in word for b in BLOCKED) or ("q" in word and "qu" not in word):
        return False
    if any(word[i] == word[i + 1] == word[i + 2] for i in range(len(word) - 2)):
        return False
    # No long runs of consonants or vowels.
    run = 0
    for i, c in enumerate(word):
        run = run + 1 if i and (c in VOWELS) == (word[i - 1] in VOWELS) else 1
        if run >= 4:
            return False
    return any(c in VOWELS for c in word)


def near_misses(word: str):
    """Every string one edit away: a letter deleted, changed, added or swapped."""
    letters = string.ascii_lowercase
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    for a, b in splits:
        if b:
            yield a + b[1:]
            for c in letters:
                yield a + c + b[1:]
        if len(b) > 1:
            yield a + b[1] + b[0] + b[2:]
        for c in letters:
            yield a + c + b


def make_pseudowords(
    words: list[str], is_real, count: int, vocabulary: list[str], seed: int = 2026
) -> list[str]:
    """`is_real(s)` must say whether a string is a real word (any frequency).
    `vocabulary` is a list of real words, used to reject fakes that are the start of one
    ("synony") or one letter away from one ("exagon")."""
    vocabulary = sorted(vocabulary)
    model = train(words)
    ending_counts: dict[str, int] = defaultdict(int)
    for w in words:
        ending_counts[w[-2:]] += 1
    endings = {e for e, n in ending_counts.items() if n >= 30}
    rng = random.Random(seed)
    found: list[str] = []
    seen: set[str] = set()
    attempts = 0
    while len(found) < count and attempts < 500_000:
        attempts += 1
        word = generate(model, rng)
        if word in seen or not plausible(word, endings):
            continue
        seen.add(word)
        if is_real(word):
            continue
        # Reject a real word plus an ending ("walkingly") or a long real word inside.
        stems = [word[:-k] for k in (1, 2, 3, 4) if len(word) - k >= 4]
        if any(is_real(s) for s in stems):
            continue
        if any(is_real(word[i:j]) for i in range(len(word)) for j in range(i + 6, len(word) + 1)):
            continue
        after = bisect.bisect_left(vocabulary, word)
        if after < len(vocabulary) and vocabulary[after].startswith(word):
            continue
        if any(is_real(near) for near in near_misses(word) if near != word):
            continue
        found.append(word)
    return sorted(found)
