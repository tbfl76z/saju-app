#!/usr/bin/env python3
"""
mipsdis - PS1(MIPS R3000A) 실행파일 미니 디스어셈블러

폰트 렌더러·문자열 처리 루틴을 읽기 위한 최소 도구. 의존성 없음.
PS-X EXE 헤더를 읽어 파일 오프셋 ↔ RAM 주소를 자동 변환하고,
`lui`+`addiu/lw/sw/…` 쌍은 합성된 32비트 주소를 주석으로 붙인다.

사용법:
    python3 mipsdis.py <EXE> <시작주소> [--len N워드] [--end 주소]
    python3 mipsdis.py <EXE> 0x80019A00 --len 200
    python3 mipsdis.py <EXE> --find-ref 0x8001C0F0     # 이 주소를 lui/addiu 로 만드는 곳 찾기
    python3 mipsdis.py <EXE> --calls 0x80019A00        # 이 함수를 jal 하는 곳 찾기

주소는 RAM 주소(0x8xxxxxxx) 또는 파일 오프셋 둘 다 받는다(0x80000000 미만이면 파일 오프셋).
"""

import argparse
import struct
import sys

REG = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
       "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]

SPECIAL = {0: "sll", 2: "srl", 3: "sra", 4: "sllv", 6: "srlv", 7: "srav", 8: "jr", 9: "jalr",
           12: "syscall", 13: "break", 16: "mfhi", 17: "mthi", 18: "mflo", 19: "mtlo",
           24: "mult", 25: "multu", 26: "div", 27: "divu", 32: "add", 33: "addu", 34: "sub", 35: "subu",
           36: "and", 37: "or", 38: "xor", 39: "nor", 42: "slt", 43: "sltu"}
IMM = {8: "addi", 9: "addiu", 10: "slti", 11: "sltiu", 12: "andi", 13: "ori", 14: "xori"}
LOADSTORE = {32: "lb", 33: "lh", 34: "lwl", 35: "lw", 36: "lbu", 37: "lhu", 38: "lwr",
             40: "sb", 41: "sh", 42: "swl", 43: "sw", 46: "swr", 50: "lwc2", 58: "swc2"}
BRANCH = {4: "beq", 5: "bne", 6: "blez", 7: "bgtz"}
REGIMM = {0: "bltz", 1: "bgez", 16: "bltzal", 17: "bgezal"}


def s16(v):
    return v - 0x10000 if v & 0x8000 else v


def hexs(v):
    return f"-0x{-v:X}" if v < 0 else f"0x{v:X}"


def decode(pc, w):
    op = w >> 26
    rs, rt, rd = (w >> 21) & 31, (w >> 16) & 31, (w >> 11) & 31
    sa, fn, imm = (w >> 6) & 31, w & 63, w & 0xFFFF
    R = lambda r: "$" + REG[r]
    if w == 0:
        return "nop"
    if op == 0:
        m = SPECIAL.get(fn, f"special{fn}")
        if fn in (0, 2, 3):
            return f"{m} {R(rd)}, {R(rt)}, {sa}"
        if fn in (4, 6, 7):
            return f"{m} {R(rd)}, {R(rt)}, {R(rs)}"
        if fn == 8:
            return f"jr {R(rs)}"
        if fn == 9:
            return f"jalr {R(rd)}, {R(rs)}" if rd != 31 else f"jalr {R(rs)}"
        if fn in (12, 13):
            return m
        if fn in (16, 18):
            return f"{m} {R(rd)}"
        if fn in (17, 19):
            return f"{m} {R(rs)}"
        if fn in (24, 25, 26, 27):
            return f"{m} {R(rs)}, {R(rt)}"
        if fn == 37 and rt == 0:
            return f"move {R(rd)}, {R(rs)}"
        return f"{m} {R(rd)}, {R(rs)}, {R(rt)}"
    if op == 1:
        m = REGIMM.get(rt, f"regimm{rt}")
        return f"{m} {R(rs)}, 0x{pc + 4 + s16(imm) * 4:08X}"
    if op in (2, 3):
        return f"{'j' if op == 2 else 'jal'} 0x{((pc + 4) & 0xF0000000) | ((w & 0x3FFFFFF) << 2):08X}"
    if op in BRANCH:
        tgt = pc + 4 + s16(imm) * 4
        if op in (4, 5):
            if op == 4 and rs == 0 and rt == 0:
                return f"b 0x{tgt:08X}"
            return f"{BRANCH[op]} {R(rs)}, {R(rt)}, 0x{tgt:08X}"
        return f"{BRANCH[op]} {R(rs)}, 0x{tgt:08X}"
    if op in IMM:
        if op in (12, 13, 14):
            return f"{IMM[op]} {R(rt)}, {R(rs)}, 0x{imm:X}"
        if op == 9 and rs == 0:
            return f"li {R(rt)}, {hexs(s16(imm))}"
        return f"{IMM[op]} {R(rt)}, {R(rs)}, {hexs(s16(imm))}"
    if op == 15:
        return f"lui {R(rt)}, 0x{imm:X}"
    if op in LOADSTORE:
        return f"{LOADSTORE[op]} {R(rt)}, {hexs(s16(imm))}({R(rs)})"
    if op == 16:
        return f"cop0 0x{w & 0x3FFFFFF:07X}"
    if op == 18:
        return f"cop2 0x{w & 0x3FFFFFF:07X}"
    return f".word 0x{w:08X}"


