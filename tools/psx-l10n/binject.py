#!/usr/bin/env python3
"""
binject - MODE2/2352 raw 이미지에 파일을 제자리로 되넣기

패치가 원본과 **같은 크기**라면 ISO를 다시 만들 필요가 없다. 그 파일이 차지한
섹터의 사용자 데이터 2048바이트만 갈아끼우고 EDC/ECC를 다시 계산하면 된다.
바뀌지 않은 섹터는 한 바이트도 건드리지 않으므로 xdelta 패치도 아주 작아진다.

MODE2/FORM1 섹터(2352바이트):

    0    ~ 11    동기 패턴
    12   ~ 15    헤더 (분, 초, 프레임, 모드) — ECC 계산 때는 0으로 친다
    16   ~ 23    서브헤더
    24   ~ 2071  사용자 데이터 2048
    2072 ~ 2075  EDC — 16~2071 에 대한 CRC32 (다항식 0x8001801B, 리틀엔디언)
    2076 ~ 2247  ECC P 패리티 172
    2248 ~ 2351  ECC Q 패리티 104

사용법:
    python3 binject.py verify 게임.bin [--count 2000]
        원본 섹터의 EDC/ECC 를 다시 계산해 원본 값과 일치하는지 확인한다.
        여기서 통과해야 inject 결과를 믿을 수 있다.

    python3 binject.py inject 원본.bin 출력.bin -f G2DATA1.DAT=ex/G2DATA1.ko.DAT \\
                                                -f SLPS_023.11=ex/SLPS_023.11.ko
        같은 크기의 교체본을 해당 파일이 쓰던 섹터에 써 넣는다. 바뀐 섹터만 고친다.

의존성: 같은 디렉터리의 psxtool.py (ISO9660 디렉터리 파싱)
"""

import argparse
import os
import shutil
import struct
import sys

SECTOR = 2352
DATA_OFF = 24
DATA_LEN = 2048
EDC_OFF = 2072
ECC_P_OFF = 2076
ECC_Q_OFF = 2248

# ---------------------------------------------------------------- EDC

_EDC_LUT = []
for _i in range(256):
    _c = _i
    for _ in range(8):
        _c = (_c >> 1) ^ (0xD8018001 if _c & 1 else 0)
    _EDC_LUT.append(_c & 0xFFFFFFFF)


def edc(data):
    c = 0
    for b in data:
        c = _EDC_LUT[(c ^ b) & 0xFF] ^ (c >> 8)
    return c & 0xFFFFFFFF


# ---------------------------------------------------------------- ECC

_ECC_F = [0] * 256      # GF(2^8) 에서 2를 곱하는 표
_ECC_B = [0] * 256      # 위의 역표
for _i in range(256):
    _j = ((_i << 1) ^ (0x11D if _i & 0x80 else 0)) & 0xFF
    _ECC_F[_i] = _j
    _ECC_B[_i ^ _j] = _i


def _ecc_block(sec, major_count, minor_count, major_mult, minor_inc, dest):
    """CD-ROM ECC 한 블록(P 또는 Q). sec 의 12번지부터를 입력으로 본다."""
    size = major_count * minor_count
    for major in range(major_count):
        index = (major >> 1) * major_mult + (major & 1)
        a = b = 0
        for _ in range(minor_count):
            t = sec[12 + index]
            index += minor_inc
            if index >= size:
                index -= size
            a ^= t
            b ^= t
            a = _ECC_F[a]
        a = _ECC_B[_ECC_F[a] ^ b]
        sec[dest + major] = a
        sec[dest + major + major_count] = a ^ b


def fix_sector(sec):
    """사용자 데이터를 바꾼 뒤 EDC/ECC 를 다시 계산한다 (MODE2/FORM1)."""
    struct.pack_into("<I", sec, EDC_OFF, edc(sec[16:EDC_OFF]))
    head = bytes(sec[12:16])
    sec[12:16] = b"\x00\x00\x00\x00"
    _ecc_block(sec, 86, 24, 2, 86, ECC_P_OFF)
    _ecc_block(sec, 52, 43, 86, 88, ECC_Q_OFF)
    sec[12:16] = head


# ---------------------------------------------------------------- 디스크

def _psxtool():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import psxtool
    return psxtool


