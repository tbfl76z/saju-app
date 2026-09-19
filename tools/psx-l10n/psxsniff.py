#!/usr/bin/env python3
"""
psxsniff - 추출된 파일 분류 및 아카이브 구조 탐지

디스크에서 파일을 뽑고 나면 대부분 확장자가 .BIN, .DAT 같은
무의미한 이름이다. 각 파일이 실제로 무엇인지 판정하고, 자체 포맷
아카이브라면 내부 오프셋 테이블 구조까지 추정한다.

한글화에서 "대사가 어느 파일에 있는가"를 좁히는 단계.

사용법:
    python3 psxsniff.py triage  <디렉터리>
    python3 psxsniff.py archive <파일> [--unpack 출력디렉터리]
"""

import argparse
import math
import os
import struct
import sys

SECTOR = 2048

SIGNATURES = [
    (b"PS-X EXE", "PSX-EXE",   "PS1 실행파일 — ASM 해킹의 대상"),
    (b"\x10\x00\x00\x00", "TIM", "PS1 이미지 — 폰트 후보. timtool.py로 확인"),
    (b"VAGp",     "VAG",       "PS1 음성/효과음"),
    (b"pQES",     "SEQ",       "시퀀스 음악"),
    (b"pBAV",     "VAB",       "악기 뱅크"),
    (b"SShd",     "XA/ADPCM",  "스트리밍 오디오"),
    (b"\x60\x01\x01\x80", "STR", "동영상 스트림"),
]

# 랜덤 바이트에서 우연히 나타날 확률. 실제 텍스트는 이보다 훨씬 높아야 한다.
# EUC-KR 한글: 선행 0xB0~0xC8(25종) × 후행 0xA1~0xFE(94종) / 65536
P_RANDOM_KR = (25 * 94) / 65536
# Shift-JIS 가나: 선행 0x82,0x83(2종) × 후행 0x40~0xFC(188종) / 65536
P_RANDOM_JP = (2 * 188) / 65536
SIGNAL_FACTOR = 6      # 랜덤 기대치의 몇 배 이상이어야 진짜 텍스트로 보는가
MIN_HITS = 50


def entropy(data):
    """바이트 엔트로피. 8.0에 가까우면 압축/암호화된 데이터."""
    if not data:
        return 0.0
    hist = [0] * 256
    for b in data:
        hist[b] += 1
    n = len(data)
    return -sum((c / n) * math.log2(c / n) for c in hist if c)


def text_ratio(data):
    if not data:
        return 0.0
    printable = sum(1 for b in data if 0x20 <= b < 0x7F or b in (0x0A, 0x0D, 0x09))
    return printable / len(data)


def two_byte_stats(data):
    """Shift-JIS 가나와 EUC-KR 한글의 출현 횟수."""
    jp = kr = 0
    i, limit = 0, len(data) - 1
    while i < limit:
        b0, b1 = data[i], data[i + 1]
        if b0 in (0x82, 0x83) and 0x40 <= b1 <= 0xFC and b1 != 0x7F:
            jp += 1
            i += 2
            continue
        if 0xB0 <= b0 <= 0xC8 and 0xA1 <= b1 <= 0xFE:
            kr += 1
            i += 2
            continue
        i += 1
    return jp, kr


def language_signal(data):
    """언어를 판정한다. 랜덤 바이트의 기대 출현율과 비교해 오탐을 거른다.

    단순히 개수만 세면 압축 데이터가 항상 '한국어'로 잡힌다.
    EUC-KR 한글의 바이트 범위가 넓어 랜덤에서도 3.6%나 나오기 때문이다.
    """
    if len(data) < 64:
        return None
    jp, kr = two_byte_stats(data)
    n = len(data)
    jp_score = (jp / n) / P_RANDOM_JP
    kr_score = (kr / n) / P_RANDOM_KR

    if jp >= MIN_HITS and jp_score >= SIGNAL_FACTOR and jp_score > kr_score:
        return ("일본어", jp, kr, jp_score)
    if kr >= MIN_HITS and kr_score >= SIGNAL_FACTOR and kr_score > jp_score:
        return ("한국어", jp, kr, kr_score)
    return None


