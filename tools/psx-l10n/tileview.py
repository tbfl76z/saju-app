#!/usr/bin/env python3
"""
tileview - 헤더 없는 원시 비트맵(타일) 데이터를 PNG로 렌더

TIM 헤더 없이 VRAM에 바로 올리는 폰트/타일 데이터를 눈으로 확인하는 도구.
파일의 한 구간을 "글자 타일이 연속으로 나열된 것"으로 가정해 격자로 그린다.
폰트가 있는 구간을 맞게 잡으면 글자가 줄줄이 보인다.

사용법:
    python3 tileview.py <파일> <오프셋(hex)> <출력.png> [--bpp 1|2|4|8] [--tile 16x16] [--per-row 32] [--count 512]
    python3 tileview.py <파일> <오프셋(hex)> <출력.png> --linear --width 256   # 타일 아님, 그냥 가로폭 지정 비트맵

의존성 없음(PNG 직접 생성). 1bpp는 MSB 우선, 4/8bpp는 PS1 관례(하위 니블 먼저).
"""

import argparse
import os
import struct
import sys
import zlib

GRAY = {1: [0, 255], 2: [0, 85, 170, 255], 4: [i * 17 for i in range(16)], 8: list(range(256))}


def write_png(path, width, height, rows):
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)  # 8bit 그레이
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def unpack_pixels(data, bpp, count, msb_first):
    """data 에서 count 개 픽셀 값을 뽑는다."""
    out = []
    if bpp == 8:
        return list(data[:count])
    per = 8 // bpp
    mask = (1 << bpp) - 1
    for b in data:
        for k in range(per):
            shift = (per - 1 - k) * bpp if msb_first else k * bpp
            out.append((b >> shift) & mask)
            if len(out) >= count:
                return out
    return out


def render_tiles(data, bpp, tw, th, per_row, count, msb_first, gap=1):
    tile_bytes = tw * th * bpp // 8
    count = min(count, len(data) // tile_bytes)
    rows_n = (count + per_row - 1) // per_row
    W = per_row * (tw + gap)
    H = rows_n * (th + gap)
    img = [[40] * W for _ in range(H)]   # 격자 배경(어두운 회색)
    pal = GRAY[bpp]
    for t in range(count):
        px = unpack_pixels(data[t * tile_bytes:(t + 1) * tile_bytes], bpp, tw * th, msb_first)
        ox = (t % per_row) * (tw + gap)
        oy = (t // per_row) * (th + gap)
        for y in range(th):
            row = img[oy + y]
            for x in range(tw):
                row[ox + x] = pal[px[y * tw + x]]
    return W, H, img, count


def render_linear(data, bpp, width, msb_first, max_h=4096):
    row_bytes = width * bpp // 8
    h = min(max_h, len(data) // row_bytes)
    pal = GRAY[bpp]
    img = []
    for y in range(h):
        px = unpack_pixels(data[y * row_bytes:(y + 1) * row_bytes], bpp, width, msb_first)
        img.append([pal[v] for v in px])
    return width, h, img


def main():
    ap = argparse.ArgumentParser(description="원시 타일/비트맵 데이터를 PNG로")
    ap.add_argument("file")
    ap.add_argument("offset", help="예: 0x1A000")
    ap.add_argument("out")
    ap.add_argument("--bpp", type=int, default=1, choices=[1, 2, 4, 8])
    ap.add_argument("--tile", default="16x16", help="타일 크기 WxH (기본 16x16)")
    ap.add_argument("--per-row", type=int, default=32)
    ap.add_argument("--count", type=int, default=1024, help="그릴 타일 수")
    ap.add_argument("--linear", action="store_true", help="타일이 아니라 연속 비트맵으로")
    ap.add_argument("--width", type=int, default=256, help="--linear 일 때 가로 픽셀")
    ap.add_argument("--lsb", action="store_true", help="니블/비트 순서를 LSB 우선으로 (PS1 4bpp 텍스처는 보통 이쪽)")
    ap.add_argument("--length", type=int, default=0, help="읽을 바이트 수 (0=필요한 만큼)")
    a = ap.parse_args()

    off = int(a.offset, 16) if a.offset.lower().startswith("0x") else int(a.offset, 0)
    tw, th = (int(v) for v in a.tile.lower().split("x"))
    msb = not a.lsb
    if a.linear:
        need = a.length or a.width * a.bpp // 8 * 4096
    else:
        need = a.length or tw * th * a.bpp // 8 * a.count
    with open(a.file, "rb") as f:
        f.seek(off)
        data = f.read(need)
    if not data:
        sys.exit("읽을 데이터가 없습니다.")

    if a.linear:
        W, H, img = render_linear(data, a.bpp, a.width, msb)
        print(f"{a.file}+0x{off:X}: 선형 {W}x{H} @ {a.bpp}bpp → {a.out}")
    else:
        W, H, img, n = render_tiles(data, a.bpp, tw, th, a.per_row, a.count, msb)
        print(f"{a.file}+0x{off:X}: 타일 {tw}x{th} @ {a.bpp}bpp × {n}개 ({a.per_row}/행) → {a.out}")
    write_png(a.out, W, H, img)


if __name__ == "__main__":
    main()
