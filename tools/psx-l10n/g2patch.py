#!/usr/bin/env python3
"""
g2patch - 고정 레코드 테이블 / NUL 종결 문자열의 덤프와 제자리 교체

창세기전2 PS1의 인명·아이템·마법·메뉴는 포인터 재계산이 필요 없는 형태로 들어 있다:

- **고정 레코드 테이블**: 일정 간격마다 레코드가 있고 앞쪽 N바이트가 이름
  (캐릭터 0x0, 256바이트 간격, 이름 24바이트 ×2 / 아이템 0xE614, 68바이트 간격)
- **NUL 종결 문자열**: EXE 안 마법명·메뉴. 뒤따르는 0 패딩까지가 쓸 수 있는 공간

둘 다 **원문보다 짧거나 같으면 제자리에 넣을 수 있다.** 번역문은 koremap 대응표로
인코딩하므로 한글 한 글자가 2바이트다(일본어와 동일).

사용법:
    python3 g2patch.py table  ex/G2DATA1.DAT --preset chars -o ex/tr_chars.tsv
    python3 g2patch.py table  ex/G2DATA1.DAT --preset items -o ex/tr_items.tsv
    python3 g2patch.py exestr ex/SLPS_023.11 -o ex/tr_exe.tsv
    python3 g2patch.py exestr ex/G2DATA1.DAT  -o ex/tr_data.tsv
    python3 g2patch.py apply  ex/G2DATA1.DAT ex/tr_chars.tsv ex/koremap.tsv -o ex/G2DATA1.ko.DAT

`apply` 는 TSV의 `ko` 열이 빈 행은 건드리지 않으므로, 번역이 진행되는 대로 계속
같은 명령을 다시 돌리면 된다.

의존성: 같은 디렉터리의 koremap.py
"""

import argparse
import os
import struct
import sys

# 이름: (시작, 레코드 간격, [(이름 필드 오프셋, 최대 바이트, 설명)], 레코드 수 상한, 유효성 검사)
# 유효성 검사는 "이 레코드가 아직 테이블 안인가"를 본다. 테이블 뒤에는 설명문이
# 이어지므로 이름 필드만으로는 경계를 못 잡는다(아이템은 +30의 분류 바이트로 구분).
PRESETS = {
    "chars": (0x0, 0x100, [(0x00, 0x18, "짧은이름"), (0x18, 0x18, "긴이름")], 64,
              lambda d, o: bool(d[o:o + 0x18].strip(b"\x00"))),
    "items": (0xD008, 68, [(0x00, 30, "이름")], 400,
              lambda d, o: d[o + 30] != 0 and d[o + 33] == 0
              and d[o + 30] <= 0x20 and d[o + 31] <= 0x20
              and bool(d[o:o + 30].strip(b"\x00"))),
}


def _koremap():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import koremap
    return koremap


def decode_field(raw):
    b = raw.split(b"\x00")[0]
    try:
        return b.decode("cp932")
    except UnicodeDecodeError:
        return b.decode("cp932", errors="replace")


def cmd_table(a):
    start, stride, fields, maxrec, valid = PRESETS[a.preset]
    if a.start is not None:
        start = int(a.start, 16)
    d = open(a.data, "rb").read()
    out = open(a.output, "w", encoding="utf-8") if a.output else sys.stdout
    out.write("offset\trec\tfield\tmax\ttext\tko\n")
    n = 0
    for k in range(maxrec):
        base = start + k * stride
        if base + stride > len(d):
            break
        if not valid(d, base):
            break
        for foff, fmax, fname in fields:
            o = base + foff
            txt = decode_field(d[o:o + fmax])
            out.write(f"0x{o:08X}\t{k}\t{fname}\t{fmax}\t{txt}\t\n")
        n += 1
    if a.output:
        out.close()
        print(f"레코드 {n}개 × 필드 {len(fields)}개 → {a.output}")
        print("  `ko` 열에 번역을 채우고 apply 하세요. 빈 행은 원문 그대로 둡니다.")


# 게임 UI 문자열에 실제로 나오는 2바이트 문자 범위. 그리스·키릴·괘선은 뺀다
# (코드 영역 바이트가 우연히 그쪽으로 디코딩되는 오탐이 많다).
TEXT_RANGES = [(0x8140, 0x81AC), (0x824F, 0x8258), (0x8260, 0x8279), (0x8281, 0x829A),
               (0x829F, 0x82F1), (0x8340, 0x8396), (0x889F, 0x9872), (0x989F, 0xEAA4)]
