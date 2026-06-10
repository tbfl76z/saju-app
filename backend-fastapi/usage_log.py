"""
접속 로그·사용량 집계 모듈
- sqlite 표준 라이브러리만 사용. 요청 1건당 1행 기록, /admin/stats로 일별 집계 조회.
- 주의: Render 무료 티어는 재배포 시 파일이 초기화됨 (Starter의 영속 디스크 또는 USAGE_DB_PATH로 보존 가능)
"""
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

DB_PATH = os.getenv("USAGE_DB_PATH", os.path.join(os.path.dirname(__file__), "usage.db"))

# 한국 시간 기준으로 '하루'를 집계한다
KST = timezone(timedelta(hours=9))

# AI(LLM) 토큰을 소모하는 경로 — 사용량 모니터링의 핵심 지표
AI_PATHS = ("/analyze", "/analyze/stream", "/learn/tutor", "/learn/grade")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,           -- ISO (KST)
            day TEXT NOT NULL,          -- YYYY-MM-DD (KST)
            ip TEXT,
            method TEXT,
            path TEXT,
            status INTEGER,
            ms INTEGER,                 -- 처리 시간
            ua TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_access_day ON access_log(day)")
    return conn


def log_request(ip: str, method: str, path: str, status: int, ms: int, ua: str) -> None:
    """요청 1건 기록 (실패해도 본 요청에 영향 주지 않도록 호출부에서 예외를 삼킨다)."""
    now = datetime.now(KST)
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO access_log (ts, day, ip, method, path, status, ms, ua) VALUES (?,?,?,?,?,?,?,?)",
            (now.isoformat(timespec="seconds"), now.strftime("%Y-%m-%d"),
             ip[:64], method[:8], path[:200], status, ms, (ua or "")[:200]),
        )
        conn.commit()
    finally:
        conn.close()


def get_stats(days: int = 7) -> dict[str, Any]:
    """최근 N일 사용량 집계: 일별 요청·고유IP·AI호출, 경로 TOP, 최근 방문 IP 요약."""
    days = max(1, min(days, 90))
    since = (datetime.now(KST) - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    conn = _connect()
    try:
        daily = conn.execute(
            """
            SELECT day,
                   COUNT(*) AS requests,
                   COUNT(DISTINCT ip) AS unique_ips,
                   SUM(CASE WHEN path IN ({ph}) THEN 1 ELSE 0 END) AS ai_calls,
                   SUM(CASE WHEN path LIKE '/learn%' THEN 1 ELSE 0 END) AS learn_calls,
                   SUM(CASE WHEN path = '/calculate' THEN 1 ELSE 0 END) AS calc_calls
            FROM access_log WHERE day >= ?
            GROUP BY day ORDER BY day DESC
            """.format(ph=",".join("?" * len(AI_PATHS))),
            (*AI_PATHS, since),
        ).fetchall()
        top_paths = conn.execute(
            "SELECT path, COUNT(*) c FROM access_log WHERE day >= ? GROUP BY path ORDER BY c DESC LIMIT 15",
            (since,),
        ).fetchall()
        visitors = conn.execute(
            """
            SELECT ip, COUNT(*) c, MIN(ts) first_seen, MAX(ts) last_seen
            FROM access_log WHERE day >= ? GROUP BY ip ORDER BY c DESC LIMIT 20
            """,
            (since,),
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*), COUNT(DISTINCT ip) FROM access_log WHERE day >= ?", (since,)
        ).fetchone()
    finally:
        conn.close()
    return {
        "period_days": days,
        "since": since,
        "total_requests": total[0],
        "total_unique_ips": total[1],
        "daily": [
            {"day": d, "requests": r, "unique_ips": u, "ai_calls": a, "learn_calls": l, "calc_calls": c}
            for d, r, u, a, l, c in daily
        ],
        "top_paths": [{"path": p, "count": c} for p, c in top_paths],
        "visitors": [
            {"ip": ip, "requests": c, "first_seen": f, "last_seen": ls}
            for ip, c, f, ls in visitors
        ],
    }
