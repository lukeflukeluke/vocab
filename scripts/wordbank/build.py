"""Builds the word-bank inputs in content/ from the raw open data. Run fetch.py first.

    .venv/bin/python scripts/wordbank/build.py

Writes:
  content/candidates.json   academic-frontier words, best first, with their senses
  content/placement.json    placement-test pool: real words by frequency band, fake words
  content/dictionary/*.json compact dictionary for captured words, one file per letter

Deterministic: the same raw data always gives the same files.
"""

import json
import math
import random
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import wordfreq

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pseudowords import make_pseudowords  # noqa: E402
from scoring import learned_scores, read_curated, spelling_pair  # noqa: E402
from sources import RAW, ROOT, WORD_RE, log_ratio, per_million, read_counts, read_ipa, wordnet  # noqa: E402

CONTENT = ROOT / "content"

POS_SHORT = {"n": "n", "v": "v", "a": "adj", "s": "adj", "r": "adv"}

# Senses with these usage labels are never taught: slurs, obscenities, brand names and
# grammatical oddities.
BAD_USAGE = {
    "obscenity.n.02", "ethnic_slur.n.01", "trademark.n.02", "trade_name.n.01",
    "plural.n.01", "combining_form.n.01", "acronym.n.01", "comparative.n.01",
    "superlative.n.01", "french.n.01", "blend.n.02",
}  # fmt: skip
# WordNet puts these labels on a whole group of synonyms, not one word ("frugal" shares a
# group with colloquial "scotch"), so they only filter words that are not on the
# editorial list.
DOUBTFUL_USAGE = {
    "disparagement.n.01", "colloquialism.n.01", "slang.n.02", "archaism.n.01",
    "dialect.n.01", "regionalism.n.01",
}  # fmt: skip
BAD_GLOSS = re.compile(
    r"\((archaic|obsolete|slang|vulgar|obscene|offensive|derogatory|disparaging|ethnic slur)[^)]*\)"
    r"|\b(offensive|vulgar|obscene|derogatory) (term|word|name|slang)\b",
    re.I,
)

# How useful a sense's kind of meaning is for academic reading and writing. Abstract
# meanings (thinking, arguing, judging, changing) score high; concrete things (plants,
# animals, body parts, substances) low.
LEXNAME_WEIGHT = {
    "noun.cognition": 1.0, "noun.communication": 0.9, "noun.attribute": 0.9,
    "noun.motive": 0.9, "noun.relation": 0.9, "noun.state": 0.8, "noun.feeling": 0.8,
    "noun.act": 0.7, "noun.person": 0.6, "noun.phenomenon": 0.6, "noun.process": 0.6,
    "noun.event": 0.5, "noun.group": 0.5, "noun.Tops": 0.5, "noun.possession": 0.4,
    "noun.time": 0.4, "noun.quantity": 0.3, "noun.shape": 0.3, "noun.location": 0.2,
    "noun.artifact": 0.15, "noun.object": 0.1, "noun.substance": 0.05, "noun.body": 0.05,
    "noun.food": 0.05, "noun.animal": 0.0, "noun.plant": 0.0,
    "verb.cognition": 1.0, "verb.communication": 0.9, "verb.social": 0.8,
    "verb.emotion": 0.8, "verb.stative": 0.8, "verb.change": 0.7, "verb.competition": 0.6,
    "verb.creation": 0.6, "verb.perception": 0.6, "verb.possession": 0.5,
    "verb.motion": 0.3, "verb.contact": 0.3, "verb.consumption": 0.2, "verb.body": 0.1,
    "verb.weather": 0.0,
    "adj.all": 0.9, "adj.ppl": 0.6, "adj.pert": 0.4, "adv.all": 0.8,
}  # fmt: skip

# Topic labels that mark specialist senses (still fine as words, but not general
# academic vocabulary). Law, logic, philosophy, economics and the like are not here.
TECHNICAL_TOPICS = {
    "medicine", "pathology", "anatomy", "chemistry", "biology", "biochemistry", "botany",
    "zoology", "genetics", "geology", "physics", "electronics", "computer_science",
    "computing", "mathematics", "geometry", "astronomy", "music", "sport", "athletics",
    "football", "american_football", "baseball", "basketball", "golf", "tennis", "cricket",
    "bowling", "nautical", "navy", "military", "heraldry", "cooking", "printing",
    "photography", "meteorology", "mineralogy", "mechanics", "engineering",
    "pharmacology", "surgery", "dentistry", "ornithology", "entomology", "ichthyology",
    "card_game", "chess", "bridge", "poker", "phonetics", "statistics", "telecommunication",
    "electricity", "aeronautics", "architecture", "sewing", "weaving", "knitting",
}  # fmt: skip

