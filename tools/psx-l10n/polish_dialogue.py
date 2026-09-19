#!/usr/bin/env python3
"""Polish Japanese G2 dialogue with a local OpenAI-compatible LLM server.

The script keeps game control prefixes outside the model, translates short
scene-sized batches, validates line breaks and the game's encoded byte limit,
and caches every accepted result so an interrupted run can resume safely.
"""

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent
DEFAULT_TSV = HERE / "ex" / "tr_data.tsv"
DEFAULT_MAP = HERE / "ex" / "koremap.tsv"
DEFAULT_CHARS = HERE / "ex" / "tr_chars.tsv"
DEFAULT_CACHE = HERE / "ex" / "dialogue-polish-cache.json"
CACHE_VERSION = "v5"
JP_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")

# These notes define stable voices, not literal sentence endings. Relationships
# and the Japanese register in each scene still take priority.
VOICE = {
    "ＧＳ": "기억을 잃은 자유기사. 침착하고 과묵하며 건조한 반말이 기본. 윗사람에게만 절제된 존대. 허세나 감탄을 보태지 않는다.",
    "イオリーン": "팬드래건 왕녀. 단호하고 품위 있으며 책임감이 강하다. 공식 석상은 격식체, 동료에게는 절제된 해요체나 반말. 감정이 격해져도 비굴하지 않다.",
    "レイシッド": "초반에는 순진하고 다정한 어린 왕자, 성장 뒤에는 결의 있는 성왕. 누나에게 친근한 말투, 연장자에게 존대. 장면 시점의 성장을 반영한다.",
    "スタイナー": "정체와 기억을 잃은 시기의 인물. 진중하고 이성적이며 군인다운 간결한 말투. 과장된 감정 표현을 피한다.",
    "黒騎士": "위압적이고 냉정한 제국 지휘관. 짧고 단정적인 명령조. 고풍스럽되 번역투 문어체는 피한다.",
    "ロカルノ": "다혈질이지만 충성심 강한 기사. 직설적이고 거친 반말, 왕녀에게는 기사다운 존대. 성급한 감정이 드러난다.",
    "デュラン": "노련하고 충직한 성기사단장. 왕녀와 왕자에게 정중한 격식체, 동료에게는 믿음직하고 단호한 말투. 지나치게 현대적인 표현은 피한다.",
    "クロウ": "상처와 죄책감을 품은 방랑 검객. 낮고 무게 있는 반말, 짧고 냉소적이나 라시드에게는 엄한 스승의 온기가 있다.",
    "ストライダー": "능청스럽고 노련한 모험가. 평소 여유 있는 반말, 군주 앞에서는 자연스러운 격식체. 가벼워도 경박하지 않다.",
    "半蔵": "동방의 암살자이자 무인. 과묵하고 절제된 무사 말투. 결투와 충성의 장면은 단호한 문장으로 쓴다.",
    "ベランディ": "냉철하고 지적인 책략가. 감정을 드러내지 않는 격식체와 명령조. 상대를 통제하는 여유가 느껴져야 한다.",
    "カルス": "제국 최강의 검사. 자존심과 충성심이 강한 무인. 상관에게 엄격한 존대, 적에게 간결하고 당당한 반말.",
    "プライオス": "초월적 존재. 장중하고 권위 있는 고풍스러운 말투를 쓰되 뜻은 선명하게 한다.",
    "デイモス": "초월적 존재. 인간을 내려다보는 냉엄하고 장중한 말투. 불필요한 존대는 쓰지 않는다.",
    "モゼル公王": "연륜 있는 군주. 온화하되 권위 있는 하오체와 격식체를 문맥에 맞게 쓴다.",
    "アルシア": "저항군을 이끄는 장군. 실무적이고 담대한 군인 말투. 동맹에게 예의를 지키되 군더더기가 없다.",
    "シュリ": "침착하고 현실적인 동료. 카자에게 친근한 반말, 공식 대화에서는 담백한 존대.",
    "カジャ": "호기심 많고 감정 표현이 솔직한 여성. 생기 있는 구어체를 쓰되 유치하게 만들지 않는다.",
    "カシュタル": "제국의 노장. 예법을 갖춘 군인다운 격식체, 명령은 단호하다.",
    "ヴァインスタイン": "명예를 중시하는 노련한 장수. 호방하면서도 절도 있는 말투.",
    "キシネ": "지식과 신비를 지닌 인물. 차분하고 설명이 명료한 존대와 격식체.",
    "ベラモド": "정체를 쉽게 드러내지 않는 지적 인물. 차갑고 침착하며 함축적인 말투.",
}

