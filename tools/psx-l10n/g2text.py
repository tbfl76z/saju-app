#!/usr/bin/env python3
"""
g2text - 창세기전2 PS1 텍스트 섹션 덤프/재삽입

G2DATA1.DAT 안의 대사는 "텍스트 섹션" 단위로 들어 있다:

    u32 count          레코드 수
    u32 size           offs 배열 선두부터 마지막 레코드 끝까지의 바이트 수 (= 4*count + 레코드 전체)
    u32 offs[count]    각 레코드의 상대 오프셋 (기준 = offs 배열 바로 뒤)
    레코드 × count:
        u32 len        본문 바이트 수 (NUL 제외)
        u8  text[len]  Shift-JIS
        u8  0          NUL, 이후 4바이트 정렬 패딩

섹션 위치는 EXE(SLPS_023.11)의 오프셋 인덱스로 블록을 나눈 뒤 블록 안을 훑어 찾는다.
자기검증(offs 전부 일치 + size 일치)을 통과한 것만 섹션으로 인정하므로 오탐이 없다.

사용법:
    python3 g2text.py sections ex/SLPS_023.11 ex/G2DATA1.DAT
    python3 g2text.py dump     ex/SLPS_023.11 ex/G2DATA1.DAT -o script.tsv
    python3 g2text.py chars    ex/SLPS_023.11 ex/G2DATA1.DAT --out-used used.tsv

의존성 없음.
"""

import argparse
import struct
import sys
from collections import Counter

FILE_SIZE_MAX = 1 << 28


def read_index(exe_path, data_size):
    """EXE 안의 u32 오프셋 인덱스를 읽는다. FF FF FF FF 로 구분된 그룹들."""
    e = open(exe_path, "rb").read()
    start = 0xC1AF8
    p = start
    offs = []
    empties = 0
    while p + 4 <= len(e):
        grp = []
        while p + 4 <= len(e):
            v = struct.unpack_from("<I", e, p)[0]
            p += 4
            if v == 0xFFFFFFFF:
                break
            grp.append(v)
        if not grp:
            empties += 1
            if empties > 8:
                break
            continue
        empties = 0
        if any(v > data_size for v in grp):
            break
        offs.extend(grp)
    return sorted(set(offs))


def parse_section(d, pos, limit):
    """pos 에 텍스트 섹션이 있으면 (size, [(rec_off, text_bytes)]) 를, 아니면 None."""
    if pos + 8 > limit:
        return None
    count, size = struct.unpack_from("<II", d, pos)
    if not (1 <= count <= 20000) or not (4 * count < size <= limit - pos):
        return None
    table = pos + 8
    text0 = table + 4 * count
    if text0 > limit:
        return None
    recs = []
    h = 0
    for k in range(count):
        if struct.unpack_from("<I", d, table + 4 * k)[0] != h:
            return None          # offs 불일치 → 섹션 아님
        rp = text0 + h
        if rp + 4 > limit:
            return None
        ln = struct.unpack_from("<I", d, rp)[0]
        if ln == 0 or ln > 8000 or rp + 4 + ln >= limit:
            return None
        if d[rp + 4 + ln] != 0:
            return None
        recs.append((rp, d[rp + 4: rp + 4 + ln]))
        h += 4 + ((ln + 1 + 3) & ~3)
    if text0 + h != pos + 8 + size:
        return None              # size 불일치 → 섹션 아님
    return 8 + size, recs        # 섹션이 차지하는 전체 바이트


def find_sections(exe_path, data_path):
    d = open(data_path, "rb").read()
    bounds = read_index(exe_path, len(d)) + [len(d)]
    out = []
    for i in range(len(bounds) - 1):
        lo, hi = bounds[i], bounds[i + 1]
        p = lo
        while p + 8 <= hi:
            r = parse_section(d, p, hi)
            if r:
                size, recs = r
                out.append((p, size, recs))
                p += size
            else:
                p += 4
    return d, out


# ---------------------------------------------------------------- 명령

def cmd_sections(a):
    d, secs = find_sections(a.exe, a.data)
    tot = sum(len(r[2]) for r in secs)
    print(f"텍스트 섹션 {len(secs):,}개, 레코드 {tot:,}개")
    print(f"{'섹션 오프셋':>12} {'크기':>9} {'레코드':>7}  첫 줄")
    for off, size, recs in secs[:a.limit]:
        first = recs[0][1].decode("cp932", errors="replace").replace("\n", " ")[:48]
        print(f"0x{off:010X} {size:>9,} {len(recs):>7}  {first}")
    if len(secs) > a.limit:
        print(f"... 총 {len(secs):,}개 중 {a.limit}개만 표시 (--limit)")


