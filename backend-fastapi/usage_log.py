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


def get_day_stats(day: str) -> dict[str, Any]:
    """특정 일자(YYYY-MM-DD)의 상세: 시간대별 추이·경로·방문자."""
    conn = _connect()
    try:
        total = conn.execute(
            "SELECT COUNT(*), COUNT(DISTINCT ip), SUM(CASE WHEN path IN ({ph}) THEN 1 ELSE 0 END) "
            "FROM access_log WHERE day = ?".format(ph=",".join("?" * len(AI_PATHS))),
            (*AI_PATHS, day),
        ).fetchone()
        hourly = conn.execute(
            "SELECT substr(ts, 12, 2) AS hh, COUNT(*), COUNT(DISTINCT ip) "
            "FROM access_log WHERE day = ? GROUP BY hh ORDER BY hh",
            (day,),
        ).fetchall()
        top_paths = conn.execute(
            "SELECT path, COUNT(*) c FROM access_log WHERE day = ? GROUP BY path ORDER BY c DESC LIMIT 20",
            (day,),
        ).fetchall()
        visitors = conn.execute(
            "SELECT ip, COUNT(*) c, MIN(ts), MAX(ts) FROM access_log WHERE day = ? "
            "GROUP BY ip ORDER BY c DESC LIMIT 30",
            (day,),
        ).fetchall()
    finally:
        conn.close()
    return {
        "day": day,
        "total_requests": total[0] or 0,
        "unique_ips": total[1] or 0,
        "ai_calls": total[2] or 0,
        "hourly": [{"hour": h, "requests": r, "unique_ips": u} for h, r, u in hourly],
        "top_paths": [{"path": p, "count": c} for p, c in top_paths],
        "visitors": [{"ip": ip, "requests": c, "first_seen": f, "last_seen": ls} for ip, c, f, ls in visitors],
    }


def _visitor_label(ip: str) -> str:
    """방문자 IP에 사람이 읽기 쉬운 꼬리표를 단다 (간단 휴리스틱)."""
    if ip in ("127.0.0.1", "::1"):
        return "서버 헬스체크"
    if ip.startswith(("35.", "34.", "104.196.", "146.148.")):
        return "봇 추정 (구글 클라우드)"
    if ip.startswith(("66.249.",)):
        return "구글 검색봇"
    return "사용자"


# 대시보드 공용 스타일 (f-string 밖의 일반 문자열 — 중괄호 이스케이프 불필요)
_CSS = """
  body { font-family: -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
         background: #f8f7f3; color: #1e293b; margin: 0; padding: 20px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin: 28px 0 8px; color: #92722a; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .card { background: #fff; border: 1px solid #e8e0c9; border-radius: 14px; padding: 14px; text-align: center; }
  .card b { display: block; font-size: 26px; color: #bf953f; }
  .card span { font-size: 12px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden;
          border: 1px solid #e8e0c9; font-size: 13px; table-layout: fixed; }
  th { background: #f3edd9; padding: 8px; text-align: center; font-size: 12px; }
  th:first-child { text-align: left; }
  td { padding: 8px; border-top: 1px solid #f1ece0; vertical-align: middle; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  /* 일별 추이/시간대 표: 첫 열·막대 열 넓게, 숫자 열 균등 */
  .t-daily th:nth-child(1) { width: 21%; }
  .t-daily th:nth-child(2) { width: 31%; }
  .t-daily th:nth-child(n+3) { width: 12%; }
  .t-daily td.num, .t-hour td.num { text-align: center; }
  .t-hour th:nth-child(1) { width: 21%; }
  .t-hour th:nth-child(2) { width: 55%; }
  .t-hour th:nth-child(3) { width: 24%; }
  .day { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .daylink { color: #bf953f; font-weight: 700; text-decoration: none; border-bottom: 1px dashed #d4af37; }
  .daylink:hover { color: #92722a; }
  .req { white-space: nowrap; }
  .barwrap { display: inline-block; width: calc(100% - 38px); height: 10px; vertical-align: middle;
             background: #f1ece0; border-radius: 5px; overflow: hidden; }
  .bar { display: block; height: 100%; background: linear-gradient(90deg, #d4af37, #bf953f); border-radius: 5px; }
  .reqnum { display: inline-block; width: 32px; vertical-align: middle; }
  .warn { color: #dc2626; font-weight: 700; }
  .path { font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .dim { color: #94a3b8; font-size: 11px; }
  .empty { color: #94a3b8; text-align: center; }
  .note { font-size: 12px; color: #64748b; margin-top: 24px; line-height: 1.6; }
  .back { display: inline-block; margin-bottom: 12px; color: #bf953f; font-weight: 700; text-decoration: none; }
"""


