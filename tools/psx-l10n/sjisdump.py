#!/usr/bin/env python3
"""
sjisdump - Shift-JIS 문자열 덤프 및 분포 지도

아카이브 안에서 일본어 문자열을 오프셋과 함께 뽑아낸다. 각 문자열이
무슨 바이트로 끝나는지(종결 바이트)도 같이 기록해서, 게임이 쓰는
제어 코드(줄바꿈·화자·종료)를 역추적할 수 있게 한다.

사용법:
    python3 sjisdump.py map   <파일>                 # 어느 구간에 몰려 있나
    python3 sjisdump.py dump  <파일> [-o out.tsv]    # 문자열 전부 덤프
    python3 sjisdump.py peek  <파일> <오프셋(hex)> [--len N]   # 특정 위치 바이트 보기
"""

import argparse
import os
import struct
import sys
from collections import Counter

BUCKET = 64 << 10   # map 단위: 64KB


def is_lead(b):
    return 0x81 <= b <= 0x9F or 0xE0 <= b <= 0xFC


def is_trail(b):
    return 0x40 <= b <= 0xFC and b != 0x7F


def is_kana(b0, b1):
    return (b0 == 0x82 and 0x9F <= b1 <= 0xF1) or (b0 == 0x83 and 0x40 <= b1 <= 0x96)


def scan_strings(data, min_jp=3, allow_ascii=True, max_gap_ascii=8):
    """유효한 Shift-JIS 문자열 덩어리를 찾는다.

    반환: (offset, nbytes, n_double, n_kana, text) 리스트
    """
    out = []
    n = len(data)
    i = 0
    while i < n:
        b = data[i]
        # 시작은 반드시 2바이트 문자로. ASCII 시작은 노이즈가 너무 많다.
        if not (is_lead(b) and i + 1 < n and is_trail(data[i + 1])):
            i += 1
            continue
        start = i
        dbl = kana = 0
        ascii_run = 0
        last_good = i
        while i < n:
            b = data[i]
            if is_lead(b) and i + 1 < n and is_trail(data[i + 1]):
                if is_kana(b, data[i + 1]):
                    kana += 1
                dbl += 1
                i += 2
                last_good = i
                ascii_run = 0
                continue
            if allow_ascii and 0x20 <= b <= 0x7E:
                ascii_run += 1
                if ascii_run > max_gap_ascii:
                    break          # ASCII가 너무 길면 다른 데이터
                i += 1
                continue
            break
        end = last_good
        # ASCII로 끝나는 꼬리는 잘라낸다(뒤에 문자열이 없으면 노이즈일 확률 큼)
        if dbl >= min_jp:
            raw = data[start:end]
            try:
                text = raw.decode("cp932")
            except UnicodeDecodeError:
                i = start + 2
                continue
            out.append((start, end - start, dbl, kana, text))
        if i <= start:
            i = start + 2
    return out


