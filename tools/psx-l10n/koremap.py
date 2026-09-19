#!/usr/bin/env python3
"""
koremap - 한글 ↔ 게임 문자 코드 대응표 생성 및 텍스트 인코딩

창세기전2 PS1은 Shift-JIS 코드를 폰트 글리프 인덱스로 바꿔 찍는다. 렌더러를
고치지 않고 한글을 넣으려면, **게임이 쓰지 않는 JIS 2수준 한자 코드**에 한글을
1:1로 배정하고 그 슬롯의 글리프만 한글로 바꾸면 된다.

2수준 한자는 3,390 슬롯인데 이 게임이 실제로 쓰는 건 71자뿐이라(g2text chars),
KS X 1001 완성형 한글 2,350자가 남은 슬롯에 그대로 들어간다. 쓰이는 71자는
건드리지 않으므로 번역 안 한 일본어도 그대로 나온다.

사용법:
    python3 koremap.py build  ex/SLPS_023.11 ex/G2DATA1.DAT -o ex/koremap.tsv
    python3 koremap.py encode ex/koremap.tsv "/5이올린/1/n안녕하세요."
    python3 koremap.py decode ex/koremap.tsv 989f98a0...
    python3 koremap.py check  ex/koremap.tsv 번역.tsv

의존성: 같은 디렉터리의 g2text.py (문자 집계용).
"""

import argparse
import os
import struct
import sys

REMAP_L2 = 0x800DFB48      # 2수준 한자 리맵 테이블 (EXE RAM 주소)
L2_FIRST, L2_LAST = 0x989F, 0xEAA4
L2_COUNT = 3390
EXE_BASE = 0x80010000


def _exe_off(addr):
    return addr - EXE_BASE + 0x800


def load_remap(exe_path, n=37):
    """(sub, add) 쌍 배열. idx = code - sub[k] + add[k]."""
    e = open(exe_path, "rb").read()
    o = _exe_off(REMAP_L2)
    return [struct.unpack_from("<HH", e, o + 4 * i) for i in range(n)]


def remap_slot(code):
    """SJIS 코드 → 리맵 테이블 인덱스 k (렌더러 0x80019CF0~ 와 동일한 식)."""
    lead, trail = code >> 8, code & 0xFF
    if lead >= 0xE0:
        return (lead - 0xE0) * 2 + (15 if trail < 0x7F else 16)
    return (lead - 0x98) * 2 - (1 if trail < 0x7F else 0)


def code_to_index(code, remap):
    sub, add = remap[remap_slot(code)]
    return code - sub + add


def valid_l2_codes(remap):
    """실제 글자가 있는 2수준 코드를 글리프 인덱스 순으로 [(idx, code), ...].

    인덱스에서 코드를 역산하면 0x7F 건너뛰기 때문에 빈틈이 생긴다. 코드 쪽에서
    정방향으로 열거하고 렌더러와 같은 식으로 인덱스를 구하는 편이 정확하다.
    """
    seen = {}
    for lead in range(L2_FIRST >> 8, (L2_LAST >> 8) + 1):
        for trail in range(0x40, 0xFD):
            if trail == 0x7F:
                continue
            code = (lead << 8) | trail
            if not (L2_FIRST <= code <= L2_LAST):
                continue
            k = remap_slot(code)
            if not (0 <= k < len(remap)) or remap[k] == (0, 0):
                continue
            idx = code_to_index(code, remap)
            if 0 <= idx < L2_COUNT and idx not in seen:
                seen[idx] = code
    return [(i, seen[i]) for i in sorted(seen)]


def ksx1001_hangul():
    """KS X 1001 완성형 한글 2,350자 (EUC-KR 0xB0A1~0xC8FE 순)."""
    out = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode("euc_kr"))
            except UnicodeDecodeError:
                pass
    return out


def load_map(path):
    """대응표 TSV → (한글→코드, 코드→한글, 인덱스 목록)."""
    fwd, rev, idxs = {}, {}, []
    with open(path, encoding="utf-8") as f:
        next(f)
        for line in f:
            t = line.rstrip("\n").split("\t")
            if len(t) < 3:
                continue
            ch, code, idx = t[0], int(t[1], 16), int(t[2])
            fwd[ch] = code
            rev[code] = ch
            idxs.append((idx, ch))
    return fwd, rev, idxs


# ---------------------------------------------------------------- 인코딩

def encode(text, fwd):
    """한국어 문장 → 게임 바이트열. 반환 (bytes, 실패한 글자 목록)."""
    out = bytearray()
    bad = []
    for ch in text:
        if ch in fwd:
            out += bytes([fwd[ch] >> 8, fwd[ch] & 0xFF])
        elif 0x20 <= ord(ch) <= 0x7E:
            out.append(ord(ch))               # ASCII·제어 코드(/5 /1 /n)
        else:
            try:
                out += ch.encode("cp932")     # 、。！？ 등 기존 전각 기호
            except UnicodeEncodeError:
                bad.append(ch)
    return bytes(out), bad


