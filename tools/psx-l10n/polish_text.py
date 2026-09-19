#!/usr/bin/env python3
"""Polish non-dialogue G2 text and fill real text rows from tr_data_todo.tsv."""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import polish_dialogue as dialogue


HERE = Path(__file__).resolve().parent
DEFAULT_TSV = HERE / "ex" / "tr_data.tsv"
DEFAULT_MAP = HERE / "ex" / "koremap.tsv"
JP_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
KANA_RE = re.compile(r"[\u3040-\u30ff]")
BAD_RE = re.compile(r"[=^{}]|\?{2,}|[A-Za-z0-9][A-Za-z0-9_^=]{5,}")


def is_dialogue(text):
    return text.startswith("/5") and "/1" in text


def looks_like_real_todo(text, room):
    if is_dialogue(text) or BAD_RE.search(text) or room < 7:
        return False
    if text in {"いいえ", "にゃ～"}:
        return True
    if "/n" in text or any(mark in text for mark in "。！？「」・・・"):
        return True
    if re.search(r"(せよ|村|町|港)$", text):
        return True
    return len(KANA_RE.findall(text)) >= 3 and len(text) >= 8


def classify(text):
    if re.search(r"(せよ|解けた)$", text):
        return "전투 목표/시스템 알림"
    if int(bool(re.search(r"(剣|斧|槍|弓|盾|杖|武器|指輪|魔石|王冠)", text))):
        return "장비 설명"
    if re.search(r"(基本形|職業|スキル|能力|成長速度)", text):
        return "직업 설명"
    if len(text) <= 12 and not any(mark in text for mark in "。！？"):
        return "짧은 명칭/메시지"
    return "NPC/설명문"


def make_messages(batch, compact=False):
    records = []
    for index, item in enumerate(batch):
        records.append({
            "id": index,
            "type": classify(item["text"]),
            "ja": item["text"],
            "draft": item["row"].get("ko", ""),
            "byte_limit": int(item["row"]["max"]),
            "line_breaks": item["text"].count("/n"),
        })
    length = "뜻을 보존하는 가장 짧은 표현을 써라." if compact else "짧고 정확하게 쓰고 byte_limit을 반드시 지켜라."
    system = f"""너는 한국 고전 SRPG '창세기전 2'의 전문 현지화 작가다.
일본어 원문을 직접 번역한다. draft는 오류가 많은 초벌이므로 반드시 원문과 대조하고 띄어쓰기도 바로잡는다.
{length}
직업과 장비 설명은 간결한 사전식 문장, NPC 문장은 자연스러운 구어체, 전투 목표는 명확한 명령형으로 쓴다.
고유명사 표준: {dialogue.GLOSSARY}
/n의 개수는 원문과 똑같이 유지한다. 다른 제어코드는 만들지 않는다.
말줄임표는 ...으로 쓰고 일본어 문자, 설명, 마크다운을 출력하지 않는다.
반드시 {{"items":[{{"id":0,"text":"..."}}]}} 형태의 JSON 하나만 출력한다."""
    user = json.dumps(records, ensure_ascii=False)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def validate(item, text, fwd, koremap):
    if not isinstance(text, str) or not text.strip():
        return "empty"
    text = text.strip()
    for old, new in {"…": "...", "・": ".", "“": '"', "”": '"', "‘": "'", "’": "'",
                     "—": "-", "–": "-", "。": ".", "！": "!", "？": "?", "、": ","}.items():
        text = text.replace(old, new)
    text = re.sub(r"[ \t]+", " ", text)
    if JP_RE.search(text) or re.search(r"\[\[|\]\]|```|<[^>]+>", text):
        return "foreign text or markup"
    if dialogue.controls(text) != dialogue.controls(item["text"]):
        return "control mismatch"
    size, missing = dialogue.encoded(text, fwd, koremap)
    if missing:
        return "unmapped"
    if size > int(item["row"]["max"]):
        return f"{size}>{item['row']['max']}"
    item["accepted"] = text
    return None


def model_call(url, model, messages, timeout):
    payload = json.dumps({
        "model": model, "messages": messages, "temperature": 0.35,
        "top_p": 0.8, "top_k": 20, "presence_penalty": 0.2,
        "max_tokens": 1800, "response_format": {"type": "json_object"},
        "chat_template_kwargs": {"enable_thinking": False},
    }, ensure_ascii=False).encode()
    import urllib.request
    request = urllib.request.Request(url.rstrip("/") + "/v1/chat/completions", data=payload,
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    content = result["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content)
    return json.loads(content)["items"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv", type=Path, nargs="?", default=DEFAULT_TSV)
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--url", default="http://127.0.0.1:8081")
    parser.add_argument("--model", default="qwen3.5-9b")
    parser.add_argument("--mode", choices=("todo", "filled"), default="todo")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    sys.path.insert(0, str(HERE))
    import koremap
    fwd, _, _ = koremap.load_map(args.map)
    with args.tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        fields, rows = reader.fieldnames, list(reader)

    entries = []
    for index, row in enumerate(rows):
        text = row.get("text", "")
        if is_dialogue(text):
            continue
        if args.mode == "todo":
            selected = not row.get("ko", "").strip() and looks_like_real_todo(text, int(row["max"]))
        else:
            selected = bool(row.get("ko", "").strip()) and (len(text) >= 8 or "/n" in text or any(x in text for x in "。！？"))
        if selected:
            entries.append({"index": index, "row": row, "text": text})

    cache_path = args.tsv.with_suffix(f".{args.mode}-polish-cache.json")
    cache = dialogue.load_cache(cache_path)
    accepted = failed = calls = 0
    for start in range(0, len(entries), args.batch_size):
        batch = entries[start:start + args.batch_size]
        pending = []
        for item in batch:
            key = "text-v1\u241f" + item["text"] + "\u241f" + item["row"]["max"]
            item["key"] = key
            cached = cache.get(key)
            if not cached or validate(item, cached, fwd, koremap):
                pending.append(item)
        if pending:
            if args.limit and calls >= args.limit:
                break
            calls += 1
            try:
                output = model_call(args.url, args.model, make_messages(pending), args.timeout)
                values = {x.get("id"): x.get("text") for x in output if isinstance(x, dict)}
                retry = []
                for i, item in enumerate(pending):
                    if validate(item, values.get(i), fwd, koremap):
                        retry.append(item)
                    else:
                        cache[item["key"]] = item["accepted"]
                if retry:
                    output = model_call(args.url, args.model, make_messages(retry, compact=True), args.timeout)
                    values = {x.get("id"): x.get("text") for x in output if isinstance(x, dict)}
                    for i, item in enumerate(retry):
                        if not validate(item, values.get(i), fwd, koremap):
                            cache[item["key"]] = item["accepted"]
                dialogue.save_cache(cache_path, cache)
            except Exception as exc:
                print(f"batch {start // args.batch_size + 1}: {exc}", file=sys.stderr)
        for item in batch:
            value = item.get("accepted") or cache.get(item["key"])
            if value:
                rows[item["index"]]["ko"] = value
                accepted += 1
            else:
                failed += 1
        print(f"batch {start // args.batch_size + 1}: accepted {accepted}, failed {failed}, calls {calls}", flush=True)

    temp = args.tsv.with_suffix(args.tsv.suffix + ".tmp")
    with temp.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", lineterminator="\n")
        writer.writeheader(); writer.writerows(rows)
    temp.replace(args.tsv)
    print(f"wrote {args.tsv}: selected {len(entries)}, accepted {accepted}, failed {failed}")


if __name__ == "__main__":
    main()