def plausible(dbl, kana):
    """가나가 하나도 없는 한자 나열은 대개 노이즈. 짧을수록 엄격하게."""
    if dbl >= 12:
        return kana >= 1
    return kana >= max(1, dbl // 4)


def read_file(path, limit=None):
    with open(path, "rb") as f:
        return f.read(limit) if limit else f.read()


# ---------------------------------------------------------------- 명령어

def cmd_map(args):
    data = read_file(args.file)
    strings = [s for s in scan_strings(data, args.min_jp) if plausible(s[2], s[3])]
    size = len(data)
    print(f"파일 : {args.file}  ({size:,} bytes)")
    print(f"문자열 : {len(strings):,}개, 총 {sum(s[2] for s in strings):,}자")
    print()

    buckets = Counter()
    chars = Counter()
    for off, nb, dbl, kana, text in strings:
        buckets[off // BUCKET] += 1
        chars[off // BUCKET] += dbl

    if not buckets:
        print("일본어 문자열이 없습니다.")
        return

    print(f"{'구간(64KB)':>14}  {'오프셋':>12}  {'문자열':>7}  {'글자':>8}   밀도")
    print("-" * 64)
    # 연속된 구간을 묶어서 '영역'으로 보여준다
    keys = sorted(buckets)
    regions = []
    cur = [keys[0], keys[0]]
    for k in keys[1:]:
        if k == cur[1] + 1:
            cur[1] = k
        else:
            regions.append(tuple(cur))
            cur = [k, k]
    regions.append(tuple(cur))

    for a, b in regions:
        n_str = sum(buckets[k] for k in range(a, b + 1))
        n_chr = sum(chars[k] for k in range(a, b + 1))
        span = (b - a + 1) * BUCKET
        bar = "#" * min(40, int(n_chr / span * 400))
        print(f"{a:>6}~{b:<6}  0x{a * BUCKET:08X}  {n_str:>7,}  {n_chr:>8,}   {bar}")
    print()
    print("밀도 막대가 긴 영역이 대사 구역입니다. 그 오프셋을 dump 나 peek 에 쓰세요.")


def cmd_dump(args):
    data = read_file(args.file)
    strings = scan_strings(data, args.min_jp)
    if not args.all:
        strings = [s for s in strings if plausible(s[2], s[3])]

    out = open(args.output, "w", encoding="utf-8") if args.output else sys.stdout
    terms = Counter()
    prev_end = None
    out.write("offset\tbytes\tchars\tgap\tterm\ttext\n")
    for off, nb, dbl, kana, text in strings:
        term = data[off + nb: off + nb + 4]
        terms[term[:1].hex() if term else "eof"] += 1
        gap = "" if prev_end is None else str(off - prev_end)
        prev_end = off + nb
        out.write(f"0x{off:08X}\t{nb}\t{dbl}\t{gap}\t{term.hex()}\t{text}\n")
    if args.output:
        out.close()
        print(f"{len(strings):,}개 문자열을 {args.output} 에 저장했습니다.")

    print()
    print("종결 바이트 상위 10개 (문자열 바로 다음 바이트 — 제어 코드 후보)")
    for b, c in terms.most_common(10):
        print(f"  {b:>4}  {c:>7,}")
    print()
    print("gap 열은 이전 문자열 끝에서 이 문자열 시작까지의 바이트 수입니다.")
    print("일정한 값이 반복되면 고정 길이 레코드, 0이면 연속 문자열입니다.")


def cmd_peek(args):
    off = int(args.offset, 16) if args.offset.lower().startswith("0x") else int(args.offset, 0)
    with open(args.file, "rb") as f:
        f.seek(max(0, off - args.before))
        data = f.read(args.before + args.len)
    base = max(0, off - args.before)
    for row in range(0, len(data), 16):
        chunk = data[row: row + 16]
        hexs = " ".join(f"{b:02X}" for b in chunk)
        mark = ">" if base + row <= off < base + row + 16 else " "
        try:
            txt = chunk.decode("cp932", errors="replace")
        except Exception:
            txt = ""
        txt = "".join(ch if ch.isprintable() else "." for ch in txt)
        print(f"{mark}{base + row:08X}  {hexs:<48}  {txt}")


def main():
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError, ImportError):
        pass

    ap = argparse.ArgumentParser(description="Shift-JIS 문자열 덤프")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("map", help="문자열이 몰린 영역 지도")
    p.add_argument("file")
    p.add_argument("--min-jp", type=int, default=3, help="최소 2바이트 문자 수 (기본 3)")
    p.set_defaults(func=cmd_map)

    p = sub.add_parser("dump", help="문자열 전부를 TSV로")
    p.add_argument("file")
    p.add_argument("-o", "--output", help="저장 경로 (없으면 화면 출력)")
    p.add_argument("--min-jp", type=int, default=3)
    p.add_argument("--all", action="store_true", help="노이즈 필터 없이 전부")
    p.set_defaults(func=cmd_dump)

    p = sub.add_parser("peek", help="특정 오프셋의 바이트를 16진수+문자로")
    p.add_argument("file")
    p.add_argument("offset", help="예: 0x75874C")
    p.add_argument("--len", type=int, default=256)
    p.add_argument("--before", type=int, default=64, help="앞쪽도 같이 볼 바이트 수")
    p.set_defaults(func=cmd_peek)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
