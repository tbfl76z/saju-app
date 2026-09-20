#!/usr/bin/env python3
"""
gdbclient - DuckStation GDB 서버에 붙어 PS1 메모리·브레이크포인트를 다루는 최소 클라이언트

DuckStation 은 `settings.ini` 의 `[Debug] EnableGDBServer = true` 로 GDB 원격 서버를
연다(기본 포트 2345). GUI 디버거를 손으로 만지지 않고도 브레이크포인트를 걸고
레지스터·메모리를 읽을 수 있다.

WSL 에서는 Windows 루프백에 직접 못 붙으므로 중계가 필요하다:

    powershell.exe -File relay.ps1        # 0.0.0.0:2346 → 127.0.0.1:2345
    python3 gdbclient.py --host $(ip route | awk '/default/{print $3}') --port 2346 ...

사용법:
    python3 gdbclient.py info
    python3 gdbclient.py read 0x801E28AA 64
    python3 gdbclient.py watch 0x801E28AA --len 4 --kind write
    python3 gdbclient.py wait --timeout 120        # 멈출 때까지 기다렸다 PC 출력

의존성 없음.
"""

import argparse
import socket
import sys
import time

REG_NAMES = (["zero","at","v0","v1","a0","a1","a2","a3","t0","t1","t2","t3","t4","t5","t6","t7",
              "s0","s1","s2","s3","s4","s5","s6","s7","t8","t9","k0","k1","gp","sp","fp","ra"]
             + ["sr","lo","hi","bad","cause","pc"])


class Gdb:
    def __init__(self, host, port, timeout=10):
        self.s = socket.create_connection((host, port), timeout=timeout)
        self.s.settimeout(timeout)
        self.buf = b""

    def close(self):
        try:
            self.s.close()
        except OSError:
            pass

    @staticmethod
    def _cksum(data):
        return f"{sum(data) & 0xFF:02x}".encode()

    def send(self, cmd):
        data = cmd.encode()
        self.s.sendall(b"$" + data + b"#" + self._cksum(data))
        # ack
        while True:
            c = self._recv_byte()
            if c == b"+":
                return
            if c == b"-":
                self.s.sendall(b"$" + data + b"#" + self._cksum(data))
            # 그 밖의 바이트는 무시(비동기 알림 등)

    def _recv_byte(self):
        if not self.buf:
            self.buf = self.s.recv(4096)
            if not self.buf:
                raise ConnectionError("연결이 끊겼습니다.")
        c, self.buf = self.buf[:1], self.buf[1:]
        return c

    def recv(self, timeout=None):
        """다음 패킷 본문을 돌려준다."""
        old = self.s.gettimeout()
        if timeout is not None:
            self.s.settimeout(timeout)
        try:
            while True:
                c = self._recv_byte()
                if c != b"$":
                    continue
                out = b""
                while True:
                    c = self._recv_byte()
                    if c == b"#":
                        break
                    out += c
                self._recv_byte()
                self._recv_byte()          # 체크섬 2바이트
                self.s.sendall(b"+")
                return out.decode(errors="replace")
        finally:
            self.s.settimeout(old)

    def cmd(self, c, timeout=None):
        self.send(c)
        return self.recv(timeout)


def regs(g):
    """r0~r31, sr, lo, hi, bad, cause, pc. 값이 없는 레지스터는 'xxxx' 로 온다."""
    raw = g.cmd("g")
    out = []
    for i in range(0, len(raw), 8):
        w = raw[i:i + 8]
        try:
            out.append(int.from_bytes(bytes.fromhex(w), "little"))
        except ValueError:
            out.append(None)
    return out


def cmd_info(a, g):
    print("정지 사유:", g.cmd("?"))
    print("qSupported:", g.cmd("qSupported")[:200])
    v = regs(g)
    print(f"레지스터 {len(v)}개")
    for i, x in enumerate(v[:len(REG_NAMES)]):
        name = REG_NAMES[i]
        val = f"0x{x:08X}" if x is not None else "  (없음)  "
        print(f"  {name:<5} {val}", end="\n" if i % 4 == 3 else "   ")
    print()


def cmd_read(a, g):
    out = g.cmd(f"m{a.addr:x},{a.length:x}")
    if out.startswith("E"):
        sys.exit(f"읽기 실패: {out}")
    data = bytes.fromhex(out)
    for i in range(0, len(data), 16):
        chunk = data[i:i + 16]
        print(f"  {a.addr + i:08X}  " + " ".join(f"{b:02X}" for b in chunk))


def cmd_watch(a, g):
    kind = {"write": 2, "read": 3, "access": 4}[a.kind]
    r = g.cmd(f"Z{kind},{a.addr:x},{a.length:x}")
    print(f"Z{kind},{a.addr:x},{a.length:x} → {r!r}" + ("  (미지원)" if r == "" else "  OK"))
    if r == "":
        r2 = g.cmd(f"Z0,{a.addr:x},4")
        print(f"  참고: 실행 브레이크포인트 Z0 → {r2!r}")


def cmd_cont(a, g):
    g.send("c")
    print("실행 재개. 멈추기를 기다립니다…")
    try:
        r = g.recv(timeout=a.timeout)
    except socket.timeout:
        print(f"{a.timeout}초 안에 멈추지 않았습니다.")
        return
    print("정지:", r)
    v = regs(g)
    pc = v[37] if len(v) > 37 else None
    print(f"PC = 0x{pc:08X}" if pc is not None else "PC 미확인")
    for i, x in enumerate(v[:32]):
        val = f"0x{x:08X}" if x is not None else "  (없음)  "
        print(f"  {REG_NAMES[i]:<5} {val}", end="\n" if i % 4 == 3 else "   ")
    print()


def main():
    ap = argparse.ArgumentParser(description="DuckStation GDB 서버 클라이언트")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2345)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("info", help="정지 사유·레지스터")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("read", help="메모리 읽기")
    p.add_argument("addr", type=lambda x: int(x, 16))
    p.add_argument("length", type=lambda x: int(x, 0))
    p.set_defaults(func=cmd_read)

    p = sub.add_parser("watch", help="데이터 브레이크포인트")
    p.add_argument("addr", type=lambda x: int(x, 16))
    p.add_argument("--len", dest="length", type=lambda x: int(x, 0), default=4)
    p.add_argument("--kind", default="write", choices=["write", "read", "access"])
    p.set_defaults(func=cmd_watch)

    p = sub.add_parser("cont", help="재개하고 멈출 때까지 대기")
    p.add_argument("--timeout", type=float, default=120)
    p.set_defaults(func=cmd_cont)

    a = ap.parse_args()
    g = Gdb(a.host, a.port)
    try:
        a.func(a, g)
    finally:
        g.close()


if __name__ == "__main__":
    main()
