"""현공비성 계산 엔진 (파이썬 포팅).

프론트 luopan-next/src/lib/flyingStars.ts(문헌 11좌향 + 실전 감정 3건 검증 완료)를
그대로 포팅한 것. 학습 콘텐츠(조견표·연습 예시)와 퀴즈를 계산으로 생성하는 데 쓴다.
포팅 검증: 동일 케이스 전수 대조(learn_fengshui 로드 시 assert).
"""

from __future__ import annotations

# 낙서 궁 ↔ 수 (중궁 5)
PALACE_NUM = {"坎": 1, "坤": 2, "震": 3, "巽": 4, "中": 5, "乾": 6, "兌": 7, "艮": 8, "離": 9}
NUM_PALACE = {v: k for k, v in PALACE_NUM.items()}

# 순비(順飛) 궁 순서 — 중궁에서 乾→兌→艮→離→坎→坤→震→巽
FLY_ORDER = ["中", "乾", "兌", "艮", "離", "坎", "坤", "震", "巽"]

# 궁별 24산 [지원룡, 천원룡, 인원룡] — 나경 시계방향
PALACE_MOUNTAINS = {
    "坎": ["壬", "子", "癸"], "艮": ["丑", "艮", "寅"], "震": ["甲", "卯", "乙"],
    "巽": ["辰", "巽", "巳"], "離": ["丙", "午", "丁"], "坤": ["未", "坤", "申"],
    "兌": ["庚", "酉", "辛"], "乾": ["戌", "乾", "亥"],
}

# 24산 음양 — 양(+1)=순비, 음(-1)=역비
MOUNTAIN_YINYANG = {
    "甲": 1, "庚": 1, "壬": 1, "丙": 1, "辰": -1, "戌": -1, "丑": -1, "未": -1,
    "乾": 1, "坤": 1, "艮": 1, "巽": 1, "子": -1, "午": -1, "卯": -1, "酉": -1,
    "寅": 1, "申": 1, "巳": 1, "亥": 1, "乙": -1, "辛": -1, "丁": -1, "癸": -1,
}

# 24산 → (궁, 원룡, 방위각) — 子=0(북) 시계방향 15도
_ORDER = ["坎", "艮", "震", "巽", "離", "坤", "兌", "乾"]
_YUANS = ["지원룡", "천원룡", "인원룡"]
MOUNTAIN_INFO: dict[str, dict] = {}
for _pi, _p in enumerate(_ORDER):
    for _mi, _m in enumerate(PALACE_MOUNTAINS[_p]):
        MOUNTAIN_INFO[_m] = {"palace": _p, "yuan": _YUANS[_mi],
                             "deg": ((_pi * 45 + (_mi - 1) * 15) % 360 + 360) % 360}

MOUNTAINS_24 = list(MOUNTAIN_INFO.keys())
PALACE_DIR = {"坎": "북", "艮": "북동", "震": "동", "巽": "남동",
              "離": "남", "坤": "남서", "兌": "서", "乾": "북서", "中": "중궁"}


def opposite_mountain(m: str) -> str:
    """좌(坐) → 향(向): 정반대 산."""
    target = (MOUNTAIN_INFO[m]["deg"] + 180) % 360
    for name, i in MOUNTAIN_INFO.items():
        if i["deg"] == target:
            return name
    raise ValueError(f"대향 산 없음: {m}")


def period_of(year: int) -> int:
    """연도 → 운(1~9). 1864년 상원 1운 기점, 20년 단위."""
    return ((year - 1864) // 20 % 9 + 9) % 9 + 1


def fly_chart(center: int, forward: bool) -> dict[str, int]:
    """중궁수를 넣고 순/역으로 9궁 배치."""
    out = {}
    for i, p in enumerate(FLY_ORDER):
        n = center + i if forward else center - i
        out[p] = (n - 1) % 9 + 1
    return out


def _fly_direction(center_num: int, yuan: str, self_mountain: str) -> bool:
    """5 특칙 포함: 입중수의 원궁에서 원룡 위치 산의 음양 → 순/역."""
    if center_num == 5:
        return MOUNTAIN_YINYANG[self_mountain] == 1
    palace = NUM_PALACE[center_num]
    idx = {"지원룡": 0, "천원룡": 1, "인원룡": 2}[yuan]
    return MOUNTAIN_YINYANG[PALACE_MOUNTAINS[palace][idx]] == 1


def star_chart(sitting: str, period: int) -> dict:
    """좌산·운으로 비성반(운반·산성·향성·격국) 산출 — TS starChart 포팅."""
    sit = MOUNTAIN_INFO[sitting]
    facing = opposite_mountain(sitting)
    face = MOUNTAIN_INFO[facing]
    base = fly_chart(period, True)

    m_center = base[sit["palace"]]
    m_forward = _fly_direction(m_center, sit["yuan"], sitting)
    mountain = fly_chart(m_center, m_forward)

    w_center = base[face["palace"]]
    w_forward = _fly_direction(w_center, face["yuan"], facing)
    water = fly_chart(w_center, w_forward)

    m_at_sit = mountain[sit["palace"]] == period
    m_at_face = mountain[face["palace"]] == period
    w_at_sit = water[sit["palace"]] == period
    w_at_face = water[face["palace"]] == period

    structure = "평국"
    if m_at_sit and w_at_face:
        structure = "왕산왕향"
    elif m_at_face and w_at_sit:
        structure = "상산하수"
    elif m_at_face and w_at_face:
        structure = "쌍성회향"
    elif m_at_sit and w_at_sit:
        structure = "쌍성회좌"

    return {"period": period, "sitting": sitting, "facing": facing,
            "base": base, "mountain": mountain, "water": water, "structure": structure}


def annual_center(year: int) -> int:
    """연자백 중궁수 — 1864(1白) 기점 매년 역행. 입춘 기준 연도를 넣을 것."""
    return (1864 - year) % 9 + 1


def annual_chart(year: int) -> dict[str, int]:
    return fly_chart(annual_center(year), True)


def _verify() -> None:
    """포팅 검증 — TS 검증을 통과한 케이스와 전수 대조(불일치 시 즉시 실패)."""
    # 실전 감정 3건(9운, 그리드 巽離坤/震中兌/艮坎乾, 셀=산성·향성)
    grid = [["巽", "離", "坤"], ["震", "中", "兌"], ["艮", "坎", "乾"]]

    def cells(sit: str, p: int) -> list[list[str]]:
        c = star_chart(sit, p)
        return [[f"{c['mountain'][g]}{c['water'][g]}" for g in row] for row in grid]

    assert cells("丑", 9) == [["27", "72", "99"], ["18", "36", "54"], ["63", "81", "45"]]
    assert cells("壬", 9) == [["45", "99", "27"], ["36", "54", "72"], ["81", "18", "63"]]
    assert cells("甲", 9) == [["63", "27", "45"], ["54", "72", "99"], ["18", "36", "81"]]
    # 격국 대표 케이스
    assert star_chart("子", 9)["structure"] == "쌍성회좌"
    assert star_chart("午", 9)["structure"] == "쌍성회향"
    for s in ("乾", "巽", "丑", "未", "巳", "亥"):
        assert star_chart(s, 8)["structure"] == "왕산왕향", s
    # 연자백
    assert annual_center(2024) == 3 and annual_center(2025) == 2 and annual_center(2026) == 1
    # 운 판정
    assert period_of(2024) == 9 and period_of(2023) == 8 and period_of(2044) == 1


_verify()
