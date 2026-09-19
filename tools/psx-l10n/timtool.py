#!/usr/bin/env python3
"""
timtool - PS1 TIM 이미지 탐색/추출 도구

TIM은 PS1의 표준 이미지 포맷이다. 폰트는 거의 항상 TIM으로 들어있으므로
한글화에서 폰트를 찾고 교체하려면 이 포맷을 다룰 수 있어야 한다.

파일 안에 TIM이 통째로 들어있지 않고 아카이브 중간에 박혀 있는 경우가
많아서, 매직 넘버를 스캔해 찾아내는 방식으로 동작한다.

사용법:
    python3 timtool.py scan    <파일 또는 디렉터리>
    python3 timtool.py extract <파일 또는 디렉터리> <출력디렉터리> [--all-cluts]
"""

import argparse
import os
import struct
import sys
import zlib

TIM_MAGIC = b"\x10\x00\x00\x00"

# pmode(flags 하위 3비트) → 픽셀당 비트수
PMODE_BPP = {0: 4, 1: 8, 2: 16, 3: 24}
PMODE_NAME = {0: "4bpp(16색)", 1: "8bpp(256색)", 2: "16bpp(직접색)", 3: "24bpp"}


class Tim:
    def __init__(self, offset, pmode, width, height, palettes, pixels):
        self.offset = offset
        self.pmode = pmode
        self.width = width
        self.height = height
        self.palettes = palettes   # [[(r,g,b,a), ...], ...]
        self.pixels = pixels       # 인덱스 또는 직접색 바이트열
        self.size = 0

    @property
    def bpp(self):
        return PMODE_BPP[self.pmode]

    def describe(self):
        pal = f", 팔레트 {len(self.palettes)}개×{len(self.palettes[0])}색" if self.palettes else ""
        return (f"offset=0x{self.offset:08X}  {self.width}x{self.height}  "
                f"{PMODE_NAME[self.pmode]}{pal}  ({self.size} bytes)")


def bgr555_to_rgba(v, opaque=False):
    """PS1의 16비트 색은 ABGR1555. 0x0000은 관례상 투명."""
    r = (v & 0x1F) << 3
    g = ((v >> 5) & 0x1F) << 3
    b = ((v >> 10) & 0x1F) << 3
    a = 255 if (opaque or v != 0) else 0
    # 5비트 → 8비트 확장 시 상위비트를 하위로 복사해야 흰색이 255가 된다
    return (r | (r >> 5), g | (g >> 5), b | (b >> 5), a)


