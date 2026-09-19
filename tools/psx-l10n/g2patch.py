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
    python3 g2patch.py apply  ex/G2DATA1.DAT ex/tr_chars.tsv ex/koremap.tsv -o ex/G2DATA1.ko.DAT

`apply` 는 TSV의 `ko` 열이 빈 행은 건드리지 않으므로, 번역이 진행되는 대로 계속
같은 명령을 다시 돌리면 된다.

의존성: 같은 디렉터리의 koremap.py
"""

import argparse
import os
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


def cmd_exestr(a):
    """EXE 안 NUL 종결 SJIS 문자열과 각자 쓸 수 있는 바이트 수."""
    e = open(a.exe, "rb").read()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import g2text

    rows = []
    for off, codes in g2text.nul_strings(e, min_chars=a.min_chars, kana_min=0.0):
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
        print(f"문자열 {len(rows):,}개 → {a.output}")


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

    p = sub.add_parser("exestr", help="EXE 안 문자열을 번역 TSV로")
    p.add_argument("exe")
    p.add_argument("--min-chars", type=int, default=2)
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