WORD_RANGES = [(0x829F, 0x82F1), (0x8340, 0x8396), (0x889F, 0x9872), (0x989F, 0xEAA4)]


def _in(code, ranges):
    return any(lo <= code <= hi for lo, hi in ranges)


EXE_BASE = 0x80010000


def _decode_run(buf, start, limit):
    """start 부터 NUL 까지를 문자 코드 목록으로. 도중에 이상한 바이트가 있으면 None."""
    codes, i = [], start
    while i < limit:
        c = buf[i]
        if c == 0:
            return codes
        if (0x81 <= c <= 0x9F or 0xE0 <= c <= 0xFC) and i + 1 < limit \
                and 0x40 <= buf[i + 1] <= 0xFC and buf[i + 1] != 0x7F:
            codes.append((c << 8) | buf[i + 1])
            i += 2
        elif 0x20 <= c <= 0x7E:
            codes.append(c)
            i += 1
        else:
            return None
    return None


def _plausible(codes, min_double):
    dbl = [c for c in codes if c > 0xFF]
    return (bool(codes) and len(dbl) >= min_double
            and all(_in(c, TEXT_RANGES) for c in dbl)
            and any(_in(c, WORD_RANGES) for c in dbl))


def scan_pool(buf, min_double=2, pointers=False, gap=48):
    """NUL 종결 문자열을 찾는다 [(offset, codes)].

    후보 시작점은 두 가지다:

    1. **NUL 바로 뒤** — 문자열 풀. 구간을 중간부터 보면 안 된다. 코드 영역의
       바이트가 우연히 Shift-JIS 두 글자로 읽히는 일이 잦은데, NUL 부터 NUL 까지
       전부를 요구하면 앞뒤 코드 바이트 때문에 탈락한다.
    2. **포인터가 가리키는 자리** (`pointers=True`) — 마법명 표처럼 포인터 배열
       바로 뒤에 붙어 있어 앞이 NUL 이 아닌 문자열은 1번으로는 못 찾는다.

    여기에 "글자다운 범위" + "가나·한자가 최소 하나" 조건을 더하고, 마지막으로
    **혼자 떨어져 있는 짧은 것**을 버린다. 문자열은 풀에 여럿이 붙어 있거나
    포인터로 참조되거나 셋 글자 이상이다. 코드·폰트 데이터가 우연히 두 글자로
    읽히는 오탐은 이 셋 중 어디에도 해당하지 않는다.
    """
    n = len(buf)
    starts = set()
    pos = 0
    while pos < n:
        end = buf.find(b"\x00", pos)
        if end < 0:
            break
        if end > pos:
            starts.add(pos)
        pos = end + 1
    if pointers:
        cnt = (n - 0x800) // 4
        for v in struct.unpack_from(f"<{cnt}I", buf, 0x800):
            if EXE_BASE <= v < EXE_BASE + n - 0x800:
                starts.add(v - EXE_BASE + 0x800)

    ptr = {s for s in starts if pointers} if False else set()
    if pointers:
        cnt = (n - 0x800) // 4
        ptr = {v - EXE_BASE + 0x800 for v in struct.unpack_from(f"<{cnt}I", buf, 0x800)
               if EXE_BASE <= v < EXE_BASE + n - 0x800}

    found, claimed = [], set()
    for st in sorted(starts):
        if st in claimed:
            continue
        codes = _decode_run(buf, st, n)
        if codes is None or not _plausible(codes, min_double):
            continue
        nb = sum(1 if c < 0x100 else 2 for c in codes)
        # 포인터가 같은 문자열의 중간을 가리키는 경우가 있어 앞선 것이 이긴다
        claimed.update(range(st, st + nb))
        found.append((st, codes, nb))

    out = []
    for i, (st, codes, nb) in enumerate(found):
        if st in ptr or sum(1 for c in codes if c > 0xFF) >= 3:
            out.append((st, codes))
            continue
        near = False
        if i and st - (found[i - 1][0] + found[i - 1][2]) <= gap:
            near = True
        if i + 1 < len(found) and found[i + 1][0] - (st + nb) <= gap:
            near = True
        if near:
            out.append((st, codes))
    return out


