"""Academic-ness: the editorial list, a model that learns from it, and spelling pairs."""

import math
import re
from pathlib import Path

import numpy as np
import wordfreq

CURATED = Path(__file__).resolve().parent / "curated.txt"


def read_curated(path: Path = CURATED) -> dict[str, str]:
    """Word to tag ("# tag" lines start a group). The first group a word appears in wins."""
    tags: dict[str, str] = {}
    tag = "general"
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith("#"):
            name = line[1:].strip()
            if re.fullmatch(r"[a-z]+", name):
                tag = name
            continue
        for word in line.split():
            tags.setdefault(word.lower(), tag)
    return tags


# British and American spellings: (British pattern, American replacement), applied to
# the end of a word unless marked as a prefix.
_SPELLING_RULES = [
    ("isation", "ization"), ("ise", "ize"), ("ised", "ized"), ("ising", "izing"),
    ("yse", "yze"), ("our", "or"), ("tre", "ter"), ("bre", "ber"), ("gre", "ger"),
    ("ence", "ense"),
]  # fmt: skip
# Inside a word. Only "sceptic" works both ways; turning an American "e" into a British
# "ae" or "oe" guesses wrong too often ("mores" is not "moraes").
_SPELLING_INFIXES = [("sceptic", "skeptic", True), ("ae", "e", False), ("oe", "e", False)]


def spelling_pair(word: str) -> dict[str, str] | None:
    """{"uk": ..., "us": ...} when the word has a British/American spelling pair in use."""
    for uk, us in _SPELLING_RULES:
        for a, b, a_is_uk in ((uk, us, True), (us, uk, False)):
            if word.endswith(a) and len(word) > len(a) + 2:
                other = word[: -len(a)] + b
                if _in_use(other):
                    return {"uk": word, "us": other} if a_is_uk else {"uk": other, "us": word}
    for uk, us, both_ways in _SPELLING_INFIXES:
        for a, b, a_is_uk in ((uk, us, True), (us, uk, False))[: 2 if both_ways else 1]:
            if a in word:
                other = word.replace(a, b, 1)
                if other != word and _in_use(other):
                    return {"uk": word, "us": other} if a_is_uk else {"uk": other, "us": word}
    return None


def _in_use(word: str) -> bool:
    return wordfreq.zipf_frequency(word, "en", wordlist="large") >= 1.5


SUFFIXES = (
    "ous", "ious", "eous", "ive", "ate", "ity", "ent", "ant", "ence", "ance", "ic", "ical",
    "ize", "ise", "ism", "ist", "ory", "ible", "able", "ion", "ment", "ly", "al", "ure",
    "tude", "acy", "esque", "ine", "ary", "ful", "less", "ness", "ship", "ate", "ify",
)  # fmt: skip
PREFIXES = (
    "con", "com", "in", "im", "ex", "pro", "pre", "re", "de", "dis", "sub", "ob", "per",
    "trans", "inter", "circum", "ab", "ad", "mal", "bene", "un", "ir", "il", "e", "a",
)  # fmt: skip
LEXNAMES = (
    "noun.cognition", "noun.communication", "noun.attribute", "noun.state", "noun.act",
    "noun.feeling", "noun.person", "noun.relation", "noun.artifact", "noun.group",
    "verb.cognition", "verb.communication", "verb.change", "verb.social", "verb.stative",
    "verb.emotion", "adj.all", "adj.pert", "adj.ppl", "adv.all",
)  # fmt: skip
POSES = ("n", "v", "adj", "adv")


def features(w) -> list[float]:
    top = w.senses[0]
    z = w.zipf - 3.0
    reg = max(-1.0, min(3.0, w.register))
    return [
        1.0,
        z, z * z,
        reg, reg * reg,
        w.abstract,
        sum(s.weight for s in w.senses) / len(w.senses),
        math.log1p(len(w.senses)),
        len(w.word) / 10,
        sum(s.technical for s in w.senses) / len(w.senses),
        *[1.0 if top.pos == p else 0.0 for p in POSES],
        *[1.0 if top.lexname == l else 0.0 for l in LEXNAMES],
        *[1.0 if w.word.endswith(s) else 0.0 for s in SUFFIXES],
        *[1.0 if w.word.startswith(p) else 0.0 for p in PREFIXES],
    ]  # fmt: skip


def learned_scores(pool: list, positive: set[str], epochs: int = 400, l2: float = 1e-3) -> list[float]:
    """Logistic regression: how much each word looks like the editorial list.

    Words not on the list are treated as negatives, so this ranks rather than classifies.
    """
    x = np.array([features(w) for w in pool])
    mean, std = x[:, 1:].mean(axis=0), x[:, 1:].std(axis=0) + 1e-9
    x[:, 1:] = (x[:, 1:] - mean) / std
    y = np.array([1.0 if w.word in positive else 0.0 for w in pool])
    # Balance the classes so the small positive set is not drowned out.
    weights = np.where(y == 1, 0.5 / max(y.mean(), 1e-9), 0.5 / max(1 - y.mean(), 1e-9))
    theta = np.zeros(x.shape[1])
    rate = 0.5
    for _ in range(epochs):
        p = 1 / (1 + np.exp(-(x @ theta)))
        grad = x.T @ (weights * (p - y)) / len(y) + l2 * theta
        theta -= rate * grad
    return list(1 / (1 + np.exp(-(x @ theta))))