def find_files(image):
    """이미지 안 파일들의 {이름: (lba, 길이)}."""
    P = _psxtool()
    disc = P.Disc(image)
    if disc.sector_size != SECTOR or disc.data_offset != DATA_OFF:
        disc.close()
        sys.exit(f"MODE2/2352 raw 이미지가 아닙니다 "
                 f"(섹터 {disc.sector_size}, 데이터 오프셋 {disc.data_offset}). raw 전용입니다.")
    pvd = P.get_pvd(disc)
    out = {}
    for path, e in P.walk(disc, pvd["root_lba"], pvd["root_len"]):
        if not e.is_dir:
            out[P.strip_version(os.path.basename(path))] = (e.lba, e.length)
    disc.close()
    return out


# ---------------------------------------------------------------- 명령

def cmd_verify(a):
    """원본 섹터를 다시 계산해 원본 값과 같은지 본다. 알고리즘 검증."""
    n_ok = n_bad = 0
    bad = []
    with open(a.image, "rb") as f:
        total = os.path.getsize(a.image) // SECTOR
        step = max(1, total // a.count)
        for i in range(0, total, step):
            f.seek(i * SECTOR)
            raw = f.read(SECTOR)
            if len(raw) < SECTOR or raw[15] != 2:
                continue
            if raw[18] & 0x20:            # 서브헤더 submode bit5 = Form 2
                continue
            sec = bytearray(raw)
            fix_sector(sec)
            if bytes(sec) == raw:
                n_ok += 1
            else:
                n_bad += 1
                if len(bad) < 5:
                    bad.append(i)
    print(f"검사 {n_ok + n_bad:,}섹터 — 일치 {n_ok:,}, 불일치 {n_bad:,}")
    if n_bad:
        print("  불일치 LBA:", bad)
        print("  EDC/ECC 계산이 틀렸습니다. inject 를 쓰면 안 됩니다.")
        return 1
    print("  EDC/ECC 계산이 원본과 완전히 일치합니다.")
    return 0


def cmd_inject(a):
    files = find_files(a.image)
    jobs = []
    for spec in a.file:
        name, _, path = spec.partition("=")
        if name not in files:
            sys.exit(f"이미지에 {name} 이(가) 없습니다. 있는 것: {', '.join(sorted(files))}")
        lba, length = files[name]
        new = open(path, "rb").read()
        if len(new) != length:
            sys.exit(f"{name}: 크기가 다릅니다 (원본 {length:,} / 교체본 {len(new):,}). "
                     "제자리 삽입은 같은 크기여야 합니다.")
        jobs.append((name, lba, length, new))

    if os.path.abspath(a.image) != os.path.abspath(a.output):
        print(f"원본 복사 중… ({os.path.getsize(a.image):,} bytes)")
        shutil.copyfile(a.image, a.output)

    changed = total = 0
    with open(a.output, "r+b") as f:
        for name, lba, length, new in jobs:
            nsec = (length + DATA_LEN - 1) // DATA_LEN
            ch = 0
            for i in range(nsec):
                chunk = new[i * DATA_LEN:(i + 1) * DATA_LEN]
                chunk += b"\x00" * (DATA_LEN - len(chunk))
                f.seek((lba + i) * SECTOR)
                raw = f.read(SECTOR)
                if raw[DATA_OFF:DATA_OFF + DATA_LEN] == chunk:
                    continue
                sec = bytearray(raw)
                sec[DATA_OFF:DATA_OFF + DATA_LEN] = chunk
                fix_sector(sec)
                f.seek((lba + i) * SECTOR)
                f.write(sec)
                ch += 1
            print(f"  {name}: {nsec:,}섹터 중 {ch:,}개 교체 (LBA {lba:,})")
            changed += ch
            total += nsec
    print(f"{changed:,}섹터 교체 → {a.output}")
    print(f"  바뀐 바이트 비율 {changed * SECTOR / os.path.getsize(a.output) * 100:.3f}% "
          "— xdelta 패치가 작게 나옵니다.")


def main():
    ap = argparse.ArgumentParser(description="MODE2/2352 이미지에 파일 제자리 삽입")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("verify", help="EDC/ECC 계산이 원본과 맞는지 확인")
    p.add_argument("image")
    p.add_argument("--count", type=int, default=2000, help="검사할 섹터 수 (고르게 추출)")
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("inject", help="같은 크기 교체본을 제자리에 삽입")
    p.add_argument("image")
    p.add_argument("output")
    p.add_argument("-f", "--file", action="append", required=True,
                   metavar="이미지내이름=교체본경로")
    p.set_defaults(func=cmd_inject)

    a = ap.parse_args()
    sys.exit(a.func(a) or 0)


if __name__ == "__main__":
    main()
