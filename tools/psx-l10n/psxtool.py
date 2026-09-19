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


# 랜덤 바이트에서 각 언어의 2바이트 쌍이 우연히 나타날 확률
#   EUC-KR 한글 : 선행 0xB0~0xC8(25종) × 후행 0xA1~0xFE(94종) / 65536
#   Shift-JIS   : 선행 0x81~0x9F,0xE0~0xEF(47종) × 후행 0x40~0xFC(188종) / 65536
# 일본어 쪽이 4배 가까이 넓어서, 같은 기준을 쓰면 랜덤 데이터가
# 전부 "일본어"로 판정된다.
P_PAIR = {"kr": (25 * 94) / 65536, "jp": (47 * 188) / 65536}

# 가나 필터("가나가 25% 이상")를 통과하는 우연한 덩어리의 비율.
# 64MB 랜덤 데이터로 실측한 값이다(402개 중 24개 통과 = 0.06).
# 이론 추정치(0.005)를 쓰면 기대치를 과소평가해 랜덤을 텍스트로 오판한다.
KANA_FACTOR = {"kr": 1.0, "jp": 0.06}

# 덩어리 안에 끼어도 문장이 이어지는 것으로 보는 1바이트 문자.
# 한국어는 띄어쓰기가 잦아 이걸 허용하지 않으면 덩어리가 잘게 쪼개진다.
CONNECTORS = set(b" \t\r\n.,!?'\"-~()")

MIN_KANA_RATIO = 0.25


def _run_kind(b0, b1):
    """이 2바이트 쌍이 한글인지 일본어인지 판정.

    EUC-KR 한글 선행바이트(0xB0~0xC8)는 Shift-JIS의 선행바이트 범위
    (0x81~0x9F, 0xE0~0xEF)와 겹치지 않는다. 덕분에 둘을 구분할 수 있다.
    """
    if 0xB0 <= b0 <= 0xC8 and 0xA1 <= b1 <= 0xFE:
        return "kr"
    if (0x81 <= b0 <= 0x9F or 0xE0 <= b0 <= 0xEF) and 0x40 <= b1 <= 0xFC and b1 != 0x7F:
        return "jp"
    return None


def _is_kana(b0, b1):
    """히라가나(0x82 0x9F~0xF1) 또는 가타카나(0x83 0x40~0x96)."""
    return (b0 == 0x82 and 0x9F <= b1 <= 0xF1) or (b0 == 0x83 and 0x40 <= b1 <= 0x96)


def scan_runs(buf, base, min_run, seen_end):
    """연속된 2바이트 문자의 '덩어리'를 찾는다.

    개수만 세는 방식은 700MB급 이미지에서 무용지물이다. 그래픽·음성
    데이터에서만 수백만 건의 오탐이 나온다. 대신 '연속'을 본다.
    한글 6글자가 연달아 나올 우연 확률은 0.036^6 ≈ 2e-9 이라,
    700MB를 다 뒤져도 우연히는 거의 나오지 않는다.

    일본어는 바이트 범위가 넓어 이것만으로는 부족해서, 가나가 일정
    비율 이상 섞여 있을 것을 추가로 요구한다. 실제 일본어 문장은
    가나가 반 이상이지만, 우연히 만들어진 덩어리는 희귀한 한자뿐이다.
    """
    runs = []
    i, n = 0, len(buf) - 1
    while i < n:
        kind = _run_kind(buf[i], buf[i + 1])
        if kind is None:
            i += 1
            continue

        start = i
        chars = kana = 0
        last_end = i
        while i < n:
            if _run_kind(buf[i], buf[i + 1]) == kind:
                if kind == "jp" and _is_kana(buf[i], buf[i + 1]):
                    kana += 1
                chars += 1
                i += 2
                last_end = i
                continue
            # 띄어쓰기·문장부호는 덩어리를 끊지 않는다 (뒤에 같은 언어가 이어질 때만)
            if (buf[i] in CONNECTORS and i + 2 < n
                    and _run_kind(buf[i + 1], buf[i + 2]) == kind):
                i += 1
                continue
            break

        if chars < min_run or base + start < seen_end:
            continue
        if kind == "jp" and kana < max(1, int(chars * MIN_KANA_RATIO)):
            continue        # 가나 없는 한자 나열 = 우연히 만들어진 덩어리

        raw = bytes(buf[start:last_end])
        try:
            text = raw.decode("euc-kr" if kind == "kr" else "shift_jis")
        except UnicodeDecodeError:
            continue        # 디코딩 실패 = 진짜 텍스트가 아님

        runs.append((base + start, text, kind, chars, last_end - start))
    return runs