def cmd_exestr(a):
    """NUL 종결 문자열과 각자 쓸 수 있는 바이트 수.

    포인터 탐색은 PS-X EXE 에만 의미가 있다(RAM 주소 → 파일 오프셋 환산이 필요).
    데이터 파일에서는 끄지 않으면 엉뚱한 자리를 후보로 잡는다.
    """
    e = open(a.exe, "rb").read()
    use_ptr = e[:8] == b"PS-X EXE" and not a.no_pointers
    rows = []
    for off, codes in scan_pool(e, a.min_double, pointers=use_ptr):
        nb = sum(1 if c < 0x100 else 2 for c in codes)
        end = off + nb + 1                      # NUL 포함
        room = nb
        while end < len(e) and e[end] == 0:     # 뒤따르는 0 패딩도 쓸 수 있다
            room += 1
            end += 1
        txt = "".join(chr(c) if c < 0x100 else bytes([c >> 8, c & 0xFF]).decode("cp932", errors="replace")
                      for c in codes)
        rows.append((off, nb, room, txt))
    out = open(a.output, "w", encoding="utf-8") if a.output else sys.stdout
    out.write("offset\tbytes\tmax\ttext\tko\n")
    for off, nb, room, txt in rows:
        out.write(f"0x{off:08X}\t{nb}\t{room}\t{txt}\t\n")
    if a.output:
        out.close()
        print(f"문자열 {len(rows):,}개 → {a.output}"
              + ("  (포인터 참조 포함)" if use_ptr else ""))


def cmd_apply(a):
    K = _koremap()
    fwd, rev, _ = K.load_map(a.map)
    buf = bytearray(open(a.target, "rb").read())

    applied = over = bad = skipped = 0
    problems = []
    with open(a.tsv, encoding="utf-8") as f:
        head = next(f).rstrip("\n").split("\t")
        io, im, ik = head.index("offset"), head.index("max"), head.index("ko")
        it = head.index("text")
        for line in f:
            t = line.rstrip("\n").split("\t")
            if len(t) <= max(io, im, ik):
                continue
            ko = t[ik].strip()
            if not ko:
                skipped += 1
                continue
            off, room = int(t[io], 16), int(t[im])
            raw, missing = K.encode(ko, fwd)
            if missing:
                bad += 1
                problems.append((t[io], "미매핑 " + "".join(missing), ko))
                continue
            if len(raw) > room:
                over += 1
                problems.append((t[io], f"{len(raw)}바이트 > 공간 {room}", ko))
                continue
            buf[off:off + room] = raw + b"\x00" * (room - len(raw))
            applied += 1

    out = a.output or (a.target + ".ko")
    with open(out, "wb") as f:
        f.write(buf)
    print(f"{applied:,}건 적용, 건너뜀 {skipped:,}, 공간 초과 {over}, 미매핑 {bad} → {out}")
    if problems:
        print("문제 행:")
        for o, why, ko in problems[:20]:
            print(f"  {o}  {why}  [{ko}]")
        if len(problems) > 20:
            print(f"  ... 총 {len(problems)}건")


def main():
    ap = argparse.ArgumentParser(description="고정 레코드/NUL 문자열 덤프·교체")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("table", help="고정 레코드 테이블을 번역 TSV로")
    p.add_argument("data")
    p.add_argument("--preset", required=True, choices=sorted(PRESETS))
    p.add_argument("--start", help="테이블 시작 오프셋(hex)으로 프리셋을 덮어씀")
    p.add_argument("-o", "--output")
    p.set_defaults(func=cmd_table)

    p = sub.add_parser("exestr", help="NUL 종결 문자열을 번역 TSV로 (EXE·데이터 공용)")
    p.add_argument("exe", help="SLPS_023.11 또는 G2DATA1.DAT")
    p.add_argument("--no-pointers", action="store_true", help="포인터 참조 탐색 끄기")
    p.add_argument("--min-double", type=int, default=2, help="2바이트 문자 최소 개수")
    p.add_argument("-o", "--output")
    p.set_defaults(func=cmd_exestr)

    p = sub.add_parser("apply", help="번역 TSV를 제자리에 적용")
    p.add_argument("target", help="G2DATA1.DAT 또는 SLPS_023.11")
    p.add_argument("tsv")
    p.add_argument("map", help="koremap.tsv")
    p.add_argument("-o", "--output")
    p.set_defaults(func=cmd_apply)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