def render_dashboard_html(stats: dict[str, Any], key: str = "", days: int = 7) -> str:
    """집계 결과를 모바일에서도 보기 좋은 HTML 대시보드로 렌더한다. 날짜 클릭 → 일자 상세."""
    daily = stats["daily"]
    max_req = max([d["requests"] for d in daily], default=1) or 1

    daily_rows = "".join(
        f"<tr><td class='day'><a class='daylink' href='/admin/dashboard?key={key}&days={days}&day={d['day']}'>{d['day']}</a></td>"
        f"<td class='req'><span class='barwrap'><span class='bar' style='width:{max(4, int(d['requests'] / max_req * 100))}%'></span></span>"
        f"<span class='num reqnum'>{d['requests']}</span></td>"
        f"<td class='num'>{d['unique_ips']}</td>"
        f"<td class='num {'warn' if d['ai_calls'] >= 15 else ''}'>{d['ai_calls']}</td>"
        f"<td class='num'>{d['learn_calls']}</td><td class='num'>{d['calc_calls']}</td></tr>"
        for d in daily
    ) or "<tr><td colspan='6' class='empty'>아직 기록이 없습니다</td></tr>"

    path_rows = "".join(
        f"<tr><td class='path'>{p['path']}</td><td class='num'>{p['count']}</td></tr>"
        for p in stats["top_paths"]
    ) or "<tr><td colspan='2' class='empty'>-</td></tr>"

    visitor_rows = "".join(
        f"<tr><td>{v['ip']}</td><td>{_visitor_label(v['ip'])}</td><td class='num'>{v['requests']}</td>"
        f"<td>{v['first_seen'][11:16]}~{v['last_seen'][11:16]}<br><span class='dim'>{v['first_seen'][:10]}</span></td></tr>"
        for v in stats["visitors"]
    ) or "<tr><td colspan='4' class='empty'>-</td></tr>"

    human_visitors = sum(1 for v in stats["visitors"] if _visitor_label(v["ip"]) == "사용자")
    ai_total = sum(d["ai_calls"] for d in daily)

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Destiny Code 사용량</title>
<style>{_CSS}</style></head><body><div class="wrap">
<h1>📊 Destiny Code 사용량 <span class="dim">({stats['since']} ~ 오늘, {stats['period_days']}일)</span></h1>

<div class="cards">
  <div class="card"><b>{stats['total_requests']}</b><span>총 요청</span></div>
  <div class="card"><b>{stats['total_unique_ips']}</b><span>고유 IP</span></div>
  <div class="card"><b>{human_visitors}</b><span>실사용자 추정</span></div>
  <div class="card"><b>{ai_total}</b><span>AI 호출 (비용 발생)</span></div>
</div>

<h2>일별 추이</h2>
<table class="t-daily"><tr><th>날짜</th><th>요청</th><th>방문자</th><th>AI</th><th>학습</th><th>계산</th></tr>{daily_rows}</table>

<h2>많이 쓰인 기능</h2>
<table><tr><th>경로</th><th>횟수</th></tr>{path_rows}</table>

<h2>방문자</h2>
<table><tr><th>IP</th><th>구분</th><th>요청</th><th>활동 시간</th></tr>{visitor_rows}</table>

<p class="note">
· 날짜를 클릭하면 그날의 시간대별 상세를 볼 수 있습니다.<br>
· <b>AI 호출</b>이 하루 15건(빨간색) 이상이면 Gemini 무료 한도 임박 신호입니다.<br>
· 개념 카드 읽기·복습은 브라우저 캐시로 처리되어 여기 안 잡힙니다 — 페이지뷰 전체는 Vercel Analytics 참조.<br>
· 봇/헬스체크는 '구분' 열에서 자동 표시됩니다.
</p>
</div></body></html>"""


def render_day_html(day_stats: dict[str, Any], key: str = "", days: int = 7) -> str:
    """특정 일자 상세 페이지 — 시간대별 추이·기능·방문자."""
    hourly = day_stats["hourly"]
    max_h = max([h["requests"] for h in hourly], default=1) or 1

    hour_rows = "".join(
        f"<tr><td class='day'>{h['hour']}시</td>"
        f"<td class='req'><span class='barwrap'><span class='bar' style='width:{max(4, int(h['requests'] / max_h * 100))}%'></span></span>"
        f"<span class='num reqnum'>{h['requests']}</span></td>"
        f"<td class='num'>{h['unique_ips']}</td></tr>"
        for h in hourly
    ) or "<tr><td colspan='3' class='empty'>이날 기록이 없습니다</td></tr>"

    path_rows = "".join(
        f"<tr><td class='path'>{p['path']}</td><td class='num'>{p['count']}</td></tr>"
        for p in day_stats["top_paths"]
    ) or "<tr><td colspan='2' class='empty'>-</td></tr>"

    visitor_rows = "".join(
        f"<tr><td>{v['ip']}</td><td>{_visitor_label(v['ip'])}</td><td class='num'>{v['requests']}</td>"
        f"<td>{v['first_seen'][11:16]}~{v['last_seen'][11:16]}</td></tr>"
        for v in day_stats["visitors"]
    ) or "<tr><td colspan='4' class='empty'>-</td></tr>"

    human_visitors = sum(1 for v in day_stats["visitors"] if _visitor_label(v["ip"]) == "사용자")

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{day_stats['day']} 사용량</title>
<style>{_CSS}</style></head><body><div class="wrap">
<a class="back" href="/admin/dashboard?key={key}&days={days}">← 전체 기간으로</a>
<h1>📅 {day_stats['day']} 상세</h1>

<div class="cards">
  <div class="card"><b>{day_stats['total_requests']}</b><span>총 요청</span></div>
  <div class="card"><b>{day_stats['unique_ips']}</b><span>고유 IP</span></div>
  <div class="card"><b>{human_visitors}</b><span>실사용자 추정</span></div>
  <div class="card"><b>{day_stats['ai_calls']}</b><span>AI 호출</span></div>
</div>

<h2>시간대별 추이</h2>
<table class="t-hour"><tr><th>시간</th><th>요청</th><th>방문자</th></tr>{hour_rows}</table>

<h2>이날 많이 쓰인 기능</h2>
<table><tr><th>경로</th><th>횟수</th></tr>{path_rows}</table>

<h2>이날 방문자</h2>
<table><tr><th>IP</th><th>구분</th><th>요청</th><th>활동 시간</th></tr>{visitor_rows}</table>
</div></body></html>"""