def cmd_scan_text(args):
    """이미지 전체에서 '연속된 문자 덩어리'를 찾아 언어를 판정한다."""
    CHUNK = 8 << 20
    OVERLAP = 64
    size = os.path.getsize(args.image)

    stats = {"kr": 0, "jp": 0}
    longest = {"kr": (0, 0), "jp": (0, 0)}
    samples = {"kr": [], "jp": []}
    seen_end = 0

    with open(args.image, "rb") as f:
        carry, carry_base, pos = b"", 0, 0
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            buf = carry + chunk
            base = carry_base if carry else pos

            for off, text, kind, chars, nbytes in scan_runs(buf, base, args.min_run, seen_end):
                stats[kind] += 1
                seen_end = off + nbytes
                if chars > longest[kind][0]:
                    longest[kind] = (chars, off)
                if len(samples[kind]) < args.samples:
                    samples[kind].append((off, chars, text[:args.width]))

            pos = base + len(buf)
            carry = buf[-OVERLAP:]
            carry_base = pos - OVERLAP

    print(f"파일 크기 : {size:,} bytes")
    print(f"판정 기준 : {args.min_run}글자 이상 연속 (띄어쓰기 허용)")
    print()

    for kind, label in (("kr", "한국어"), ("jp", "일본어")):
        # 이 크기의 랜덤 데이터에서 우연히 나올 것으로 기대되는 개수
        noise = size * (P_PAIR[kind] ** args.min_run) * KANA_FACTOR[kind]
        found = stats[kind]
        print(f"  {label}  덩어리 {found:>8,}개   "
              f"최장 {longest[kind][0]}글자 (오프셋 0x{longest[kind][1]:X})")
        print(f"          우연히 나올 기대치 {noise:.1f}개")
        # 개수보다 강력한 증거는 '최장 덩어리'다. 우연히 6글자가 이어질 수는
        # 있어도, 10글자 이상은 확률적으로 만들어지지 않는다.
        best = longest[kind][0]
        noise_at_best = size * (P_PAIR[kind] ** best) * KANA_FACTOR[kind] if best else 1e9

        if best >= args.min_run and noise_at_best < 0.01:
            print(f"          ✅ {label} 텍스트가 확실히 들어 있습니다.")
            print(f"             (최장 {best}글자 덩어리는 우연으로 설명되지 않음)")
        elif found > max(5, noise * 20):
            print(f"          ✅ {label} 텍스트가 실제로 들어 있습니다.")
        elif found > noise * 3:
            print(f"          ⚠️  {label} 텍스트가 소량 있을 수 있습니다. 샘플을 확인하세요.")
        else:
            print(f"          ❌ 의미 있는 {label} 텍스트 없음 (기대치 수준).")
        print()

    for kind, label, codec in (("kr", "한국어", "euc-kr"), ("jp", "일본어", "shift_jis")):
        if not samples[kind]:
            continue
        print(f"--- {label} 샘플 ({codec}로 디코딩) ---")
        for off, chars, text in samples[kind]:
            print(f"  0x{off:08X} ({chars:3d}글자)  {text}")
        print()

    if not stats["kr"] and not stats["jp"]:
        print("둘 다 없다면 자체 인코딩(폰트 타일 인덱스)을 쓰는 빌드입니다.")
        print("그 경우 폰트 이미지부터 찾아야 합니다: timtool.py scan")


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

    p = sub.add_parser("scan-text", help="연속된 문자 덩어리를 찾아 언어 판정")
    p.add_argument("image")
    p.add_argument("--min-run", type=int, default=6,
                   help="몇 글자 이상 연속돼야 텍스트로 볼지 (기본 6)")
    p.add_argument("--samples", type=int, default=15, help="언어별 샘플 개수")
    p.add_argument("--width", type=int, default=40, help="샘플 표시 길이")
    p.set_defaults(func=cmd_scan_text)

    args = ap.parse_args()
    try:
        args.func(args)
    except ValueError as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
