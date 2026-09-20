#!/usr/bin/env python3
"""
watchbuf - GDB 로 특정 RAM 버퍼에 쓰는 코드를 찾아낸다

DuckStation 의 GDB 서버에 붙어 쓰기 워치포인트를 걸고, 걸릴 때마다 무엇이
어디서 얼마나 썼는지 기록한다. `memset`·`memcpy` 같은 뻔한 것은 반환 주소에
실행 브레이크포인트를 걸어 자동으로 통과시키되, **소스 주소와 복사 직후의
버퍼 상태를 남긴다** — 최종 이미지를 만든 복사의 소스가 곧 원본 위치다.

DuckStation 의 GDB 서버는 `c`(계속) 를 받으면 연결을 끊는다. 그래서 재개는
GUI 디버거의 계속(F5)으로 하고, 이 도구는 `?` 로 상태만 폴링한다.

사용법:
    # Windows 쪽에서 중계 (WSL 은 Windows 루프백에 직접 못 붙는다)
    python.exe relay.py                      # 0.0.0.0:2346 → 127.0.0.1:2345
    # WSL 쪽에서
    python3 watchbuf.py --host $(ip route | awk '/default/{print $3}') \
        --watch 0x801E28AC --probe 0x801E28A8 \
        --expect 00000800040001000100010042020001

    --watch   쓰기를 감시할 주소
    --probe   매 쓰기 후 읽어볼 주소 (기본: --watch 와 같음)
    --expect  이 값이 되면 멈춘다 (16진). 그때의 소스를 덤프한다
"""

import argparse
import os
import socket
import struct
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gdbclient import Gdb, regs                                  # noqa: E402

GP = 0x80124E08
MEMSET = range(0x800ACD24, 0x800ACD50)
MEMCPY = list(range(0x800A4520, 0x800A4618)) + list(range(0x800ACCE4, 0x800ACD14))
IDLE = range(0x800B9F00, 0x800BA100)          # 유휴 루프 — GDB 접속 시 늘 여기서 멈춘다
LBA_G2DATA1, LBA_G2DATA2, LBA_END = 102947, 140305, 274203


def disc_pos(lba):
    if LBA_G2DATA1 <= lba < LBA_G2DATA2:
        return "G2DATA1", (lba - LBA_G2DATA1) * 2048
    if LBA_G2DATA2 <= lba < LBA_END:
        return "G2DATA2", (lba - LBA_G2DATA2) * 2048
    return "?", 0


def main():
    ap = argparse.ArgumentParser(description="RAM 버퍼에 쓰는 코드 추적")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2346)
    ap.add_argument("--watch", type=lambda x: int(x, 16), required=True)
    ap.add_argument("--probe", type=lambda x: int(x, 16))
    ap.add_argument("--expect", help="이 16진 값이 되면 멈춘다")
    ap.add_argument("--probe-len", type=int, default=16)
    ap.add_argument("--outdir", default="dbg")
    ap.add_argument("--timeout", type=float, default=2400)
    a = ap.parse_args()
    probe = a.probe if a.probe is not None else a.watch
    expect = bytes.fromhex(a.expect) if a.expect else None
    os.makedirs(a.outdir, exist_ok=True)

    g = Gdb(a.host, a.port, timeout=8)
    print("접속:", g.cmd("?"), flush=True)

    def arm():
        g.cmd(f"Z2,{a.watch:x},4")

    def disarm():
        g.cmd(f"z2,{a.watch:x},4")

    def gpw(off):
        return struct.unpack("<I", bytes.fromhex(g.cmd(f"m{GP + off:x},4")))[0]

    def read(addr, n):
        return bytes.fromhex(g.cmd(f"m{addr:x},{n:x}"))

    def stable_pc():
        """정지 여부 확인 — PC 가 두 번 연속 같아야 실제로 멈춘 것."""
        v = regs(g)
        pc = v[37]
        time.sleep(0.22)
        return (pc if regs(g)[37] == pc else None), v

    arm()
    state, skip_at, pend, seen, n, t0 = "ARMED", None, None, set(), 0, time.time()
    log = open(os.path.join(a.outdir, "watchbuf.log"), "a", encoding="utf-8")

    def emit(s):
        print(s, flush=True)
        log.write(s + "\n")
        log.flush()

    emit(f"감시 0x{a.watch:08X}, 확인 0x{probe:08X}. GUI 디버거에서 계속(F5) 하세요.")
    while time.time() - t0 < a.timeout:
        try:
            r = g.cmd("?", timeout=6)
        except socket.timeout:
            time.sleep(0.8)
            continue
        except Exception as e:
            emit(f"연결 끊김: {e}")
            break
        pc, v = stable_pc()
        if pc is None or pc in IDLE:
            time.sleep(0.4)
            continue

        if state == "SKIP":
            if pc != skip_at:
                time.sleep(0.4)
                continue
            g.cmd(f"z0,{skip_at:x},4")
            cur = read(probe, a.probe_len)
            if pend:
                kind, a0, a1, a2, ra = pend
                done = expect is not None and cur == expect
                emit(f"   └ {kind} 완료  dest=0x{a0:08X} src=0x{a1:08X} len=0x{a2:X}\n"
                     f"     이후 0x{probe:08X}: {cur.hex(' ')}"
                     + ("\n     ★★★ 최종값 도달 — 원본 = src ★★★" if done else ""))
                if done:
                    for tag, addr, ln in (("src", a1, 0x1000), ("caller", (ra - 0x200) & ~3, 0x400)):
                        try:
                            p = os.path.join(a.outdir, f"FOUND_{tag}_{addr:08X}.bin")
                            open(p, "wb").write(read(addr, ln))
                            emit(f"     {tag} 덤프 → {p}")
                        except Exception as e:
                            emit(f"     {tag} 덤프 실패: {e}")
                    break
                pend = None
            arm()
            state = "ARMED"
            continue

        if not (r.startswith("T05") and "watch" in r):
            time.sleep(0.4)
            continue
        key = (pc, v[4], v[5], v[6])
        if key in seen:
            time.sleep(0.4)
            continue
        seen.add(key)
        n += 1
        kind = "memset" if pc in MEMSET else "memcpy" if pc in MEMCPY else "그리기"
        lba = gpw(0x64C)
        name, off = disc_pos(lba)
        emit(f"\n#{n} [{time.time() - t0:5.1f}s] {kind}  PC=0x{pc:08X} ra=0x{v[31]:08X}  "
             f"a0=0x{v[4]:08X} a1=0x{v[5]:08X} a2=0x{v[6]:X}   최근 LBA={lba:,} ({name} 0x{off:X})")
        if kind == "그리기":
            try:
                p = os.path.join(a.outdir, f"draw_{pc:08X}.bin")
                open(p, "wb").write(read((pc - 0x100) & ~3, 0x200))
                emit(f"   그리기 코드 저장 → {p}")
            except Exception:
                pass
        pend = (kind, v[4], v[5], v[6], v[31])
        disarm()
        g.cmd(f"Z0,{v[31]:x},4")
        skip_at = v[31]
        state = "SKIP"
        emit("   → F5")
    emit(f"\n종료 ({n}건 관찰)")
    g.close()


if __name__ == "__main__":
    main()
