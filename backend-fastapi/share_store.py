"""
공유 링크 영구저장 모듈
- sqlite3 표준 라이브러리만 사용한다. 명식+AI리포트 페이로드를 단축 코드로 저장/조회한다.
- 주의: Render 무료티어는 재배포 시 파일시스템이 초기화되므로 공유 링크가 영구 보장되지 않는다.
  영속 볼륨 마운트 또는 외부 DB(Supabase 등) 전환을 후속 옵션으로 둔다.
"""
import os
import json
import uuid
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

# DB 파일 경로 (환경변수로 영속 볼륨 지정 가능)
DB_PATH = os.getenv("SHARE_DB_PATH", os.path.join(os.path.dirname(__file__), "shares.db"))


def _connect() -> sqlite3.Connection:
    """DB 연결을 생성하고 테이블을 보장한다."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS shares (
            code TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    return conn


def save_share(payload: dict[str, Any]) -> str:
    """페이로드를 저장하고 단축 코드를 반환한다."""
    code = uuid.uuid4().hex[:10]
    created_at = datetime.now(timezone.utc).isoformat()
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO shares (code, payload, created_at) VALUES (?, ?, ?)",
            (code, json.dumps(payload, ensure_ascii=False), created_at),
        )
        conn.commit()
    finally:
        conn.close()
    return code


def get_share(code: str) -> Optional[dict[str, Any]]:
    """코드로 저장된 페이로드를 조회한다. 없으면 None."""
    if not code:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT payload, created_at FROM shares WHERE code = ?", (code,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    try:
        data = json.loads(row[0])
    except Exception:
        return None
    return {"payload": data, "created_at": row[1]}