class Exe:
    def __init__(self, path):
        self.data = open(path, "rb").read()
        if self.data[:8] != b"PS-X EXE":
            sys.exit("PS-X EXE 헤더가 아닙니다.")
        self.pc0 = struct.unpack_from("<I", self.data, 0x10)[0]
        self.base = struct.unpack_from("<I", self.data, 0x18)[0]
        self.size = struct.unpack_from("<I", self.data, 0x1C)[0]

    def to_file(self, addr):
        if addr >= 0x80000000:
            return addr - self.base + 0x800
        return addr

    def to_ram(self, off):
        return off - 0x800 + self.base

    def word(self, addr):
        return struct.unpack_from("<I", self.data, self.to_file(addr))[0]

    def words(self):
        n = (len(self.data) - 0x800) // 4
        return struct.unpack_from(f"<{n}I", self.data, 0x800)


def disasm(exe, start, count, out=sys.stdout):
    """lui 쌍을 추적해 합성 주소를 주석으로 단다."""
    hi = {}
    for i in range(count):
        pc = start + i * 4
        off = exe.to_file(pc)
        if off + 4 > len(exe.data):
            break
        w = struct.unpack_from("<I", exe.data, off)[0]
        txt = decode(pc, w)
        note = ""
        op = w >> 26
        rs, rt, imm = (w >> 21) & 31, (w >> 16) & 31, w & 0xFFFF
        if op == 15:
            hi[rt] = imm << 16
        elif op in (9, 13) and rs in hi:
            v = (hi[rs] + s16(imm)) if op == 9 else (hi[rs] | imm)
            note = f"  ; = 0x{v & 0xFFFFFFFF:08X}"
            if rt == rs:
                hi[rt] = v
            else:
                hi.pop(rt, None)
        elif op in LOADSTORE and rs in hi:
            note = f"  ; [0x{(hi[rs] + s16(imm)) & 0xFFFFFFFF:08X}]"
            if op < 40:
                hi.pop(rt, None)
        elif op == 0 or op in IMM or op in LOADSTORE:
            dest = (w >> 11) & 31 if op == 0 else rt
            if op == 0 or op in IMM or (op in LOADSTORE and op < 40):
                hi.pop(dest, None)
        if op == 3 or (op == 0 and (w & 63) in (8, 9)):
            hi.clear()
        out.write(f"{pc:08X}  {w:08X}  {txt}{note}\n")


def find_ref(exe, target):
    """lui/addiu(ori) 또는 lui/lw 로 target 주소를 만드는 명령 쌍을 찾는다."""
    ws = exe.words()
    thi, tlo = target >> 16, target & 0xFFFF
    hits = []
    for i, w in enumerate(ws):
        if (w >> 26) == 15 and (w & 0xFFFF) in (thi, (thi + 1) & 0xFFFF):
            rt = (w >> 16) & 31
            for j in range(i + 1, min(i + 12, len(ws))):
                w2 = ws[j]
                op2 = w2 >> 26
                if op2 in (9, 13) or op2 in LOADSTORE:
                    if ((w2 >> 21) & 31) == rt:
                        lo = s16(w2 & 0xFFFF) if op2 != 13 else (w2 & 0xFFFF)
                        if (((w & 0xFFFF) << 16) + lo) & 0xFFFFFFFF == target:
                            hits.append(exe.to_ram(0x800 + i * 4))
                        break
                if (w2 >> 26) == 15 and ((w2 >> 16) & 31) == rt:
                    break
    return hits


def find_calls(exe, target):
    ws = exe.words()
    enc = 0x0C000000 | ((target & 0x0FFFFFFF) >> 2)
    return [exe.to_ram(0x800 + i * 4) for i, w in enumerate(ws) if w == enc]


def main():
    ap = argparse.ArgumentParser(description="PS1 MIPS 미니 디스어셈블러")
    ap.add_argument("exe")
    ap.add_argument("start", nargs="?", help="시작 주소(RAM 또는 파일 오프셋, hex)")
    ap.add_argument("--len", type=int, default=64, help="워드 수 (기본 64)")
    ap.add_argument("--end", help="끝 주소")
    ap.add_argument("--find-ref", help="이 주소를 참조(lui/addiu, lui/lw)하는 명령 위치")
    ap.add_argument("--calls", help="이 함수를 jal 하는 위치")
    a = ap.parse_args()
    exe = Exe(a.exe)
    if a.find_ref:
        t = int(a.find_ref, 16)
        for h in find_ref(exe, t):
            print(f"0x{h:08X}")
        return
    if a.calls:
        t = int(a.calls, 16)
        for h in find_calls(exe, t):
            print(f"0x{h:08X}")
        return
    if not a.start:
        print(f"PS-X EXE  base=0x{exe.base:08X} size=0x{exe.size:X} pc0=0x{exe.pc0:08X}")
        return
    start = int(a.start, 16)
    if start < 0x80000000:
        start = exe.to_ram(start)
    count = a.len if not a.end else (int(a.end, 16) - start) // 4
    disasm(exe, start, count)


if __name__ == "__main__":
    main()
