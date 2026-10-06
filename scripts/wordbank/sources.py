"""Loads the raw open data (see fetch.py) into plain Python structures."""

import math
import re
from functools import lru_cache
from pathlib import Path

import nltk
from nltk.corpus.reader.wordnet import WordNetCorpusReader

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"


class _OEWN(WordNetCorpusReader):
    # NLTK maps newer WordNets back to 3.0 for multilingual data, which needs the 3.0
    # files. Nothing here uses that.
    def map_wn(self, version="3.0"):
        return {}


@lru_cache(maxsize=1)
def wordnet() -> WordNetCorpusReader:
    nltk.data.path.append(str(RAW))
    return _OEWN(str(RAW / "wordnet2022"), None)


def read_counts(path: Path, keep: set[str]) -> tuple[dict[str, int], int]:
    """Counts for the words in `keep`, and the total count of all words in the file."""
    counts: dict[str, int] = {}
    total = 0
    with path.open(encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) != 2 or not parts[1].isdigit():
                continue
            word, count = parts[0].lower(), int(parts[1])
            total += count
            if word in keep:
                counts[word] = counts.get(word, 0) + count
    return counts, total


def read_ipa(path: Path) -> dict[str, str]:
    """First listed pronunciation per word, without the slashes."""
    ipa: dict[str, str] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            word, _, prons = line.rstrip("\n").partition("\t")
            first = prons.split(",")[0].strip().strip("/")
            if word and first and word not in ipa:
                ipa[word] = first
    return ipa


def per_million(count: int, total: int) -> float:
    return count * 1e6 / total if total else 0.0


def log_ratio(a: float, b: float, smoothing: float = 0.05) -> float:
    return math.log10((a + smoothing) / (b + smoothing))


WORD_RE = re.compile(r"^[a-z]+$")