def decode(raw, rev):
    out = []
    i = 0
    while i < len(raw):
        b = raw[i]
        if (0x81 <= b <= 0x9F or 0xE0 <= b <= 0xFC) and i + 1 < len(raw):
            c = (b << 8) | raw[i + 1]
            out.append(rev.get(c) or bytes([b, raw[i + 1]]).decode("cp932", errors="replace"))
            i += 2
        else:
            out.append(chr(b) if 0x20 <= b <= 0x7E else f"\\x{b:02X}")
            i += 1
    return "".join(out)


# ---------------------------------------------------------------- 명령

def cmd_build(a):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import g2text

    remap = load_remap(a.exe)
    cnt = g2text.census(a.data, a.exe)
    used = {c for c in cnt if L2_FIRST <= c <= L2_LAST}
    avail = [(i, c) for i, c in valid_l2_codes(remap) if c not in used]
    chars = ksx1001_hangul()
    if a.extra:
        seen = set(chars)
        for ch in open(a.extra, encoding="utf-8").read():
            if ch.strip() and ch not in seen:
                seen.add(ch)
                chars.append(ch)
    if len(chars) > len(avail):
        sys.exit(f"슬롯 부족: {len(chars)}자 필요, {len(avail)}개 가능")

    with open(a.output, "w", encoding="utf-8") as f:
        f.write("char\tsjis\tglyph_index\tunicode\n")
        for ch, (idx, code) in zip(chars, avail):
            f.write(f"{ch}\t{code:04X}\t{idx}\tU+{ord(ch):04X}\n")
    print(f"2수준 슬롯 {len(valid_l2_codes(remap)):,}개 중 사용 중 {len(used)}개를 빼고 "
          f"{len(chars):,}자 배정 → {a.output}")
    print(f"  코드 범위 0x{avail[0][1]:04X} ~ 0x{avail[len(chars) - 1][1]:04X}, "
          f"글리프 인덱스 {avail[0][0]} ~ {avail[len(chars) - 1][0]}")
    print(f"  남은 여유 슬롯 {len(avail) - len(chars):,}개")


def cmd_encode(a):
    fwd, rev, _ = load_map(a.map)
    raw, bad = encode(a.text, fwd)
    print(raw.hex())
    print(f"{len(raw)} bytes")
    if bad:
        print("표에 없는 글자:", "".join(bad))
    print("되읽기:", decode(raw, rev))


def cmd_decode(a):
    fwd, rev, _ = load_map(a.map)
    print(decode(bytes.fromhex(a.hexstr), rev))


def cmd_check(a):
    """번역 TSV 검증: 표에 없는 글자, 제어 코드 유실, 길이."""
    fwd, rev, _ = load_map(a.map)
    bad_ch, lost, rows = {}, [], 0
    with open(a.tsv, encoding="utf-8") as f:
        head = next(f).rstrip("\n").split("\t")
        try:
            ci, ti = head.index("text"), head.index("ko")
        except ValueError:
            sys.exit("TSV에 'text'(원문)와 'ko'(번역) 열이 필요합니다.")
        for line in f:
            t = line.rstrip("\n").split("\t")
            if len(t) <= max(ci, ti):
                continue
            rows += 1
            src, ko = t[ci], t[ti]
            if not ko:
                continue
            raw, bad = encode(ko, fwd)
            for ch in bad:
                bad_ch[ch] = bad_ch.get(ch, 0) + 1
            for code in ("/5", "/1", "/n"):
                if src.count(code) != ko.count(code):
                    lost.append((t[0] if t else "?", code, src.count(code), ko.count(code)))
    print(f"{rows:,}행 검사")
    print(f"  표에 없는 글자 {len(bad_ch)}종: "
          + ("".join(sorted(bad_ch)) if bad_ch else "없음"))
    print(f"  제어 코드 개수 불일치 {len(lost)}건" + (f" (예: {lost[:5]})" if lost else ""))


def main():
    ap = argparse.ArgumentParser(description="한글 ↔ 게임 코드 대응표")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("build", help="대응표 생성")
    p.add_argument("exe")
    p.add_argument("data")
    p.add_argument("-o", "--output", default="koremap.tsv")
    p.add_argument("--extra", help="한글 외에 추가할 글자 목록 파일")
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("encode", help="한국어 → 게임 바이트열(16진)")
    p.add_argument("map")
    p.add_argument("text")
    p.set_defaults(func=cmd_encode)

    p = sub.add_parser("decode", help="게임 바이트열(16진) → 한국어")
    p.add_argument("map")
    p.add_argument("hexstr")
    p.set_defaults(func=cmd_decode)

    p = sub.add_parser("check", help="번역 TSV 검증")
    p.add_argument("map")
    p.add_argument("tsv")
    p.set_defaults(func=cmd_check)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
