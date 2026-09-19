#!/usr/bin/env python3
"""
psxtool - PS1/PC CD 이미지 분석 및 추출 도구

한글화 작업 1단계용. 디스크 이미지가 무엇인지 식별하고, ISO9660
파일 목록을 뽑고, 이미지 전체의 텍스트 인코딩 분포를 추정한다.

사용법:
    python3 psxtool.py identify  <image.bin>
    python3 psxtool.py ls        <image.bin> [--all]
    python3 psxtool.py extract   <image.bin> <출력디렉터리>
    python3 psxtool.py scan-text <image.bin> [--top N]
"""

import argparse
import os
import struct
import sys

# (섹터 크기, 사용자 데이터 오프셋) 후보. 앞쪽이 더 흔하다.
SECTOR_LAYOUTS = [
    (2352, 24),  # MODE2/FORM1 raw - PS1 디스크의 표준
    (2352, 16),  # MODE1/2352 raw
    (2048, 0),   # 순수 ISO (MODE1/2048)
    (2336, 8),   # MODE2 (sync 없음)
    (2448, 24),  # subchannel 포함
    (2448, 16),
]

USER_DATA = 2048


class Disc:
    """섹터 레이아웃을 자동 판별해서 논리 섹터를 읽어주는 래퍼."""

    def __init__(self, path):
        self.path = path
        self.size = os.path.getsize(path)
        self.f = open(path, "rb")
        self.sector_size = None
        self.data_offset = None
        self._detect_layout()

    def _detect_layout(self):
        # ISO9660 Primary Volume Descriptor는 항상 논리섹터 16에 있고
        # 'CD001' 시그니처로 시작한다. 이걸로 레이아웃을 역산한다.
        for ssize, doff in SECTOR_LAYOUTS:
            pos = 16 * ssize + doff
            if pos + 6 > self.size:
                continue
            self.f.seek(pos)
            head = self.f.read(6)
            if head[1:6] == b"CD001":
                self.sector_size = ssize
                self.data_offset = doff
                return
        raise ValueError(
            "ISO9660 볼륨 디스크립터를 찾지 못했습니다. "
            "오디오 전용 트랙이거나, 압축(.chd/.ecm)되었거나, 손상된 이미지일 수 있습니다."
        )

    @property
    def is_raw(self):
        return self.sector_size != 2048

    def read_sector(self, lba):
        self.f.seek(lba * self.sector_size + self.data_offset)
        return self.f.read(USER_DATA)

    def read_range(self, lba, length):
        out = bytearray()
        while len(out) < length:
            out += self.read_sector(lba)
            lba += 1
        return bytes(out[:length])

    def close(self):
        self.f.close()


def both_endian32(buf, off):
    """ISO9660은 32비트 값을 리틀+빅 양쪽으로 저장한다. 리틀 쪽만 쓴다."""
    return struct.unpack_from("<I", buf, off)[0]


class DirEntry:
    def __init__(self, name, lba, length, is_dir):
        self.name = name
        self.lba = lba
        self.length = length
        self.is_dir = is_dir

    def __repr__(self):
        kind = "DIR " if self.is_dir else "FILE"
        return f"<{kind} {self.name} lba={self.lba} len={self.length}>"


def strip_version(name):
    """ISO9660 파일명 끝의 버전 접미사(FOO.DAT;1 → FOO.DAT)를 뗀다."""
    idx = name.rfind(";")
    return name[:idx] if idx > 0 else name


def parse_dir_record(buf, off):
    """디렉터리 레코드 하나를 파싱. (엔트리, 소비한 바이트) 반환."""
    rec_len = buf[off]
    if rec_len == 0:
        return None, 0
    lba = both_endian32(buf, off + 2)
    length = both_endian32(buf, off + 10)
    flags = buf[off + 25]
    name_len = buf[off + 32]
    raw_name = buf[off + 33: off + 33 + name_len]

    if name_len == 1 and raw_name in (b"\x00", b"\x01"):
        name = "." if raw_name == b"\x00" else ".."
    else:
        name = raw_name.decode("ascii", errors="replace")

    return DirEntry(name, lba, length, bool(flags & 0x02)), rec_len