def _find_tim_module():
    """같은 디렉터리의 timtool을 빌려 쓴다. 없으면 조용히 포기."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import timtool
        return timtool
    except ImportError:
        return None


_TIM = _find_tim_module()


def contains_tim(data):
    """파일 중간에 TIM이 박혀 있는지 확인 (아카이브 안의 폰트 찾기)."""
    if _TIM is None:
        return 0
    return len(_TIM.scan_file(data))


def _consistency(first_offset, header_end):
    """첫 데이터가 헤더 바로 뒤에서 시작하면 그 해석이 맞을 확률이 높다.

    2 = 정확히 일치, 1 = 패딩 범위 내, 0 = 불일치
    """
    if first_offset == header_end:
        return 2
    if header_end <= first_offset < header_end + 16:
        return 1
    # 섹터 정렬된 아카이브
    aligned = ((header_end + SECTOR - 1) // SECTOR) * SECTOR
    if first_offset == aligned:
        return 1
    return 0


def find_offset_table(data):
    """파일 앞부분이 오프셋 테이블인지 추정한다.

    자체 아카이브의 대다수는 파일 선두에 32비트 오프셋 배열을 둔다.
    세 가지 흔한 변형을 검사하고, '첫 데이터가 헤더 바로 뒤에서
    시작하는가'라는 자기일관성 검사로 우열을 가린다.
    """
    size = len(data)
    if size < 16:
        return None

    def read_u32s(start, count):
        if start + count * 4 > size:
            count = (size - start) // 4
        if count <= 0:
            return [], 0
        return list(struct.unpack_from(f"<{count}I", data, start)), count

    vals, _ = read_u32s(0, min(4096, size // 4))
    if not vals:
        return None
    candidates = []

    # 변형 A: 선두부터 바로 오프셋 배열
    run = 0
    while run + 1 < len(vals) and 0 < vals[run] < vals[run + 1] <= size:
        run += 1
    count = run + 1
    if count >= 4:
        conf = _consistency(vals[0], count * 4)
        candidates.append({
            "kind": "직접 오프셋 배열", "table_off": 0, "count": count,
            "offsets": vals[:count], "unit": 1, "conf": conf,
        })

    # 변형 B: 선두 u32가 엔트리 개수, 그 뒤부터 오프셋 배열
    n = vals[0]
    if 2 <= n <= 20000 and (n + 1) * 4 <= size:
        sub, got = read_u32s(4, n)
        if got == n and all(sub[i] < sub[i + 1] for i in range(n - 1)) \
           and sub[0] > 0 and sub[-1] <= size:
            conf = _consistency(sub[0], 4 + n * 4)
            candidates.append({
                "kind": "개수 + 오프셋 배열", "table_off": 4, "count": n,
                "offsets": sub, "unit": 1, "conf": conf,
            })

    # 변형 C: 오프셋이 바이트가 아니라 2048바이트 섹터(LBA) 단위
    run = 0
    while run + 1 < len(vals) and vals[run] < vals[run + 1] \
            and vals[run + 1] * SECTOR <= size + SECTOR:
        run += 1
    count = run + 1
    if count >= 4 and vals[run] * SECTOR >= size * 0.5:
        candidates.append({
            "kind": "섹터(2048) 단위 오프셋", "table_off": 0, "count": count,
            "offsets": vals[:count], "unit": SECTOR,
            "conf": _consistency(vals[0] * SECTOR, ((count * 4 + SECTOR - 1) // SECTOR) * SECTOR),
        })

    if not candidates:
        return None
    # 자기일관성이 최우선, 같으면 더 많은 엔트리를 설명하는 쪽
    return max(candidates, key=lambda c: (c["conf"], c["count"]))


def classify(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        sample = f.read(min(size, 1 << 20))
    head = sample[:4096]

    for sig, name, note in SIGNATURES:
        if head.startswith(sig):
            return name, note, size

    ent = entropy(sample)
    lang = language_signal(sample)
    txt = text_ratio(sample)

    if txt > 0.85:
        return "TEXT", "ASCII 텍스트", size
    if lang:
        name, jp, kr, score = lang
        return "TEXT?", f"{name} 문자 다수 (jp={jp} kr={kr}, 랜덤 대비 {score:.0f}배)", size

    n_tim = contains_tim(sample)
    if n_tim:
        return "TIM 포함", f"내부에 TIM {n_tim}개 — 아카이브. timtool.py로 추출", size

    table = find_offset_table(head)
    if table and table["conf"] > 0:
        return "ARCHIVE?", f"{table['kind']} 감지 ({table['count']}개) — archive 명령으로 확인", size
    if ent > 7.8:
        return "COMPRESSED?", f"엔트로피 {ent:.2f} — 압축 또는 이미 패킹된 데이터", size
    if ent < 2.0:
        return "SPARSE", f"엔트로피 {ent:.2f} — 대부분 0, 패딩이거나 빈 파일", size
    if table:
        return "ARCHIVE?", f"{table['kind']} 가능성 (신뢰도 낮음)", size
    return "UNKNOWN", f"엔트로피 {ent:.2f}", size


def cmd_triage(args):
    rows = []
    for root, _, files in os.walk(args.dir):
        for name in sorted(files):
            fp = os.path.join(root, name)
            kind, note, size = classify(fp)
            rows.append((os.path.relpath(fp, args.dir), kind, size, note))

    if not rows:
        print("파일이 없습니다.")
        return

    rows.sort(key=lambda r: (r[1], -r[2]))
    width = max(len(r[0]) for r in rows)
    print(f"{'파일':<{width}}  {'종류':<12} {'크기':>12}  비고")
    print("-" * (width + 50))
    for rel, kind, size, note in rows:
        print(f"{rel:<{width}}  {kind:<12} {size:>12,}  {note}")

    by_kind = {}
    for _, kind, _, _ in rows:
        by_kind[kind] = by_kind.get(kind, 0) + 1
    print()
    print("요약: " + ", ".join(f"{k} {v}개" for k, v in sorted(by_kind.items())))
    print()
    print("다음 순서 권장:")
    print("  1. TEXT? 파일    → 대사 원본일 가능성이 가장 높음")
    print("  2. ARCHIVE? 파일 → psxsniff.py archive 로 구조 확인 후 --unpack")
    print("  3. TIM / TIM 포함 → timtool.py extract 로 폰트 확인")
    print("  4. UNKNOWN 중 큰 파일 → 자체 포맷 아카이브일 가능성")


def cmd_archive(args):
    with open(args.file, "rb") as f:
        data = f.read()
    size = len(data)
    print(f"파일 : {args.file}  ({size:,} bytes)")

    table = find_offset_table(data)
    if not table:
        print("오프셋 테이블을 찾지 못했습니다.")
        print("헤더가 파일 끝에 있거나, 16비트 오프셋이거나, 고정 크기 레코드일 수 있습니다.")
        print("선두 64바이트:")
        print("  " + " ".join(f"{b:02X}" for b in data[:64]))
        return

    conf_label = {2: "높음 (첫 데이터가 헤더 직후에서 정확히 시작)",
                  1: "보통 (정렬/패딩 범위 내)",
                  0: "낮음 (헤더 크기와 첫 오프셋이 맞지 않음)"}[table["conf"]]
    unit = table["unit"]
    offsets = table["offsets"]

    print(f"구조 : {table['kind']}")
    print(f"       테이블 위치 0x{table['table_off']:X}, 엔트리 {table['count']}개"
          + (f", 단위 {unit}바이트" if unit != 1 else ""))
    print(f"신뢰도 : {conf_label}")
    print()
    print(f"{'#':>5}  {'오프셋':>12}  {'추정 크기':>12}")
    print("-" * 36)
    for i, off in enumerate(offsets[:args.limit]):
        start = off * unit
        end = offsets[i + 1] * unit if i + 1 < len(offsets) else size
        print(f"{i:>5}  {start:>12,}  {end - start:>12,}")
    if len(offsets) > args.limit:
        print(f"... 총 {len(offsets)}개 중 {args.limit}개만 표시 (--limit 으로 조정)")

    if args.unpack:
        os.makedirs(args.unpack, exist_ok=True)
        stem = os.path.splitext(os.path.basename(args.file))[0]
        written = 0
        for i, off in enumerate(offsets):
            start = off * unit
            end = offsets[i + 1] * unit if i + 1 < len(offsets) else size
            if not (0 <= start < end <= size):
                continue
            with open(os.path.join(args.unpack, f"{stem}_{i:04d}.bin"), "wb") as out:
                out.write(data[start:end])
            written += 1
        print(f"\n{written}개 조각을 {args.unpack} 에 언팩했습니다.")
        print("언팩 결과에 psxsniff.py triage 를 다시 돌려 내용을 확인하세요.")


def main():
    # head/less 로 파이프할 때 BrokenPipeError 대신 조용히 끝나도록
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError, ImportError):
        pass  # Windows에는 SIGPIPE가 없다

    ap = argparse.ArgumentParser(description="추출된 PS1 파일 분류/아카이브 분석")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("triage", help="디렉터리 안 모든 파일의 정체를 판정")
    p.add_argument("dir")
    p.set_defaults(func=cmd_triage)

    p = sub.add_parser("archive", help="자체 아카이브의 오프셋 테이블 분석/언팩")
    p.add_argument("file")
    p.add_argument("--limit", type=int, default=40)
    p.add_argument("--unpack", metavar="출력디렉터리", help="조각들을 파일로 분리")
    p.set_defaults(func=cmd_archive)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