GLOSSARY = """ペンドラゴン=팬드래건, ゲイシル=게이시르, ビフロスト=비프로스트,
カーティス=커티스, ダガル=다갈, カシュミル=카슈미르, クリップス=크리프,
氷竜城=빙룡성, 暗黒城=암흑성, アスタニア=아스타니아, ガラド=가라드,
トリシス=트리시스, アンタリア=안타리아, シルバーアロー=실버 애로우,
栄光のセップター=영광의 홀, 魔装機=마장기, 黒騎士=흑기사, 黒太子=흑태자,
聖王=성왕, バリサーダ=바리사다, アシュラ=아수라, アスカロン=아스카론,
イオリーン=이올린, レイシッド=라시드, デュラン=듀란, ロカルノ=로카르노,
ＧＳ=G.S, クロウ=크로우, ベランディ=베라딘, カルス=칼스, 半蔵=한조,
元老院=원로원, 元老=원로, レンジャー=레인저, 硫黄洞窟=유황 동굴,
陛下=폐하, 姫様=공주님, 王子=왕자님""".replace("\n", " ")

REQUIRED_TERMS = {
    "ペンドラゴン": "팬드래건", "ゲイシル": "게이시르", "ビフロスト": "비프로스트",
    "カーティス": "커티스", "ダガル": "다갈", "カシュミル": "카슈미르",
    "クリップス": "크리프", "氷竜城": "빙룡성", "暗黒城": "암흑성",
    "アスタニア": "아스타니아", "ガラド": "가라드", "トリシス": "트리시스",
    "アンタリア": "안타리아", "シルバーアロー": "실버 애로우",
    "栄光のセップター": "영광의 홀", "魔装機": "마장기", "黒騎士": "흑기사",
    "黒太子": "흑태자", "聖王": "성왕", "バリサーダ": "바리사다",
    "アシュラ": "아수라", "アスカロン": "아스카론", "魔神": "마신",
    "元老院": "원로원", "レンジャー": "레인저", "硫黄洞窟": "유황 동굴",
}


def split_dialogue(text):
    if not text.startswith("/5") or "/1" not in text:
        return None
    head, body = text.split("/1", 1)
    speaker = head[2:].removesuffix("/n")
    prefix = head + "/1"
    if body.startswith("/n"):
        prefix += "/n"
        body = body[2:]
    return speaker, prefix, body


def translated_prefix(source_prefix, speaker_ko):
    before_one, after_one = source_prefix.split("/1", 1)
    name_suffix = "/n" if before_one.endswith("/n") else ""
    return "/5" + speaker_ko + name_suffix + "/1" + after_one


def controls(text):
    return Counter(re.findall(r"/(?:n|[0-9]+|[A-Za-z])", text))


def encoded(text, fwd, koremap):
    raw, missing = koremap.encode(text, fwd)
    return len(raw), missing


def scene_batches(entries, size):
    batch = []
    previous = None
    for entry in entries:
        offset = int(entry["row"]["offset"], 16)
        if batch and (len(batch) >= size or offset - previous > 0x500):
            yield batch
            batch = []
        batch.append(entry)
        previous = offset
    if batch:
        yield batch