# Academic linking words that WordNet lacks (it has only nouns, verbs, adjectives and
# adverbs). Glosses written for this list.
EXTRA_WORDS = {
    "albeit": ("conj", "even though; although (usually before a short phrase)"),
    "whereas": ("conj", "while on the contrary; in contrast with the fact that"),
    "whilst": ("conj", "while (mainly British and formal)"),
    "lest": ("conj", "for fear that; to avoid the risk that"),
    "amid": ("prep", "in the middle of or during (something, often unpleasant)"),
    "amidst": ("prep", "amid; in the middle of"),
    "insofar": ("conj", "(insofar as) to the extent that"),
    "inasmuch": ("conj", "(inasmuch as) because; to the extent that"),
    "notwithstanding": ("prep", "in spite of; without being prevented by"),
    # Missing from Open English WordNet 2022 (or only there capitalised).
    "whereby": ("adv", "by which; through which"),
    "subtext": ("n", "an underlying meaning in a text or conversation that is not stated directly"),
    "amoral": ("adj", "without moral standards; not concerned with right or wrong"),
    "commodify": ("v", "turn something into a product that can be bought and sold"),
    "zeitgeist": ("n", "the general spirit, ideas and mood of a particular period"),
    "draconian": ("adj", "(of laws or punishments) excessively harsh and severe"),
}

# The frontier: a frequency range for the candidate list, as Zipf values (log10 of
# frequency per billion words). 3.9 is about the 6,000th headword, 1.9 about the
# 38,000th (PLAN 3.2 aims at ranks 8,000 to 40,000; the placement test then finds each
# learner's own frontier inside this range).
FRONTIER_ZIPF = (1.9, 3.9)

# Formality: log10 of (Wikipedia frequency / film-subtitle frequency). Moderately formal
# words score best. Very high ratios mark encyclopedic topics (sports, places,
# institutions), not academic vocabulary; low ratios mark everyday speech.
REGISTER_PEAK = 0.6
REGISTER_WIDTH = 0.8
# Kinds of meaning below this weight (concrete things) are not academic candidates.
MIN_ABSTRACT = 0.3
TARGET_WORDS = 3000
SENSES_PER_WORD = 3

# Placement-test bands: log-spaced headword ranks.
BAND_COUNT = 16
BAND_RANKS = (1000, 60000)
PLACEMENT_PER_BAND = 64
FAKE_WORDS = 250

# Placement words skip concrete specialist kinds (birds, plants, chemicals) and anything
# touching sex or slurs: the test should measure general vocabulary, comfortably.
PLACEMENT_SKIP_KINDS = {"noun.animal", "noun.plant", "noun.body", "noun.substance", "noun.food"}
SENSITIVE_GLOSS = re.compile(r"sex|genital|penis|vagina|erect|orgasm|lesbian|homosexual|prostitut|slur", re.I)

DICTIONARY_MIN_ZIPF = 1.5
DICTIONARY_SENSES = 3


@dataclass
class Sense:
    pos: str
    gloss: str
    lexname: str
    examples: list[str]
    synonyms: list[str]
    technical: bool
    weight: float  # usefulness of this kind of meaning (LEXNAME_WEIGHT)
    score: float  # ordering within the word: frequency in tagged text, then usefulness


@dataclass
class Word:
    word: str
    senses: list[Sense]
    forms: set[str]
    zipf: float = 0.0
    register: float = 0.0  # log10(Wikipedia per million / subtitles per million)
    abstract: float = 0.0
    academic: float = 0.0  # 0 to 1, percentile among frontier words
    priority: float = 0.0
    tag: str | None = None  # group on the editorial list (curated.txt), if it is there
    rank: int = 0  # by frequency among all headwords
    band: int = 0
    family: set[str] = field(default_factory=set)
    related: set[str] = field(default_factory=set)
    extra: bool = False


def topic_names(synset) -> set[str]:
    return {t.name().split(".")[0] for t in synset.topic_domains()}