def read_directory(disc, lba, length):
    """디렉터리 하나의 엔트리 목록을 읽는다. . 과 .. 은 제외."""
    data = disc.read_range(lba, length)
    entries = []
    # 레코드는 섹터 경계를 넘지 않는다. 섹터 단위로 순회한다.
    for base in range(0, len(data), USER_DATA):
        chunk = data[base: base + USER_DATA]
        off = 0
        while off < len(chunk):
            if chunk[off] == 0:
                break  # 이 섹터의 남은 부분은 패딩
            entry, consumed = parse_dir_record(chunk, off)
            if entry is None:
                break
            if entry.name not in (".", ".."):
                entries.append(entry)
            off += consumed
    return entries


def walk(disc, lba, length, prefix="", depth=0, max_depth=16):
    """루트부터 재귀적으로 전체 파일 트리를 만든다."""
    if depth > max_depth:
        return
    for entry in read_directory(disc, lba, length):
        path = f"{prefix}/{entry.name}"
        yield path, entry
        if entry.is_dir:
            yield from walk(disc, entry.lba, entry.length, path, depth + 1, max_depth)


def get_pvd(disc):
    pvd = disc.read_sector(16)
    return {
        "system_id": pvd[8:40].decode("ascii", "replace").strip(),
        "volume_id": pvd[40:72].decode("ascii", "replace").strip(),
        "total_sectors": both_endian32(pvd, 80),
        "root_lba": both_endian32(pvd, 158),
        "root_len": both_endian32(pvd, 166),
        "publisher": pvd[318:446].decode("ascii", "replace").strip(),
        "application": pvd[574:702].decode("ascii", "replace").strip(),
    }


def has_joliet(disc):
    """보조 볼륨 디스크립터(Joliet)가 있으면 파일명이 UCS-2로도 들어있다."""
    lba = 17
    while lba < 32:
        vd = disc.read_sector(lba)
        if vd[1:6] != b"CD001":
            return False
        if vd[0] == 255:  # terminator
            return False
        if vd[0] == 2 and vd[88:91] in (b"%/@", b"%/C", b"%/E"):
            return True
        lba += 1
    return False


# ---------------------------------------------------------------- 명령어

def cmd_identify(args):
    disc = Disc(args.image)
    pvd = get_pvd(disc)

    print(f"파일          : {args.image}")
    print(f"크기          : {disc.size:,} bytes ({disc.size / 1024 / 1024:.1f} MB)")
    print(f"섹터 레이아웃 : {disc.sector_size} bytes/sector, 데이터 오프셋 {disc.data_offset}")
    if disc.sector_size == 2352 and disc.data_offset == 24:
        print("                → MODE2/FORM1 raw. PS1 디스크의 전형적인 형태입니다.")
    elif disc.sector_size == 2048:
        print("                → 순수 ISO(MODE1/2048). PC 데이터 CD를 ISO로 뜬 형태입니다.")
    print(f"볼륨 레이블   : {pvd['volume_id']}")
    print(f"시스템 ID     : {pvd['system_id']}")
    if pvd["publisher"]:
        print(f"퍼블리셔      : {pvd['publisher']}")
    if pvd["application"]:
        print(f"애플리케이션  : {pvd['application']}")
    print(f"총 섹터 수    : {pvd['total_sectors']:,}")
    print(f"Joliet 확장   : {'있음' if has_joliet(disc) else '없음'}")

    entries = list(walk(disc, pvd["root_lba"], pvd["root_len"]))
    files = [e for _, e in entries if not e.is_dir]
    print(f"파일 개수     : {len(files)} (디렉터리 {len(entries) - len(files)}개)")

    # --- 플랫폼 판정
    print()
    names = {strip_version(p).upper() for p, _ in entries}
    verdict = []

    cnf = next((e for p, e in entries
                if strip_version(p).upper().endswith("/SYSTEM.CNF")), None)
    if cnf:
        body = disc.read_range(cnf.lba, cnf.length).decode("ascii", "replace")
        print("SYSTEM.CNF 발견 — PlayStation 디스크입니다:")
        for line in body.splitlines():
            if line.strip():
                print(f"    {line.strip()}")
        verdict.append("PlayStation")
    else:
        print("SYSTEM.CNF 없음 — PlayStation 부팅 디스크가 아닙니다.")

    exe_like = [p for p in names if p.endswith(".EXE") or p.endswith(".COM")]
    if exe_like:
        print(f"DOS/Windows 실행파일 {len(exe_like)}개 발견: "
              f"{', '.join(sorted(exe_like)[:8])}")
        verdict.append("PC")

    print()
    if verdict == ["PlayStation"]:
        print("판정: PS1 디스크 이미지")
    elif "PC" in verdict and "PlayStation" not in verdict:
        print("판정: PC(DOS/Windows) CD 이미지 — PS1이 아닙니다")
    elif not verdict:
        print("판정: 불명. ls 명령으로 파일 목록을 직접 확인해 주세요.")
    else:
        print(f"판정: 혼재 ({', '.join(verdict)}) — 하이브리드 디스크일 수 있습니다")

    disc.close()