def make_messages(batch, compact=False):
    profiles = []
    for speaker in dict.fromkeys(item["speaker"] for item in batch):
        note = VOICE.get(speaker, "일본어 원문의 높임말, 신분, 감정과 관계를 정확히 따라 자연스러운 한국어 구어체로 옮긴다.")
        profiles.append(f"- {speaker}: {note}")
    records = []
    for i, item in enumerate(batch):
        records.append({
            "id": i,
            "speaker": item["speaker"],
            "ja": item["body"],
            "draft": item["draft_body"],
            "body_byte_limit": item["body_room"],
            "line_breaks": item["body"].count("/n"),
        })
    length_rule = (
        "초안보다 짧아져도 좋다. 핵심 의미를 보존하며 극도로 간결하게 쓴다."
        if compact else
        "간결한 PS1 RPG 대사로 쓰고 body_byte_limit을 반드시 지킨다."
    )
    system = f"""너는 한국 고전 SRPG '창세기전 2'의 전문 현지화 작가다.
일본어 원문을 직접 이해해 자연스럽고 매끄러운 한국어로 번역한다. draft는 참고만 하고 오역은 바로잡는다.
화자의 성격, 신분, 상대와의 관계, 장면의 감정을 살리되 원문에 없는 정보나 감탄을 만들지 않는다.
원문의 인물, 행동, 요청, 이유, 부정과 긍정을 하나도 생략하거나 뒤집지 않는다.
한국어 번역투와 어색한 직역을 피하고 1990년대 정통 판타지 RPG에 어울리는 간결한 문장을 쓴다.
고유명사 표준: {GLOSSARY}
{length_rule}
각 body의 /n 개수와 위치에 따른 문장 구분을 유지한다. /5, /1은 출력하지 않는다.
말줄임표는 ...으로 쓴다. 일본어 문자를 남기지 않는다.
원문의 주어와 목적어를 바꾸지 않는다. 괄호 속 행동은 자연스러운 한국어 행동 묘사로 옮긴다.
예: （1年ぶりか・・・） -> (1년 만인가...)
예: はぁはぁ、帝国のやつらめ・・・私を殺して口止めするつもりか・・・ -> 헉, 헉... 제국 놈들, 날 죽여 입을 막을 셈인가...
예: ・・・・まさか！ -> ...설마!
예: （コクン） -> (끄덕)
예: ねぇ、あれ何かしら？ -> 저기, 저건 뭘까?
예: ほら、あそこ。 -> 봐, 저기.
예: それって、まさか。 -> 그럼 설마...
예: 陛下、お呼びでございますか。 -> 폐하, 부르셨습니까?
예: はっ！ -> 예!
반드시 {{"items":[{{"id":0,"body":"..."}}]}} 형태의 JSON 하나만 출력한다."""
    user = "화자 지침:\n" + "\n".join(profiles) + "\n\n장면 대사:\n" + json.dumps(records, ensure_ascii=False)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def call_server(url, model, messages, timeout):
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.35,
        "top_p": 0.8,
        "top_k": 20,
        "presence_penalty": 0.2,
        "max_tokens": 1800,
        "response_format": {"type": "json_object"},
        "chat_template_kwargs": {"enable_thinking": False},
    }, ensure_ascii=False).encode()
    request = urllib.request.Request(
        url.rstrip("/") + "/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    content = result["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content)
    return json.loads(content)["items"]


def validate(item, body, fwd, koremap):
    if not isinstance(body, str) or not body.strip():
        return "empty"
    body = body.strip()
    for old, new in {
        "…": "...", "・": ".", "“": '"', "”": '"', "‘": "'", "’": "'",
        "—": "-", "–": "-", "。": ".", "！": "!", "？": "?", "、": ",",
    }.items():
        body = body.replace(old, new)
    body = re.sub(r"[ \t]+", " ", body)
    if JP_RE.search(body):
        return "Japanese remains"
    if re.search(r"\[\[|\]\]|:\[|```|<[^>]+>", body):
        return "markup remains"
    if controls(body) != controls(item["body"]):
        return "control mismatch"
    for source, target in REQUIRED_TERMS.items():
        if source in item["body"] and target not in body:
            return f"required term missing: {source}={target}"
    size, missing = encoded(body, fwd, koremap)
    if missing:
        return "unmapped: " + "".join(sorted(set(missing)))
    if size > item["body_room"]:
        return f"{size}>{item['body_room']} bytes"
    source_size, _ = encoded(item["body"], fwd, koremap)
    if source_size >= 36 and size < source_size * 0.42:
        return f"translation too short: {size}/{source_size}"
    item["accepted"] = body
    return None