def collect_senses(wn, word: str, editorial: bool = False) -> list[Sense]:
    senses: list[Sense] = []
    bad_usage = BAD_USAGE if editorial else BAD_USAGE | DOUBTFUL_USAGE
    for index, synset in enumerate(wn.synsets(word)):
        lemmas = [l for l in synset.lemmas() if l.name() == word]  # exact case: no proper nouns
        if not lemmas or synset.instance_hypernyms():
            continue
        if {u.name() for u in synset.usage_domains()} & bad_usage:
            continue
        gloss = synset.definition().strip()
        if BAD_GLOSS.search(gloss):
            continue
        technical = bool(topic_names(synset) & TECHNICAL_TOPICS)
        weight = LEXNAME_WEIGHT.get(synset.lexname(), 0.3) * (0.2 if technical else 1.0)
        count = sum(l.count() for l in lemmas)
        senses.append(
            Sense(
                pos=POS_SHORT[synset.pos()],
                gloss=gloss,
                lexname=synset.lexname(),
                examples=[e for e in synset.examples() if word in e.lower()][:2],
                synonyms=[l.name() for l in synset.lemmas() if l.name() != word and "_" not in l.name()][:4],
                technical=technical,
                weight=weight,
                score=math.log1p(count) + weight - 0.05 * index,
            )
        )
    senses.sort(key=lambda s: -s.score)
    if any(not s.technical for s in senses):
        senses = [s for s in senses if not s.technical]
    return senses


def reverse_exceptions(wn) -> dict[tuple[str, str], set[str]]:
    """Irregular forms by (lemma, pos), from WordNet's exception lists."""
    out: dict[tuple[str, str], set[str]] = defaultdict(set)
    for pos, table in wn._exception_map.items():
        for form, lemmas in table.items():
            for lemma in lemmas:
                out[(lemma, pos)].add(form)
    return out


def inflections(wn, word: str, poses: set[str], irregular) -> set[str]:
    """The word's own inflected forms (plural, -ed, -ing...), checked with WordNet."""
    forms = {word}
    guesses: set[tuple[str, str]] = set()
    for pos in poses:
        p = {"adj": "a", "adv": "r"}.get(pos, pos)
        guesses |= {(f, p) for f in irregular.get((word, p), ())}
        if pos == "n":
            guesses |= {(word + "s", p), (word + "es", p), (word[:-1] + "ies", p)}
        if pos == "v":
            stem = word[:-1] if word.endswith("e") else word
            double = word + word[-1] if re.search(r"[^aeiou][aeiou][bdgklmnprt]$", word) else word
            guesses |= {
                (word + "s", p), (word + "es", p), (word[:-1] + "ies", p),
                (word + "d", p), (word + "ed", p), (word[:-1] + "ied", p), (double + "ed", p),
                (stem + "ing", p), (double + "ing", p),
            }  # fmt: skip
    for form, p in guesses:
        if form != word and word in wn._morphy(form, p):
            forms.add(form)
    return forms


def family_zipf(forms: set[str]) -> float:
    total = sum(wordfreq.word_frequency(f, "en", wordlist="large") for f in forms)
    return math.log10(total * 1e9) if total > 0 else 0.0


SEE_THROUGH_SUFFIXES = ("ness", "lessness", "fulness", "ly")
SEE_THROUGH_PREFIXES = ("un", "non")


def see_through_base(wn, word: str, words: dict[str, "Word"]) -> str | None:
    """A more common base that makes this word's meaning obvious: "unhappiness" from
    "happy", or an inflected form such as "appointed" from "appoint"."""
    me = words[word]
    for pos in "vn":
        for lemma in wn._morphy(word, pos):
            other = words.get(lemma)
            if lemma != word and other and other.zipf >= me.zipf:
                return lemma
    bases = []
    for suffix in SEE_THROUGH_SUFFIXES:
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            bases += [stem, stem[:-1] + "y" if stem.endswith("i") else stem, stem + "e"]
    for prefix in SEE_THROUGH_PREFIXES:
        if word.startswith(prefix):
            bases.append(word[len(prefix) :])
    for base in bases:
        other = words.get(base)
        if other and other.zipf >= 4.0 and other.zipf >= me.zipf + 0.3:
            return base
    return None


def shares_stem(a: str, b: str) -> bool:
    common = 0
    for x, y in zip(a, b):
        if x != y:
            break
        common += 1
    return common >= max(5, min(len(a), len(b)) - 3)