def cmd_ls(args):
    disc = Disc(args.image)
    pvd = get_pvd(disc)
    rows = list(walk(disc, pvd["root_lba"], pvd["root_len"]))
    if not args.all:
        rows = rows[:200]
    for path, e in rows:
        kind = "d" if e.is_dir else "-"
        print(f"{kind} {e.length:>12,}  lba={e.lba:<8} {path}")
    total = len(list(walk(disc, pvd["root_lba"], pvd["root_len"])))
    if not args.all and total > 200:
        print(f"... 총 {total}개 중 200개만 표시. 전체는 --all 을 붙이세요.")
    disc.close()


def cmd_extract(args):
    disc = Disc(args.image)
    pvd = get_pvd(disc)
    count = 0
    for path, e in walk(disc, pvd["root_lba"], pvd["root_len"]):
        clean = "/".join(strip_version(part) for part in path.lstrip("/").split("/"))
        dest = os.path.join(args.outdir, clean)
        if e.is_dir:
            os.makedirs(dest, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as out:
            out.write(disc.read_range(e.lba, e.length))
        count += 1
        if count % 100 == 0:
            print(f"  {count}개 추출...", file=sys.stderr)
    print(f"{count}개 파일을 {args.outdir} 에 추출했습니다.")
    disc.close()


def cmd_scan_text(args):
    """이미지 전체를 훑어서 어떤 문자 인코딩이 얼마나 들어있는지 센다.

    대사가 일본어인지 한국어인지, 어느 영역(LBA)에 몰려 있는지를
    빠르게 파악하기 위한 통계다. 정밀한 덤프가 아니라 어디를 팔지
    정하기 위한 지도에 가깝다.
    """
    size = os.path.getsize(args.image)
    counts = {"sjis_kana": 0, "sjis_kanji": 0, "euckr_hangul": 0,
              "euckr_hanja": 0, "johab": 0, "ascii_text": 0}
    # 1MB 단위로 어느 구간에 몰려있는지도 같이 센다
    buckets = {}

    CHUNK = 1 << 20
    with open(args.image, "rb") as f:
        offset = 0
        carry = b""
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            buf = carry + chunk
            local = {"sjis": 0, "euckr": 0}
            i = 0
            limit = len(buf) - 1
            while i < limit:
                b0 = buf[i]
                b1 = buf[i + 1]
                if 0x81 <= b0 <= 0x9F or 0xE0 <= b0 <= 0xEF:
                    # Shift-JIS 2바이트 영역
                    if 0x40 <= b1 <= 0xFC and b1 != 0x7F:
                        if b0 == 0x82 and 0x9F <= b1 <= 0xF1:
                            counts["sjis_kana"] += 1   # 히라가나
                        elif b0 == 0x83 and 0x40 <= b1 <= 0x96:
                            counts["sjis_kana"] += 1   # 가타카나
                        else:
                            counts["sjis_kanji"] += 1
                        local["sjis"] += 1
                        i += 2
                        continue
                if 0xB0 <= b0 <= 0xC8 and 0xA1 <= b1 <= 0xFE:
                    counts["euckr_hangul"] += 1        # 완성형 한글
                    local["euckr"] += 1
                    i += 2
                    continue
                if 0xCA <= b0 <= 0xFD and 0xA1 <= b1 <= 0xFE:
                    counts["euckr_hanja"] += 1         # EUC-KR 한자
                    i += 2
                    continue
                if 0x88 <= b0 <= 0xD3 and b1 >= 0x31:
                    counts["johab"] += 1               # 조합형 추정(노이즈 많음)
                if 0x20 <= b0 < 0x7F:
                    counts["ascii_text"] += 1
                i += 1

            mb = offset // CHUNK
            if local["sjis"] > 200 or local["euckr"] > 200:
                buckets[mb] = local
            carry = buf[-1:]
            offset += len(chunk)

    print("전체 인코딩 분포 (2바이트 문자 추정 개수)")
    print("-" * 46)
    for k, v in counts.items():
        print(f"  {k:<14} {v:>12,}")

    jp = counts["sjis_kana"]
    kr = counts["euckr_hangul"]
    print()
    print(f"  일본어 가나 : {jp:,}")
    print(f"  한글 완성형 : {kr:,}")
    if jp > kr * 3:
        print("  → 일본어 텍스트가 지배적입니다. 일본어 → 한국어 번역이 필요합니다.")
    elif kr > jp * 3:
        print("  → 한국어 텍스트가 지배적입니다. 이미 한글 스크립트가 들어있습니다.")
    else:
        print("  → 판정 보류. 두 인코딩의 바이트 범위가 겹쳐 오탐이 섞였을 수 있습니다.")

    if buckets:
        print()
        print(f"텍스트가 몰려 있는 구간 (상위 {args.top}개, MB 오프셋 기준)")
        print("-" * 46)
        ranked = sorted(buckets.items(),
                        key=lambda kv: kv[1]["sjis"] + kv[1]["euckr"],
                        reverse=True)
        for mb, c in ranked[:args.top]:
            print(f"  {mb:>5} MB  sjis={c['sjis']:>7,}  euckr={c['euckr']:>7,}")


def main():
    # head/less 로 파이프할 때 BrokenPipeError 대신 조용히 끝나도록
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (AttributeError, ValueError, ImportError):
        pass  # Windows에는 SIGPIPE가 없다

    ap = argparse.ArgumentParser(description="PS1/PC CD 이미지 분석 도구")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("identify", help="디스크 종류와 플랫폼 판정")
    p.add_argument("image")
    p.set_defaults(func=cmd_identify)

    p = sub.add_parser("ls", help="ISO9660 파일 목록 출력")
    p.add_argument("image")
    p.add_argument("--all", action="store_true", help="200개 제한 없이 전부 출력")
    p.set_defaults(func=cmd_ls)

    p = sub.add_parser("extract", help="모든 파일을 디렉터리로 추출")
    p.add_argument("image")
    p.add_argument("outdir")
    p.set_defaults(func=cmd_extract)

    p = sub.add_parser("scan-text", help="이미지 전체 텍스트 인코딩 분포 추정")
    p.add_argument("image")
    p.add_argument("--top", type=int, default=20)
    p.set_defaults(func=cmd_scan_text)

    args = ap.parse_args()
    try:
        args.func(args)
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
