#!/usr/bin/env python3
"""Audit Korean dialogue register against Japanese and nearby scene context."""

import argparse
import csv
import json
import re
import sys
import urllib.request
from pathlib import Path

import polish_dialogue as dialogue


HERE = Path(__file__).resolve().parent
DEFAULT_TSV = HERE / "ex" / "tr_data.tsv"
DEFAULT_MAP = HERE / "ex" / "koremap.tsv"
DEFAULT_CACHE = HERE / "ex" / "dialogue-register-cache.json"

JP_POLITE = re.compile(
    r"(?:です|ます|ません|ました|でした|でしょう|ください|なさい|ございます|"
    r"致します|願います|ましょう|あります|おります|できます)(?:か)?[。！？?!…\s]*$"
)
JP_CASUAL = re.compile(
    r"(?:だ|だった|である|ない|なかった|する|した|しろ|せよ|ろ|な|ぞ|ぜ|"
    r"のか|んだ|なのだ|だろう|たい|かい|かな)[。！？?!…\s]*$"
)
KO_POLITE = re.compile(
    r"(?:습니다|습니까|십시오|세요|입니다|인가요|군요|네요|해요|돼요|아요|어요|죠|"
    r"옵니다|하오|이오|겠소|했소|시오|드리오|바랍니다|바랍니까|겠습니까|입니까)"
    r"[.!?…\s]*$"
)
KO_CASUAL = re.compile(
    r"(?:한다|했다|이다|였다|된다|됐다|하라|해라|마라|가라|보라|구나|군|네|냐|"
    r"니|지|자|해|돼|어|아|다|겠나|인가|일까|해줘)[.!?…\s]*$"
)


def body_styles(body, polite, casual):
    result = []
    for segment in body.split("/n"):
        segment = segment.strip()
        if not segment:
            continue
        if polite.search(segment):
            result.append("polite")
        elif casual.search(segment):
            result.append("casual")
        else:
            result.append("neutral")
    return result


def is_candidate(source_body, korean_body):
    source = body_styles(source_body, JP_POLITE, JP_CASUAL)
    korean = body_styles(korean_body, KO_POLITE, KO_CASUAL)
    mixed = "polite" in korean and "casual" in korean
    mismatch = any(
        left != right
        for left, right in zip(source, korean)
        if left in {"polite", "casual"} and right in {"polite", "casual"}
    )
    return mixed or mismatch