def derivational_links(wn, word: str) -> set[str]:
    linked = set()
    for synset in wn.synsets(word):
        for lemma in synset.lemmas():
            if lemma.name() != word:
                continue
            for other in lemma.derivationally_related_forms() + lemma.pertainyms():
                name = other.name()
                if name != word and WORD_RE.match(name):
                    linked.add(name)
    return linked


class UnionFind:
    def __init__(self):
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def percentile_ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    for position, i in enumerate(order):
        ranks[i] = position / max(1, len(values) - 1)
    return ranks


def main() -> None:
    wn = wordnet()
    irregular = reverse_exceptions(wn)
    curated_raw = read_curated()

    # 1. Every single-word, lower-case WordNet lemma with at least one teachable sense.
    words: dict[str, Word] = {}
    for pos in "nvar":
        for name in wn.all_lemma_names(pos):
            if name in words or not WORD_RE.match(name) or len(name) < 3:
                continue
            senses = collect_senses(wn, name, editorial=name in curated_raw)
            if senses:
                poses = {s.pos for s in senses}
                words[name] = Word(name, senses, inflections(wn, name, poses, irregular))
    for name, (pos, gloss) in EXTRA_WORDS.items():
        if name not in words:
            words[name] = Word(name, [], {name}, extra=True)
        words[name].senses.insert(0, Sense(pos, gloss, "extra", [], [], False, 1.0, 99.0))
        words[name].extra = True
    print(f"{len(words)} lemmas with teachable senses")

    # 2. Frequencies: general (wordfreq), formal written (Wikipedia), spoken (subtitles).
    all_forms = set().union(*(w.forms for w in words.values()))
    wiki, wiki_total = read_counts(RAW / "enwiki-2023-04-13.txt", all_forms)
    subs, subs_total = read_counts(RAW / "opensubtitles-en_full.txt", all_forms)
    for w in words.values():
        w.zipf = family_zipf(w.forms)
        wiki_pm = per_million(sum(wiki.get(f, 0) for f in w.forms), wiki_total)
        subs_pm = per_million(sum(subs.get(f, 0) for f in w.forms), subs_total)
        w.register = log_ratio(wiki_pm, subs_pm)
        w.abstract = max(s.weight for s in w.senses)

    # 3. The editorial list (curated.txt). British spellings missing from WordNet map to
    # the American lemma ("sceptical" to "skeptical").
    curated: dict[str, str] = {}
    missing = []
    for word, tag in curated_raw.items():
        pair = spelling_pair(word)
        variant = pair and (pair["us"] if pair["uk"] == word else pair["uk"])
        base = next((b for pos in "vna" for b in wn._morphy(word, pos) if b != word and b in words), None)
        found = word if word in words else variant if variant in words else base
        if found:
            curated.setdefault(found, tag)
        else:
            missing.append(word)
    for word, tag in curated.items():
        words[word].tag = tag
    print(f"editorial list: {len(curated)} words found; not in WordNet: {' '.join(missing) or 'none'}")

    # 4. Drop see-through derivatives of common words; group word families.
    see_through = {
        name: base
        for name in words
        if name not in curated and (base := see_through_base(wn, name, words))
    }
    for name, base in see_through.items():
        words[base].family.add(name)
    heads = {name: w for name, w in words.items() if name not in see_through and w.zipf > 0}
    families = UnionFind()
    for name in heads:
        # British and American spellings are one word.
        if (pair := spelling_pair(name)) and (other := pair["uk"] if pair["us"] == name else pair["us"]) in heads:
            families.union(name, other)
        for other in derivational_links(wn, name):
            if other in heads and shares_stem(name, other):
                families.union(name, other)
                heads[name].related.add(other)

    # 5. Headword frequency ranks and bands (by family-level frequency).
    by_freq = sorted(heads.values(), key=lambda w: (-w.zipf, w.word))
    for rank, w in enumerate(by_freq, start=1):
        w.rank = rank
    lo, hi = BAND_RANKS
    hi = min(hi, len(by_freq))
    edges = [round(lo * (hi / lo) ** (i / BAND_COUNT)) for i in range(BAND_COUNT + 1)]
    bands = []
    for b in range(BAND_COUNT):
        members = [w for w in by_freq if edges[b] <= w.rank < edges[b + 1]]
        for w in members:
            w.band = b + 1
        bands.append(
            {
                "band": b + 1,
                "rankFrom": edges[b],
                "rankTo": edges[b + 1] - 1,
                "size": len(members),
                "zipfFrom": round(members[-1].zipf, 2),
                "zipfTo": round(members[0].zipf, 2),
            }
        )

    # 6. Academic score and priority. Editorial words come first; a model trained on them
    # ranks the other frontier words by how much they look like editorial words.
    pool = [
        w for w in heads.values()
        if w.word in curated
        or (FRONTIER_ZIPF[0] <= w.zipf <= FRONTIER_ZIPF[1] and len(w.word) >= 4 and w.abstract >= MIN_ABSTRACT)
    ]  # fmt: skip
    learned = percentile_ranks(learned_scores(pool, set(curated)))
    usefulness = percentile_ranks([w.zipf for w in pool])
    for w, academic, useful in zip(pool, learned, usefulness):
        if w.word in curated:
            # Mid-frontier words first: very common ones are probably known already.
            sweet = 1 - min(1.0, abs(w.zipf - 3.0) / 1.5)
            w.academic = 1.0
            w.priority = 1.0 + 0.5 * sweet
        else:
            w.academic = academic
            w.priority = 0.85 * academic + 0.15 * useful

    # One headword per family: an editorial word if there is one, else the best priority.
    groups: dict[str, list[Word]] = defaultdict(list)
    for w in pool:
        groups[families.find(w.word)].append(w)
    chosen: list[Word] = []
    for members in groups.values():
        # Prefer an editorial word, then the shortest (usually the base: "corroborate"
        # over "corroboration"), then the best priority.
        members.sort(key=lambda w: (w.word not in curated, len(w.word), -w.zipf, w.word))
        head = members[0]
        for other in members[1:]:
            head.family |= {other.word} | other.family
        head.family |= {r for r in head.related if r in heads and r != head.word}
        chosen.append(head)
    chosen.sort(key=lambda w: (-w.priority, w.word))
    editorial = [w for w in chosen if w.word in curated]
    automatic = [w for w in chosen if w.word not in curated]
    candidates = editorial + automatic[: max(0, TARGET_WORDS - len(editorial))]

    ipa_uk = read_ipa(RAW / "ipa-en_UK.txt")
    ipa_us = read_ipa(RAW / "ipa-en_US.txt")
    sources = json.loads((RAW / "SOURCES.json").read_text())
    provenance = {
        k: {"what": v["what"], "licence": v["licence"], "url": v["url"], "sha256": v["sha256"]}
        for k, v in sources.items()
    }
    provenance["wordfreq"] = {
        "what": "General English word frequencies (wordfreq 3.1.1, 'large' list)",
        "licence": "Apache 2.0 (code), CC BY-SA 4.0 (data)",
    }

    def sense_json(s: Sense) -> dict:
        out = {"pos": s.pos, "gloss": s.gloss}
        if s.examples:
            out["example"] = s.examples[0]
        if s.synonyms:
            out["synonyms"] = s.synonyms
        out["kind"] = s.lexname
        return out

    write_lines(
        CONTENT / "candidates.json",
        header={
            "about": "Academic-frontier words, best first. Built by scripts/wordbank/build.py.",
            "sources": provenance,
            "frontierZipf": list(FRONTIER_ZIPF),
        },
        key="candidates",
        rows=[
            {
                "word": w.word,
                "priority": round(w.priority, 3),
                "academic": round(w.academic, 3),
                "zipf": round(w.zipf, 2),
                "band": w.band,
                "source": "editorial" if w.word in curated else "learned",
                **({"tag": w.tag} if w.tag else {}),
                **({"spellings": pair} if (pair := spelling_pair(w.word)) else {}),
                **({"ipa": {k: v for k, v in (("uk", ipa_uk.get(w.word)), ("us", ipa_us.get(w.word))) if v}} if w.word in ipa_uk or w.word in ipa_us else {}),
                **({"family": sorted(w.family)} if w.family else {}),
                "senses": [sense_json(s) for s in w.senses[:SENSES_PER_WORD]],
            }
            for w in candidates
        ],
    )
    sense_total = sum(min(len(w.senses), SENSES_PER_WORD) for w in candidates)
    print(
        f"candidates: {len(candidates)} words ({len(editorial)} editorial, "
        f"{len(candidates) - len(editorial)} learned), {sense_total} senses"
    )

    # 7. Placement test pool: ordinary dictionary words a fair test can ask about.
    # Each needs a definition that does not contain the word itself ("assayer: one who
    # assays..."), or the meaning check would test spelling instead of knowledge. The
    # first sense's definition is used if it is clean, otherwise the first clean one of
    # another sense; words with none are left out. src/lib/placement/placement.ts applies
    # the same rule (givesAway) as a safety net.
    def gives_away(word: str, gloss: str) -> bool:
        stem = word[: max(4, len(word) - 3)]
        for t in re.findall(r"[a-z]+", gloss.lower()):
            if t.startswith(stem):
                return True  # the word or a form of it: "assays" for assayer
            part = t[:-1] if t.endswith("s") and len(t) > 4 else t
            if len(part) >= 4 and (word.startswith(part) or word.endswith(part)):
                return True  # part of a compound: "horse" for warhorse, "pipes" for panpipe
            if len(t) >= 5 and len(word) >= 5 and t[:5] == word[:5]:
                return True  # a close relative: "political" for politburo
        return False

    def tidy(gloss: str) -> str:
        # WordNet sometimes ends a definition with a quotation's author: "...; - Samuel Butler".
        gloss = re.sub(r"[;\s]*-\s+[A-Z][\w.' ]*$", "", gloss)
        return re.sub(r"(\s*;)+\s*$", "", re.sub(r";\s*;", ";", gloss)).strip()

    def test_sense(w: Word) -> Sense | None:
        return next(
            (
                s for s in w.senses
                if not s.technical and len(s.gloss) <= 90 and not gives_away(w.word, s.gloss)
            ),
            None,
        )  # fmt: skip

    rng = random.Random(2026)
    placement_words = []
    for band in bands:
        pool = [
            w for w in by_freq
            if w.band == band["band"] and not w.extra and 5 <= len(w.word) <= 14
            and (w.word in ipa_uk or w.word in ipa_us)
            and not w.senses[0].technical and test_sense(w) is not None
            and w.senses[0].lexname not in PLACEMENT_SKIP_KINDS
            and not SENSITIVE_GLOSS.search(" ".join(s.gloss for s in w.senses))
        ]  # fmt: skip
        for w in sorted(rng.sample(pool, min(PLACEMENT_PER_BAND, len(pool))), key=lambda w: w.rank):
            sense = test_sense(w)
            assert sense is not None
            placement_words.append({"word": w.word, "band": w.band, "pos": sense.pos, "gloss": tidy(sense.gloss)})

    def is_real(s: str) -> bool:
        return (
            s in words
            or wordfreq.zipf_frequency(s, "en", wordlist="large") > 0
            or bool(wn.synsets(s))
            or s in ipa_uk
            or s in ipa_us
        )

    ordinary = [w.word for w in by_freq[:15000] if w.word in ipa_uk and 4 <= len(w.word) <= 12]
    fakes = make_pseudowords(ordinary, is_real, FAKE_WORDS, vocabulary=list(words))
    write_lines(
        CONTENT / "placement.json",
        header={
            "about": "Placement test pool (PLAN 3.1). Built by scripts/wordbank/build.py.",
            "bands": bands,
            "fakes": fakes,
        },
        key="words",
        rows=placement_words,
    )
    print(f"placement: {len(placement_words)} real words in {len(bands)} bands, {len(fakes)} fakes")

    # 8. Compact dictionary for captured words.
    dictionary: dict[str, dict] = defaultdict(dict)
    for w in sorted(words.values(), key=lambda w: w.word):
        if w.zipf < DICTIONARY_MIN_ZIPF:
            continue
        entry = [[s.pos, s.gloss] for s in w.senses[:DICTIONARY_SENSES]]
        dictionary[w.word[0]][w.word] = entry
    out_dir = CONTENT / "dictionary"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.json"):
        old.unlink()
    total = 0
    for letter, entries in sorted(dictionary.items()):
        path = out_dir / f"{letter}.json"
        path.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
        total += path.stat().st_size
    print(f"dictionary: {sum(len(e) for e in dictionary.values())} words, {total // 1024} KB")


def write_lines(path: Path, header: dict, key: str, rows: list[dict]) -> None:
    """JSON with one row per line, so changes show up as small diffs."""
    head = json.dumps(header, ensure_ascii=False, indent=2)
    body = ",\n".join("    " + json.dumps(r, ensure_ascii=False) for r in rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{head[:-2]},\n  \"{key}\": [\n{body}\n  ]\n}}\n")


if __name__ == "__main__":
    main()
