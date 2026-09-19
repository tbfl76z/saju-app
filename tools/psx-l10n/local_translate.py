#!/usr/bin/env python3
"""Translate G2 TSV text locally with lightweight Argos CTranslate2 models.

The installed Argos packages do not include a direct Japanese-to-Korean model,
so this tool translates Japanese -> English -> Korean. Game control codes and
reviewed glossary terms are protected during translation.
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path


DEFAULT_RUNTIME = Path("/home/tbfl76/.local/share/psx-l10n-translate")
DEFAULT_MODELS = Path("/home/tbfl76/.local/share/argos-translate/packages")
DEFAULT_NLLB = Path("/home/tbfl76/.local/share/psx-l10n-nllb")
CONTROL_RE = re.compile(r"(/(?:[0-9]+|[A-Za-z]))")
JP_RE = re.compile(r"[\u3041-\u30ff\u3400-\u9fff]")
KANA_RE = re.compile(r"[\u3041-\u30ff]")
BUILTIN_GLOSSARY = {
    "イオリーン・ペンドラゴン": "이올린 팬드래건",
    "ペンドラゴン": "팬드래건",
    "ぺンドラゴン": "팬드래건",
    "ゲイシル": "게이시르",
    "カシュミル": "카슈미르",
    "ビフロスト": "비프로스트",
    "カーティス": "커티스",
    "ダガル": "다갈",
    "クリップス": "크리프",
    "氷竜城": "빙룡성",
    "暗黒城": "암흑성",
    "アスタニア": "아스타니아",
    "ガラド": "가라드",
    "トリシス": "트리시스",
    "栄光のセップター": "영광의 홀",
    "魔装機": "마장기",
    "黒騎士": "흑기사",
    "ウォーリア": "워리어",
    "モンク": "몽크",
    "ゴルド": "골드",
    "国宝": "국보",
}


def load_engine(runtime, models, name):
    sys.path.insert(0, str(runtime))
    import ctranslate2
    import sentencepiece

    model_dir = models / name
    tokenizer = sentencepiece.SentencePieceProcessor(
        model_file=str(model_dir / "sentencepiece.model")
    )
    translator = ctranslate2.Translator(str(model_dir / "model"), device="cpu")
    return tokenizer, translator


def translate_batch(texts, engine, batch_size):
    tokenizer, translator = engine
    output = []
    for start in range(0, len(texts), batch_size):
        chunk = texts[start : start + batch_size]
        tokens = [tokenizer.encode(text, out_type=str) for text in chunk]
        results = translator.translate_batch(
            tokens,
            beam_size=1,
            max_batch_size=batch_size,
        )
        output.extend(tokenizer.decode(result.hypotheses[0]) for result in results)
    return output


def load_nllb(runtime, model_dir):
    sys.path.insert(0, str(runtime))
    import ctranslate2
    import sentencepiece

    tokenizer = sentencepiece.SentencePieceProcessor(
        model_file=str(model_dir / "sentencepiece.bpe.model")
    )
    translator = ctranslate2.Translator(
        str(model_dir), device="cpu", compute_type="int8"
    )
    return tokenizer, translator


def translate_nllb_batch(texts, engine, batch_size, beam_size):
    tokenizer, translator = engine
    output = []
    for start in range(0, len(texts), batch_size):
        chunk = texts[start : start + batch_size]
        tokens = [
            ["jpn_Jpan"] + tokenizer.encode(text, out_type=str) + ["</s>"]
            for text in chunk
        ]
        prefixes = [["kor_Hang"]] * len(tokens)
        results = translator.translate_batch(
            tokens,
            target_prefix=prefixes,
            beam_size=beam_size,
            max_batch_size=batch_size,
        )
        for result in results:
            decoded = [token for token in result.hypotheses[0] if token != "kor_Hang"]
            output.append(tokenizer.decode(decoded))
    return output


def load_glossary(paths):
    glossary = dict(BUILTIN_GLOSSARY)
    for path in paths:
        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle, delimiter="\t"):
                source = row.get("text", "").strip()
                target = row.get("ko", "").strip()
                if source and target:
                    glossary.setdefault(source, target)
    return glossary


def protect_terms(text, glossary):
    replacements = {}
    index = 0
    for source in sorted(glossary, key=len, reverse=True):
        if len(source) < 2 or source not in text:
            continue
        marker = f"ZXQ{index}"
        text = text.replace(source, marker)
        replacements[marker] = glossary[source]
        index += 1
    return text, replacements


def restore_terms(text, replacements):
    for marker, value in replacements.items():
        text = re.sub(re.escape(marker), value, text, flags=re.IGNORECASE)
    return text


def normalize_korean(text):
    replacements = {
        "…": "...",
        "⋯": "...",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "–": "-",
        "—": "-",
        "・": ".",
        "\u00a0": " ",
        "⁇": "??",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"([^,/]{1,20})(?:\s*,\s*\1){2,}", r"\1", text)
        text = re.sub(r"([가-힣]{1,8})(?:\1){2,}", r"\1", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +([,.!?])", r"\1", text)
    text = re.sub(r"[\u0980-\u0dff]", "?", text)
    return text.strip()


def translatable(row, max_offset, include_all_japanese=False):
    if int(row["offset"], 16) >= max_offset:
        return False
    text = row.get("text", "")
    if include_all_japanese:
        return bool(JP_RE.search(text))
    return bool(CONTROL_RE.search(text) or len(KANA_RE.findall(text)) >= 2)


def encoded_size(text):
    return sum(1 if ord(char) < 128 else 2 for char in text)


def compact_to_fit(text, room):
    if encoded_size(text) <= room:
        return text
    substitutions = (
        ("하지 않았습니다", "않았다"),
        ("할 수 없습니다", "못한다"),
        ("할 수 있습니다", "할 수 있다"),
        ("해야 합니다", "해야 한다"),
        ("하고 있습니다", "한다"),
        ("하지 않습니다", "않는다"),
        ("하였습니다", "했다"),
        ("했습니다", "했다"),
        ("되었습니다", "됐다"),
        ("되었습니다", "됐다"),
        ("것입니다", "것이다"),
        ("것이 아닙니다", "아니다"),
        ("인 것 같습니다", "듯하다"),
        ("있습니다", "있다"),
        ("없습니다", "없다"),
        ("합니다", "한다"),
        ("됩니다", "된다"),
        ("입니다", "이다"),
        ("습니까?", "나?"),
        ("하세요", "해요"),
        ("하십시오", "하라"),
        ("그리고 ", ""),
        ("하지만 ", ""),
        ("그러나 ", ""),
        ("정말 ", ""),
        ("아마 ", ""),
        ("바로 ", ""),
    )
    for old, new in substitutions:
        text = text.replace(old, new)
        if encoded_size(text) <= room:
            return text
    text = text.replace(" ", "")
    if encoded_size(text) > room:
        text = re.sub(r"[.,!?。？！'\"-]", "", text)
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv", type=Path)
    parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--models", type=Path, default=DEFAULT_MODELS)
    parser.add_argument("--nllb", type=Path, default=DEFAULT_NLLB)
    parser.add_argument("--engine", choices=("nllb", "argos"), default="nllb")
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--max-offset", type=lambda value: int(value, 0), default=0x3500000)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--glossary", type=Path, nargs="*", default=[])
    parser.add_argument("--reset-generated", action="store_true")
    parser.add_argument("--include-all-japanese", action="store_true")
    args = parser.parse_args()

    cache_path = args.cache or args.tsv.with_suffix(".translate-cache.json")
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    glossary = load_glossary(args.glossary)

    with args.tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        fieldnames = reader.fieldnames
        rows = list(reader)

    if args.reset_generated:
        for row in rows:
            row["ko"] = glossary.get(row.get("text", ""), "")

    pending = {}
    exact = 0
    for row in rows:
        if row.get("ko") or not translatable(row, args.max_offset, args.include_all_japanese):
            continue
        source = row["text"]
        if source in glossary:
            row["ko"] = glossary[source]
            exact += 1
            continue
        for part in CONTROL_RE.split(source):
            part = part.strip()
            if (part and not CONTROL_RE.fullmatch(part) and JP_RE.search(part)
                    and part not in glossary and part not in cache):
                pending.setdefault(part, None)

    if pending:
        source_parts = list(pending)
        protected, replacements = [], []
        for part in source_parts:
            masked, restore = protect_terms(part, glossary)
            protected.append(masked)
            replacements.append(restore)

        if args.engine == "nllb":
            korean = translate_nllb_batch(
                protected,
                load_nllb(args.runtime, args.nllb),
                args.batch_size,
                args.beam_size,
            )
        else:
            ja_en = load_engine(args.runtime, args.models, "ja_en")
            en_ko = load_engine(args.runtime, args.models, "en_ko")
            english = translate_batch(protected, ja_en, args.batch_size)
            korean = translate_batch(english, en_ko, args.batch_size)
        for source, translated, restore in zip(source_parts, korean, replacements):
            cache[source] = normalize_korean(restore_terms(translated, restore))
        cache_path.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    filled = exact
    over = 0
    for row in rows:
        if row.get("ko") or not translatable(row, args.max_offset, args.include_all_japanese):
            continue
        source = row["text"]
        parts = CONTROL_RE.split(source)
        translated = "".join(
            glossary.get(part.strip(), cache.get(part.strip(), part))
            if not CONTROL_RE.fullmatch(part) else part
            for part in parts
        )
        translated = normalize_korean(translated)
        translated = compact_to_fit(translated, int(row["max"]))
        if encoded_size(translated) > int(row["max"]):
            over += 1
            continue
        row["ko"] = translated
        filled += 1

    with args.tsv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    print(f"translated={filled} over_limit={over} cached_segments={len(cache)}")


if __name__ == "__main__":
    main()