def parse_tim(data, offset, opaque=False):
    """offset 위치의 TIM을 파싱한다. 유효하지 않으면 None."""
    if data[offset:offset + 4] != TIM_MAGIC:
        return None
    if offset + 8 > len(data):
        return None

    flags = struct.unpack_from("<I", data, offset + 4)[0]
    pmode = flags & 0x07
    has_clut = bool(flags & 0x08)
    if pmode not in PMODE_BPP:
        return None
    if flags & ~0x0F:          # 정의되지 않은 비트가 켜져 있으면 가짜
        return None
    if has_clut and pmode in (2, 3):
        return None            # 직접색에 팔레트는 모순

    pos = offset + 8
    palettes = []

    if has_clut:
        if pos + 12 > len(data):
            return None
        clut_size = struct.unpack_from("<I", data, pos)[0]
        pal_w, pal_h = struct.unpack_from("<HH", data, pos + 8)
        if clut_size < 12 or pos + clut_size > len(data):
            return None
        if pal_w == 0 or pal_h == 0 or pal_w * pal_h * 2 > clut_size:
            return None
        entries = pos + 12
        for p in range(pal_h):
            pal = [bgr555_to_rgba(
                       struct.unpack_from("<H", data, entries + (p * pal_w + i) * 2)[0],
                       opaque)
                   for i in range(pal_w)]
            palettes.append(pal)
        pos += clut_size

    if pos + 12 > len(data):
        return None
    img_size = struct.unpack_from("<I", data, pos)[0]
    raw_w, raw_h = struct.unpack_from("<HH", data, pos + 8)
    if img_size < 12 or pos + img_size > len(data):
        return None
    if raw_w == 0 or raw_h == 0 or raw_h > 2048:
        return None

    # 이미지 폭은 16비트 워드 단위로 저장된다. 실제 픽셀 폭으로 환산.
    width = raw_w * (16 // PMODE_BPP[pmode]) if pmode != 3 else raw_w * 16 // 24
    height = raw_h
    if width == 0 or width > 4096:
        return None

    pixels = data[pos + 12: pos + img_size]
    expected = (width * height * PMODE_BPP[pmode]) // 8
    if len(pixels) < expected:
        return None

    tim = Tim(offset, pmode, width, height, palettes, pixels)
    tim.size = (pos + img_size) - offset
    return tim


def scan_file(data, opaque=False):
    """파일 전체에서 TIM 매직을 찾아 유효한 것만 골라낸다."""
    found = []
    pos = 0
    while True:
        pos = data.find(TIM_MAGIC, pos)
        if pos < 0:
            break
        tim = parse_tim(data, pos, opaque)
        if tim:
            found.append(tim)
            pos += tim.size      # 겹치는 오탐 방지
        else:
            pos += 4
    return found


def tim_to_rows(tim, clut_index=0):
    """TIM을 RGBA 픽셀 행 리스트로 변환."""
    w, h, bpp = tim.width, tim.height, tim.bpp
    pal = tim.palettes[clut_index] if tim.palettes else None
    rows = []
    stride = (w * bpp) // 8

    for y in range(h):
        base = y * stride
        row = bytearray()
        if bpp == 4:
            for x in range(w):
                byte = tim.pixels[base + x // 2]
                idx = (byte & 0x0F) if x % 2 == 0 else (byte >> 4)
                row += bytes(pal[idx] if idx < len(pal) else (255, 0, 255, 255))
        elif bpp == 8:
            for x in range(w):
                idx = tim.pixels[base + x]
                row += bytes(pal[idx] if idx < len(pal) else (255, 0, 255, 255))
        elif bpp == 16:
            for x in range(w):
                v = struct.unpack_from("<H", tim.pixels, base + x * 2)[0]
                row += bytes(bgr555_to_rgba(v))
        else:  # 24bpp
            for x in range(w):
                o = base + x * 3
                row += bytes((tim.pixels[o], tim.pixels[o + 1], tim.pixels[o + 2], 255))
        rows.append(bytes(row))
    return rows


def write_png(path, width, height, rows):
    """의존성 없이 PNG를 직접 쓴다 (8비트 RGBA)."""
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(typ, payload):
        return (struct.pack(">I", len(payload)) + typ + payload
                + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


def iter_inputs(path):
    if os.path.isfile(path):
        yield path
        return
    for root, _, files in os.walk(path):
        for name in sorted(files):
            yield os.path.join(root, name)


def cmd_scan(args):
    total = 0
    for fp in iter_inputs(args.path):
        with open(fp, "rb") as f:
            data = f.read()
        tims = scan_file(data)
        if not tims:
            continue
        rel = os.path.relpath(fp, args.path) if os.path.isdir(args.path) else fp
        print(f"\n{rel}  — TIM {len(tims)}개")
        for t in tims:
            print(f"    {t.describe()}")
        total += len(tims)
    print(f"\n총 {total}개의 TIM 이미지를 찾았습니다.")
    if total:
        print("폰트 후보: 폭·높이가 작고 4bpp이며 같은 크기가 여러 장 연속으로 나오는 것,")
        print("           또는 128x128 / 256x256 크기에 글자가 격자로 박힌 것을 우선 확인하세요.")


def cmd_extract(args):
    os.makedirs(args.outdir, exist_ok=True)
    count = 0
    for fp in iter_inputs(args.path):
        with open(fp, "rb") as f:
            data = f.read()
        tims = scan_file(data, opaque=args.opaque)
        for i, t in enumerate(tims):
            stem = os.path.splitext(os.path.basename(fp))[0]
            n_clut = len(t.palettes) if (t.palettes and args.all_cluts) else 1
            for c in range(n_clut):
                suffix = f"_clut{c}" if n_clut > 1 else ""
                out = os.path.join(
                    args.outdir, f"{stem}_{i:03d}_0x{t.offset:08X}{suffix}.png")
                write_png(out, t.width, t.height, tim_to_rows(t, c))
                count += 1
    print(f"{count}개의 PNG를 {args.outdir} 에 저장했습니다.")


def main():
    # head/less 로 파이프할 때 BrokenPipeError 대신 조용히 끝나도록
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError, ImportError):
        pass  # Windows에는 SIGPIPE가 없다

    ap = argparse.ArgumentParser(description="PS1 TIM 이미지 탐색/추출")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("scan", help="TIM 이미지 목록만 출력")
    p.add_argument("path")
    p.set_defaults(func=cmd_scan)

    p = sub.add_parser("extract", help="찾은 TIM을 PNG로 저장")
    p.add_argument("path")
    p.add_argument("outdir")
    p.add_argument("--all-cluts", action="store_true",
                   help="팔레트가 여러 개면 전부 저장")
    p.add_argument("--opaque", action="store_true",
                   help="투명색 없이 전부 불투명하게 (폰트 확인할 때 유용)")
    p.set_defaults(func=cmd_extract)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