def call_server(url, model, records, timeout):
    system = f"""너는 한국 고전 SRPG '창세기전 2'의 대사 감수자다.
각 target을 일본어 원문과 앞뒤 scene 문맥으로 검토한다.
목표는 동일한 상대에게 이유 없이 존댓말과 반말이 오가는 오류를 고치는 것이다.
상대, 신분, 친밀도, 장면 시점이 바뀌어 생긴 정상적인 말투 변화는 절대 통일하지 않는다.
비문 낭독, 독백, 인용문처럼 문체가 의도적으로 달라진 경우도 유지한다.
원문의 경어 단계와 화자별 지침을 우선한다. 내용, 호칭, 고유명사를 바꾸거나 새 정보를 넣지 않는다.
현재 번역이 자연스럽고 맥락에 맞으면 change를 null로 둔다.
고쳐야 할 때만 change에 화자 표지를 제외한 한국어 본문 전체를 넣는다. /n 개수는 그대로 유지한다.
말줄임표는 ...으로 쓴다. 고유명사 표준: {dialogue.GLOSSARY}
반드시 {{"items":[{{"id":0,"change":null,"reason":"..."}}]}} JSON 하나만 출력한다."""
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(records, ensure_ascii=False)},
        ],
        "temperature": 0.1,
        "top_p": 0.7,
        "top_k": 20,
        "max_tokens": 800,
        "response_format": {"type": "json_object"},
        "chat_template_kwargs": {"enable_thinking": False},
    }, ensure_ascii=False).encode()
    request = urllib.request.Request(
        url.rstrip("/") + "/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content = json.load(response)["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content)
    return json.loads(content)["items"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv", type=Path, nargs="?", default=DEFAULT_TSV)
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--url", default="http://127.0.0.1:8081")
    parser.add_argument("--model", default="qwen3.5-9b")
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    sys.path.insert(0, str(HERE))
    import koremap

    fwd, _, _ = koremap.load_map(args.map)
    with args.tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        fields, rows = reader.fieldnames, list(reader)

    dialogue_rows = []
    for index, row in enumerate(rows):
        source = dialogue.split_dialogue(row.get("text", ""))
        korean = dialogue.split_dialogue(row.get("ko", ""))
        if source and korean and source[2].strip() and korean[2].strip():
            dialogue_rows.append((index, row, source, korean))

    candidates = []
    for position, (index, row, source, korean) in enumerate(dialogue_rows):
        if not is_candidate(source[2], korean[2]):
            continue
        nearby = []
        for _, context_row, context_source, context_korean in dialogue_rows[max(0, position - 2):position + 3]:
            if abs(int(context_row["offset"], 16) - int(row["offset"], 16)) > 0x700:
                continue
            nearby.append({
                "speaker": context_source[0],
                "ja": context_source[2][:300],
                "ko": context_korean[2][:300],
            })
        prefix_size, _ = dialogue.encoded(korean[1], fwd, koremap)
        candidates.append({
            "index": index,
            "row": row,
            "source": source,
            "korean": korean,
            "room": int(row["max"]) - prefix_size,
            "scene": nearby,
        })

    cache = dialogue.load_cache(args.cache)
    suggestions = []
    calls = 0
    for start in range(0, len(candidates), args.batch_size):
        batch = candidates[start:start + args.batch_size]
        records = []
        pending = []
        for item in batch:
            key = "register-v1\u241f" + item["row"]["offset"] + "\u241f" + item["korean"][2]
            item["key"] = key
            if key in cache:
                continue
            profile = dialogue.VOICE.get(
                item["source"][0],
                "원문의 경어 단계와 장면 속 상대 관계를 따른다.",
            )
            pending.append(item)
            records.append({
                "id": len(records),
                "offset": item["row"]["offset"],
                "speaker": item["source"][0],
                "voice": profile,
                "ja": item["source"][2],
                "ko": item["korean"][2],
                "byte_limit": item["room"],
                "scene": item["scene"],
            })
        if pending:
            if args.limit and calls >= args.limit:
                break
            try:
                output = call_server(args.url, args.model, records, args.timeout)
            except (OSError, ValueError, KeyError) as exc:
                print(f"batch {start // args.batch_size + 1}: {exc}", file=sys.stderr, flush=True)
                continue
            by_id = {value.get("id"): value for value in output if isinstance(value, dict)}
            for output_id, item in enumerate(pending):
                result = by_id.get(output_id, {})
                cache[item["key"]] = {
                    "change": result.get("change"),
                    "reason": result.get("reason", ""),
                }
            dialogue.save_cache(args.cache, cache)
            calls += 1
        print(f"batch {start // args.batch_size + 1}: {min(start + len(batch), len(candidates))}/{len(candidates)}, calls {calls}", flush=True)

    applied = rejected = unchanged = 0
    for item in candidates:
        result = cache.get(item.get("key", ""))
        if not result:
            continue
        change = result.get("change")
        if not isinstance(change, str) or not change.strip():
            unchanged += 1
            continue
        change = change.strip()
        if change == item["korean"][2].strip():
            unchanged += 1
            continue
        probe = {
            "body": item["source"][2],
            "body_room": item["room"],
        }
        why = dialogue.validate(probe, change, fwd, koremap)
        if why:
            rejected += 1
            continue
        suggestions.append({
            "offset": item["row"]["offset"],
            "speaker": item["source"][0],
            "before": item["korean"][2],
            "after": probe["accepted"],
            "reason": result.get("reason", ""),
        })
        if args.apply:
            rows[item["index"]]["ko"] = item["korean"][1] + probe["accepted"]
            applied += 1

    report = args.tsv.with_suffix(".register-audit.json")
    report.write_text(json.dumps(suggestions, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.apply:
        temp = args.tsv.with_suffix(args.tsv.suffix + ".tmp")
        with temp.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", lineterminator="\n")
            writer.writeheader(); writer.writerows(rows)
        temp.replace(args.tsv)
    print(
        f"candidates {len(candidates)}, suggestions {len(suggestions)}, unchanged {unchanged}, "
        f"rejected {rejected}, applied {applied}, calls {calls} -> {report}"
    )


if __name__ == "__main__":
    main()
