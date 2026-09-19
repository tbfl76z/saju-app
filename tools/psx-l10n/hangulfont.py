#!/usr/bin/env python3
"""
hangulfont - BDF 비트맵 폰트를 게임 폰트 슬롯(16×13, 1bpp, 26바이트/글리프)으로 변환

창세기전2 PS1의 폰트는 글리프당 13행 × u16(빅엔디언, MSB가 왼쪽 픽셀) = 26바이트다.
Galmuri11 같은 BDF 폰트에서 필요한 글자만 뽑아 이 형식으로 만들고, 확인용 PNG도 만든다.

사용법:
    python3 hangulfont.py build   Galmuri11.bdf out.bin [--chars ksx1001|all|파일] [--dx 1 --baseline 11] [--png sheet.png]
    python3 hangulfont.py preview Galmuri11.bdf "문장" out.png [--dx 1 --baseline 11] [--game-exe SLPS_023.11]
    python3 hangulfont.py info    Galmuri11.bdf

`preview`는 게임 렌더러와 같은 규칙(글리프의 실제 좌우 폭 + 4px 진행, 빈 글리프 8px)으로
문장을 찍어 실제 화면 간격을 미리 본다. `--game-exe`를 주면 같은 줄 아래에 게임 원본
일본어 글리프(가나)를 같은 규칙으로 찍어 크기를 비교한다.

의존성 없음.
"""

import argparse
import struct
import sys
import zlib

SLOT_W, SLOT_H, SLOT_BYTES = 16, 13, 26


# ------------------------------------------------------------------ BDF

def parse_bdf(path):
    """{codepoint: (dwidth, bbw, bbh, bbx, bby, rows[int])} 와 폰트 메트릭을 돌려준다."""
    glyphs = {}
    ascent = descent = None
    cur = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            t = line.split()
            if not t:
                continue
            k = t[0]
            if k == "FONT_ASCENT":
                ascent = int(t[1])
            elif k == "FONT_DESCENT":
                descent = int(t[1])
            elif k == "STARTCHAR":
                cur = {"rows": []}
            elif cur is None:
                continue
            elif k == "ENCODING":
                cur["cp"] = int(t[1])
            elif k == "DWIDTH":
                cur["dw"] = int(t[1])
            elif k == "BBX":
                cur["bbx"] = tuple(int(v) for v in t[1:5])
            elif k == "BITMAP":
                cur["in_bitmap"] = True
            elif k == "ENDCHAR":
                if cur.get("cp", -1) >= 0:
                    w, h, ox, oy = cur.get("bbx", (0, 0, 0, 0))
                    glyphs[cur["cp"]] = (cur.get("dw", w), w, h, ox, oy, cur["rows"])
                cur = None
            elif cur.get("in_bitmap"):
                # 16진수 행. 왼쪽 픽셀이 MSB. 폭에 맞춰 왼쪽 정렬된 값으로 정규화
                nbits = len(k) * 4
                cur["rows"].append((int(k, 16), nbits))
    return glyphs, ascent, descent


def bdf_to_slot(g, baseline, dx):
    """BDF 글리프 → 13개의 u16 행. 기준선을 슬롯 안 `baseline` 행에 둔다.

    BDF의 bby 는 기준선에서 위로 잰 하단 오프셋이고, 비트맵 첫 행이 가장 위다.
    Galmuri11 한글(11px, oy=0)은 baseline=11 이면 1~11행을 차지해 원본 한자(0~12행)와
    중심이 맞고 위아래 1행씩 남는다. FONT_ASCENT(14)는 슬롯보다 커서 쓰지 않는다.
    """
    dw, w, h, ox, oy, rows = g
    out = [0] * SLOT_H
    top = baseline - (h + oy) + 1       # 비트맵 첫 행의 슬롯 행
    for i, (val, nbits) in enumerate(rows):
        y = top + i
        if not 0 <= y < SLOT_H:
            continue
        # 폭 nbits 짜리 값을 16비트 슬롯의 (ox+dx) 열부터 놓는다
        shifted = val << (SLOT_W - nbits)      # 왼쪽 정렬
        shift = ox + dx
        v = (shifted >> shift) if shift >= 0 else (shifted << -shift)
        out[y] |= v & 0xFFFF
    return out


def slot_bytes(rows):
    return b"".join(struct.pack(">H", r) for r in rows)


def slot_width(rows):
    """게임 렌더러 규칙: set 열의 최소~최대. 비어 있으면 None."""
    cols = [c for c in range(SLOT_W) if any(r & (0x8000 >> c) for r in rows)]
    return (cols[0], cols[-1]) if cols else None