def cmd_dump(a):
    d, secs = find_sections(a.exe, a.data)
    out = open(a.output, "w", encoding="utf-8") if a.output else sys.stdout
    out.write("section\trec\toffset\tbytes\ttext\n")
    n = 0
    for off, size, recs in secs:
        for k, (rp, raw) in enumerate(recs):
            txt = raw.decode("cp932", errors="replace").replace("\t", " ")
            out.write(f"0x{off:08X}\t{k}\t0x{rp:08X}\t{len(raw)}\t{txt}\n")
            n += 1
    if a.output:
        out.close()
        print(f"{n:,}개 레코드를 {a.output} 에 저장했습니다.")


def is_lead(b):
    return 0x81 <= b <= 0x9F or 0xE0 <= b <= 0xFC


def is_trail(b):
    return 0x40 <= b <= 0xFC and b != 0x7F


def is_kana(c):
    return 0x829F <= c <= 0x82F1 or 0x8340 <= c <= 0x8396


def nul_strings(buf, min_chars=6, kana_min=0.25):
    """NUL로 끝나고 전체가 유효 Shift-JIS인 문자열만 뽑는다.

    "2바이트 문자로 보이는 바이트쌍"만 세면 그래픽 데이터가 대량 오탐으로 잡힌다
    (JIS 2수준 한자가 1,387개 쓰이는 것처럼 보였다). NUL 종결과 전체 유효성,
    가나 비율을 함께 요구하면 오탐이 거의 사라진다(실제 71개).
    """
    out = []
    n = len(buf)
    i = 0
    while i < n - 1:
        if not (is_lead(buf[i]) and is_trail(buf[i + 1])):
            i += 1
            continue
        j = i
        codes = []
        ok = True
        while j < n:
            b = buf[j]
            if is_lead(b) and j + 1 < n and is_trail(buf[j + 1]):
                codes.append((buf[j] << 8) | buf[j + 1])
                j += 2
                continue
            if b == 0:
                break
            if 0x20 <= b <= 0x7E:
                codes.append(b)
                j += 1
                continue
            ok = False
            break
        if ok and j < n and buf[j] == 0 and len(codes) >= min_chars:
            dbl = sum(1 for c in codes if c > 0xFF)
            kan = sum(1 for c in codes if c > 0xFF and is_kana(c))
            if dbl and kan / dbl >= kana_min:
                out.append((i, codes))
        i = j + 1 if j > i else i + 1
    return out


def census(data_path, exe_path):
    """게임이 실제로 쓰는 문자 빈도. NUL 종결 문자열 + 텍스트 섹션 레코드."""
    cnt = Counter()
    for path in (data_path, exe_path):
        buf = open(path, "rb").read()
        for _, codes in nul_strings(buf):
            cnt.update(codes)
    _, secs = find_sections(exe_path, data_path)
    for _, _, recs in secs:
        for _, raw in recs:
            i = 0
            while i < len(raw):
                if is_lead(raw[i]) and i + 1 < len(raw) and is_trail(raw[i + 1]):
                    cnt[(raw[i] << 8) | raw[i + 1]] += 1
                    i += 2
                else:
                    cnt[raw[i]] += 1
                    i += 1
    return cnt


def cmd_chars(a):
    cnt = census(a.data, a.exe)

    def rng(lo, hi):
        return sorted(c for c in cnt if lo <= c <= hi)

    l1, l2 = rng(0x889F, 0x9872), rng(0x989F, 0xEAA4)
    print(f"고유 문자 {len(cnt):,}개")
    print(f"  1수준 한자 {len(l1):,} / 2,965")
    print(f"  2수준 한자 {len(l2):,} / 3,390   ← 한글 슬롯에서 뺄 대상")
    if l2:
        print("  2수준 사용:", "".join(bytes([c >> 8, c & 0xFF]).decode("cp932", errors="replace") for c in l2))
    if a.out_used:
        with open(a.out_used, "w", encoding="utf-8") as f:
            f.write("code	char	count\n")
            for c in sorted(cnt):
                if c > 0xFF:
                    ch = bytes([c >> 8, c & 0xFF]).decode("cp932", errors="replace")
                    f.write(f"{c:04X}\t{ch}\t{cnt[c]}\n")
        print(f"사용 코드 목록 → {a.out_used}")


def main():
    ap = argparse.ArgumentParser(description="창세기전2 텍스트 섹션 도구")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn, helptext in (("sections", cmd_sections, "섹션 목록"),
                               ("dump", cmd_dump, "모든 레코드를 TSV로"),
                               ("chars", cmd_chars, "실제 쓰이는 문자 집계")):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("exe", help="SLPS_023.11")
        p.add_argument("data", help="G2DATA1.DAT")
        if name == "sections":
            p.add_argument("--limit", type=int, default=30)
        if name == "dump":
            p.add_argument("-o", "--output")
        if name == "chars":
            p.add_argument("--out-used", help="사용 코드 목록 TSV")
        p.set_defaults(func=fn)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
