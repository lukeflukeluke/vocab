"""Downloads the open data the word-bank pipeline needs into data/raw/ (not committed).

Run from the repo root:  .venv/bin/python scripts/wordbank/fetch.py

Files already present are kept. Each file's SHA-256 is written to data/raw/SOURCES.json
so build.py can record exactly what it was built from.

Wiktionary extracts (kaikki.org) are not used: Claude Code cloud sessions cannot reach
kaikki.org. Everything here comes from GitHub raw files, which they can reach.
"""

import hashlib
import json
import urllib.request
import zipfile
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "raw"

SOURCES = {
    "oewn-2022": {
        "url": "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet2022.zip",
        "file": "wordnet2022.zip",
        "what": "Open English WordNet 2022 (senses, glosses, examples, word families, usage labels)",
        "licence": "CC BY 4.0",
    },
    "ipa-uk": {
        "url": "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt",
        "file": "ipa-en_UK.txt",
        "what": "British English IPA pronunciations (ipa-dict)",
        "licence": "MIT (ipa-dict)",
    },
    "ipa-us": {
        "url": "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt",
        "file": "ipa-en_US.txt",
        "what": "American English IPA pronunciations (ipa-dict)",
        "licence": "MIT (ipa-dict)",
    },
    "wikipedia-frequency": {
        "url": "https://raw.githubusercontent.com/IlyaSemenov/wikipedia-word-frequency/master/results/enwiki-2023-04-13.txt",
        "file": "enwiki-2023-04-13.txt",
        "what": "Word counts in English Wikipedia, April 2023 (formal written English)",
        "licence": "MIT (lists); Wikipedia text CC BY-SA",
    },
    "subtitles-frequency": {
        "url": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt",
        "file": "opensubtitles-en_full.txt",
        "what": "Word counts in English film and TV subtitles, OpenSubtitles 2018 (spoken English)",
        "licence": "CC BY-SA 4.0",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    record = {}
    for key, source in SOURCES.items():
        path = RAW / source["file"]
        if not path.exists():
            print(f"downloading {source['url']}")
            tmp = path.with_suffix(path.suffix + ".part")
            urllib.request.urlretrieve(source["url"], tmp)
            tmp.rename(path)
        record[key] = {**source, "sha256": sha256(path), "bytes": path.stat().st_size}
        print(f"{key}: {path.name} ({path.stat().st_size // 1024} KB)")

    wordnet_dir = RAW / "wordnet2022"
    if not wordnet_dir.exists():
        with zipfile.ZipFile(RAW / SOURCES["oewn-2022"]["file"]) as z:
            z.extractall(RAW)
    (RAW / "SOURCES.json").write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