def load_cache(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(path, cache):
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tsv", type=Path, nargs="?", default=DEFAULT_TSV)
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--url", default="http://127.0.0.1:8081")
    parser.add_argument("--model", default="qwen2.5-7b-instruct")
    parser.add_argument("--batch-size", type=int, default=6)
    parser.add_argument("--limit", type=int, default=0, help="maximum uncached batches")
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sys.path.insert(0, str(HERE))
    import koremap

    fwd, _, _ = koremap.load_map(args.map)
    with args.tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        fieldnames, rows = reader.fieldnames, list(reader)

    speaker_names = {}
    name_counts = {}
    for row in rows:
        source = split_dialogue(row.get("text", ""))
        target = split_dialogue(row.get("ko", ""))
        if source and target and not JP_RE.search(target[0]):
            name_counts.setdefault(source[0], Counter())[target[0]] += 1
    for source_name, counts in name_counts.items():
        speaker_names[source_name] = counts.most_common(1)[0][0]
    if DEFAULT_CHARS.exists():
        with DEFAULT_CHARS.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle, delimiter="\t"):
                if row.get("text") and row.get("ko"):
                    speaker_names[row["text"]] = row["ko"]
    speaker_names.update({
        "ＧＳ": "G.S", "町の青年": "마을 청년", "町の少女": "마을 소녀",
        "帝国兵士": "제국 병사", "モゼル公王": "모젤 공왕",
    })

    entries = []
    for row_index, row in enumerate(rows):
        parsed = split_dialogue(row["text"])
        if not parsed:
            continue
        speaker, source_prefix, body = parsed
        if not body.strip():
            continue
        draft = split_dialogue(row.get("ko", ""))
        speaker_ko = speaker_names.get(speaker)
        if not speaker_ko and draft and not JP_RE.search(draft[0]):
            speaker_ko = draft[0]
        if not speaker_ko:
            continue
        prefix = translated_prefix(source_prefix, speaker_ko)
        prefix_size, missing = encoded(prefix, fwd, koremap)
        if missing or prefix_size >= int(row["max"]):
            continue
        entries.append({
            "row_index": row_index,
            "row": row,
            "speaker": speaker,
            "prefix": prefix,
            "body": body,
            "draft_body": draft[2] if draft else "",
            "body_room": int(row["max"]) - prefix_size,
        })

    cache = load_cache(args.cache)
    accepted = failed = calls = 0
    for batch_number, batch in enumerate(scene_batches(entries, args.batch_size), 1):
        pending = []
        for item in batch:
            key = CACHE_VERSION + "\u241f" + item["speaker"] + "\u241f" + item["body"] + "\u241f" + str(item["body_room"])
            item["cache_key"] = key
            cached = cache.get(key)
            if cached and validate(item, cached, fwd, koremap) is None:
                continue
            pending.append(item)
        if pending:
            if args.limit and calls >= args.limit:
                break
            if args.dry_run:
                print(json.dumps(make_messages(pending)[1]["content"], ensure_ascii=False, indent=2))
                break
            calls += 1
            try:
                output = call_server(args.url, args.model, make_messages(pending), args.timeout)
                by_id = {value.get("id"): value.get("body") for value in output if isinstance(value, dict)}
                retry = []
                for i, item in enumerate(pending):
                    why = validate(item, by_id.get(i), fwd, koremap)
                    if why:
                        item["error"] = why
                        if isinstance(by_id.get(i), str):
                            item["draft_body"] = by_id[i]
                        retry.append(item)
                    else:
                        cache[item["cache_key"]] = item["accepted"]
                if retry:
                    compact_output = call_server(args.url, args.model, make_messages(retry, compact=True), args.timeout)
                    compact_by_id = {value.get("id"): value.get("body") for value in compact_output if isinstance(value, dict)}
                    for i, item in enumerate(retry):
                        why = validate(item, compact_by_id.get(i), fwd, koremap)
                        if why:
                            item["error"] = why
                        else:
                            cache[item["cache_key"]] = item["accepted"]
                save_cache(args.cache, cache)
            except (OSError, ValueError, KeyError, urllib.error.URLError) as exc:
                print(f"batch {batch_number}: {exc}", file=sys.stderr)
                time.sleep(2)
                continue

        for item in batch:
            body = item.get("accepted") or cache.get(item["cache_key"])
            if body:
                rows[item["row_index"]]["ko"] = item["prefix"] + body
                accepted += 1
            else:
                failed += 1
        if batch_number % 10 == 0 or pending:
            print(f"batch {batch_number}: accepted {accepted}, failed {failed}, calls {calls}", flush=True)

    if not args.dry_run:
        temp = args.tsv.with_suffix(args.tsv.suffix + ".tmp")
        with temp.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter="\t", lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        temp.replace(args.tsv)
        print(f"wrote {args.tsv}: accepted {accepted}, failed {failed}, model calls {calls}")


if __name__ == "__main__":
    main()