def advance(rows):
    """게임 렌더러의 진행 폭 추정: 실폭 + 4, 빈 글리프 8."""
    b = slot_width(rows)
    return 8 if b is None else (b[1] - b[0] + 1) + 4


# ------------------------------------------------------------------ 문자 집합

def ksx1001_hangul():
    """KS X 1001 완성형 한글 2,350자 (EUC-KR 0xB0A1~0xC8FE 순서)."""
    out = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode("euc_kr"))
            except UnicodeDecodeError:
                pass
    return out


def load_chars(spec):
    if spec == "ksx1001":
        return ksx1001_hangul()
    if spec == "all":
        return None
    with open(spec, encoding="utf-8") as f:
        seen, out = set(), []
        for ch in f.read():
            if ch.strip() and ch not in seen:
                seen.add(ch)
                out.append(ch)
        return out


# ------------------------------------------------------------------ PNG

def write_png(path, width, height, rows):
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def sheet_png(path, slots, per_row=32, gap=1):
    n = len(slots)
    rows_n = (n + per_row - 1) // per_row
    W, H = per_row * (SLOT_W + gap), rows_n * (SLOT_H + gap)
    img = [[40] * W for _ in range(H)]
    for t, rows in enumerate(slots):
        ox, oy = (t % per_row) * (SLOT_W + gap), (t // per_row) * (SLOT_H + gap)
        for y in range(SLOT_H):
            for x in range(SLOT_W):
                img[oy + y][ox + x] = 255 if rows[y] & (0x8000 >> x) else 0
    write_png(path, W, H, img)


def line_png_rows(slots, scale=1):
    """게임 규칙으로 글리프를 이어 찍은 한 줄(높이 13)의 픽셀 행들."""
    width = sum(advance(s) for s in slots) + 4
    img = [[0] * width for _ in range(SLOT_H)]
    x = 0
    for s in slots:
        b = slot_width(s)
        if b is None:
            x += 8
            continue
        for y in range(SLOT_H):
            for c in range(b[0], b[1] + 1):
                if s[y] & (0x8000 >> c):
                    img[y][x + c - b[0]] = 255
        x += (b[1] - b[0] + 1) + 4
    if scale > 1:
        img = [[px for px in row for _ in range(scale)] for row in img for _ in range(scale)]
    return img


# ------------------------------------------------------------------ 게임 원본 글리프 (비교용)

def game_glyph_kana(exe, ch):
    """EXE 안 원본 폰트에서 가나/기호 한 글자를 꺼낸다 (비한자 구간만)."""
    remap = [(0x8140, 0), (0x8180, 0x3F), (0x81B8, 0x6C), (0x81C8, 0x74), (0x81DA, 0x7B),
             (0x81F0, 0x8A), (0x81FC, 0x92), (0x824F, 0x93), (0x8260, 0x9D), (0x8281, 0xB7),
             (0x829F, 0xD1), (0x8340, 0x124), (0x8380, 0x163), (0x839F, 0x17A), (0x83BF, 0x192),
             (0x8440, 0x1AA), (0x8470, 0x1CB), (0x8480, 0x1DA), (0x849F, 0x1EC)]
    code = int.from_bytes(ch.encode("cp932"), "big")
    idx = None
    for start, base in reversed(remap):
        if code >= start:
            idx = code - start + base
            break
    if idx is None:
        return [0] * SLOT_H
    off = 0x800DFBDC - 0x80010000 + 0x800 + idx * SLOT_BYTES
    return [struct.unpack_from(">H", exe, off + 2 * i)[0] for i in range(SLOT_H)]


# ------------------------------------------------------------------ 명령

def cmd_info(a):
    glyphs, asc, desc = parse_bdf(a.bdf)
    hang = [cp for cp in glyphs if 0xAC00 <= cp <= 0xD7A3]
    have = sum(1 for ch in ksx1001_hangul() if ord(ch) in glyphs)
    print(f"글리프 {len(glyphs):,}개, ascent {asc} descent {desc}")
    print(f"한글 음절 {len(hang):,}개, KS X 1001 2,350자 중 {have}자 보유")
    import collections
    bb = collections.Counter(glyphs[cp][1:5] for cp in hang)
    print("한글 BBX(w h ox oy) 분포:", bb.most_common(5))


def cmd_build(a):
    glyphs, asc, _ = parse_bdf(a.bdf)
    chars = load_chars(a.chars)
    if chars is None:
        chars = [chr(cp) for cp in sorted(glyphs) if cp >= 0x20]
    slots, missing, clipped = [], [], []
    with open(a.out, "wb") as f:
        for ch in chars:
            g = glyphs.get(ord(ch))
            if g is None:
                missing.append(ch)
                rows = [0] * SLOT_H
            else:
                rows = bdf_to_slot(g, a.baseline, a.dx)
                # 잘림 검사: 원본 set 픽셀 수와 슬롯 set 픽셀 수 비교
                src = sum(bin(v).count("1") for v, _ in g[5])
                if sum(bin(r).count("1") for r in rows) != src:
                    clipped.append(ch)
            slots.append(rows)
            f.write(slot_bytes(rows))
    if a.map:
        with open(a.map, "w", encoding="utf-8") as m:
            m.write("idx\tchar\tcodepoint\tadvance\n")
            for i, (ch, rows) in enumerate(zip(chars, slots)):
                m.write(f"{i}\t{ch}\tU+{ord(ch):04X}\t{advance(rows)}\n")
    print(f"{len(slots):,}자 → {a.out} ({len(slots) * SLOT_BYTES:,} bytes)")
    if missing:
        print(f"폰트에 없는 글자 {len(missing)}자: {''.join(missing[:40])}{'…' if len(missing) > 40 else ''}")
    if clipped:
        print(f"슬롯 밖으로 잘린 글자 {len(clipped)}자: {''.join(clipped[:40])}{'…' if len(clipped) > 40 else ''}")
        print("  → --dx/--baseline 을 조정하세요.")
    adv = [advance(r) for r in slots]
    print(f"진행 폭: 최소 {min(adv)} 최대 {max(adv)} 평균 {sum(adv) / len(adv):.1f}px")
    if a.png:
        sheet_png(a.png, slots, a.per_row)
        print(f"확인용 표 → {a.png}")


def cmd_preview(a):
    glyphs, asc, _ = parse_bdf(a.bdf)
    slots = []
    for ch in a.text:
        g = glyphs.get(ord(ch))
        slots.append(bdf_to_slot(g, a.baseline, a.dx) if g else [0] * SLOT_H)
    lines = [line_png_rows(slots, a.scale)]
    if a.game_exe:
        exe = open(a.game_exe, "rb").read()
        ref = [game_glyph_kana(exe, ch) for ch in a.ref_text]
        lines.append(line_png_rows(ref, a.scale))
    W = max(len(r) for l in lines for r in l) + 8 * a.scale
    img = []
    for l in lines:
        img += [[40] * W for _ in range(4 * a.scale)]
        for r in l:
            img.append([0] * (4 * a.scale) + r + [0] * (W - len(r) - 4 * a.scale))
    img += [[40] * W for _ in range(4 * a.scale)]
    write_png(a.out, W, len(img), img)
    print(f"'{a.text}' → {a.out}  (진행 폭 합 {sum(advance(s) for s in slots)}px)")


def main():
    ap = argparse.ArgumentParser(description="BDF → 게임 폰트 슬롯(16×13 1bpp) 변환")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("info", help="BDF 메트릭과 한글 보유 수")
    p.add_argument("bdf")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("build", help="글리프 블롭(26바이트×N) 생성")
    p.add_argument("bdf")
    p.add_argument("out")
    p.add_argument("--chars", default="ksx1001", help="ksx1001(기본) | all | 글자 목록 파일")
    p.add_argument("--dx", type=int, default=1, help="슬롯 안 가로 오프셋 (기본 1)")
    p.add_argument("--baseline", type=int, default=11, help="기준선이 놓이는 슬롯 행 0~12 (기본 11)")
    p.add_argument("--png", help="확인용 격자 PNG")
    p.add_argument("--per-row", type=int, default=32)
    p.add_argument("--map", help="idx↔글자 대응 TSV 저장")
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("preview", help="문장을 게임 간격 규칙으로 렌더")
    p.add_argument("bdf")
    p.add_argument("text")
    p.add_argument("out")
    p.add_argument("--dx", type=int, default=1)
    p.add_argument("--baseline", type=int, default=11)
    p.add_argument("--scale", type=int, default=1)
    p.add_argument("--game-exe", help="SLPS_023.11 — 아래 줄에 원본 가나 비교 렌더")
    p.add_argument("--ref-text", default="その中の栄光のセップターはこの間", help="비교용 일본어(가나만 정확)")
    p.set_defaults(func=cmd_preview)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
