"""연운(세운) 콘텐츠 키 해독 엔진 (yearun_engine).

검증 완료된 두 해독결과를 단일 모듈로 병합한 것이다.
- yearun{N}   : 연운 천간운 콘텐츠
- yearunji{N} : 연운 지지운 콘텐츠

핵심 공식(검증 high):
- 일간(천간) 인덱스 = source_table 번호이자 십신 기준 일간(idx_code의 t1).
- 세운 천간/지지 인덱스(t3/t4)는 위치값(십신이 아님).
- 키 = "{t1}-{t2}-{t3}-{t4}-{t5}[-{t6}]"
  t2 = 명식/길흉 시나리오 분류(1~12, 원국정보 없이는 미확정 -> 전개)
  t5 = 관점(천간운 A=남/B=여, 지지운 A=미혼·일반/B=기혼)
  t6 = 선택적 길흉(0=大吉,1=大凶)/신살 코드(원국 비교 필요)

운영 시 반드시 반영(검증 notes):
(a) 조회는 source_table 조건 없이 idx_code 전역 매칭 권장(미스파일 대응).
(b) 커버리지 한계: 테이블당 고정 10간지(두 旬)만 수록 -> 조회 실패 시 fallback.
(c) 십신 텍스트 대조 시 동의어 정규화 필수(印綬=正印 등).

표준 라이브러리만 사용한다.
"""

from __future__ import annotations

# 천간(1..10) / 지지(1..12)
STEMS: str = "甲乙丙丁戊己庚辛壬癸"
BRANCHES: str = "子丑寅卯辰巳午未申酉戌亥"

# 지지 본기(本氣) 천간 — 지지십신 산출에 사용(戌->戊 확정)
BRANCH_MAIN: dict[str, str] = {
    "子": "癸", "丑": "己", "寅": "甲", "卯": "乙", "辰": "戊", "巳": "丙",
    "午": "丁", "未": "己", "申": "庚", "酉": "辛", "戌": "戊", "亥": "壬",
}

# 십신 텍스트 대조 시 동의어 정규화표(검증: 미적용 시 거짓 불일치 발생)
SIPSIN_SYNONYM: dict[str, str] = {
    "印綬": "正印", "梟神": "偏印", "敗財": "劫財", "羊刃": "劫財",
    "七殺": "偏官", "七煞": "偏官",
}

# 천간 -> (오행, 음양: 1=陽 0=陰)
_ELEM: dict[str, tuple[str, int]] = {
    "甲": ("木", 1), "乙": ("木", 0), "丙": ("火", 1), "丁": ("火", 0),
    "戊": ("土", 1), "己": ("土", 0), "庚": ("金", 1), "辛": ("金", 0),
    "壬": ("水", 1), "癸": ("水", 0),
}

# 오행 상생/상극
_GEN: dict[str, str] = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}
_KE: dict[str, str] = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}


def sipsin(day_stem: str, target_stem: str) -> str:
    """일간 기준 대상 천간의 십신을 산출한다.

    지지의 십신을 구할 때는 본기(本氣) 천간을 넣어 호출한다.
    표준 표기(比肩/劫財/食神/傷官/偏財/正財/偏印/正印/偏官/正官)만 반환한다.
    """
    # 지지를 넣으면 본기 천간으로 치환(이미 천간이면 그대로)
    target_stem = BRANCH_MAIN.get(target_stem, target_stem)
    de, dy = _ELEM[day_stem]      # 일간 오행/음양
    oe, oy = _ELEM[target_stem]   # 대상 오행/음양
    same = (dy == oy)             # 음양 동일 여부
    if oe == de:                            # 동일 오행 -> 비겁
        return "比肩" if same else "劫財"
    if _GEN[de] == oe:                      # 일간이 생하는 오행 -> 식상
        return "食神" if same else "傷官"
    if _KE[de] == oe:                       # 일간이 극하는 오행 -> 재성
        return "偏財" if same else "正財"
    if _GEN[oe] == de:                      # 대상이 일간을 생함 -> 인성
        return "偏印" if same else "正印"
    return "偏官" if same else "正官"        # 대상이 일간을 극함 -> 관성


def normalize_sipsin(name: str) -> str:
    """십신 동의어를 표준 표기로 정규화한다(텍스트 대조용)."""
    return SIPSIN_SYNONYM.get(name, name)


def _indices(day_stem: str, seun_ganzhi: str) -> tuple[int, int, int]:
    """일간/세운간지로 (t1, t3, t4) 인덱스를 산출한다.

    t1 = 일간 천간 인덱스(1..10), t3 = 세운 천간(1..10), t4 = 세운 지지(1..12).
    """
    t1 = STEMS.index(day_stem) + 1
    t3 = STEMS.index(seun_ganzhi[0]) + 1
    t4 = BRANCHES.index(seun_ganzhi[1]) + 1
    return t1, t3, t4


def cheongan_keys(
    day_stem: str,
    seun_ganzhi: str,
    gender: str = "남",
) -> list[str]:
    """천간운(yearun) 콘텐츠 idx_code 후보 prefix 목록을 생성한다.

    t5 = 관점(A=남, B=여). t2(1~10)는 원국정보 없이 미확정 -> 전개.
    조회는 source_table 조건 없이 idx_code 전역 매칭 권장.
    기본 길흉행은 prefix 그대로, 신살 조건행은 prefix+'-'+t6 로 조회.
    """
    t1, t3, t4 = _indices(day_stem, seun_ganzhi)
    t5 = "A" if gender in ("남", "M", "남자") else "B"  # token5 = 관점(남/여)
    return [f"{t1}-{t2}-{t3}-{t4}-{t5}" for t2 in range(1, 11)]


def jiji_keys(
    day_stem: str,
    seun_ganzhi: str,
    view: str | None = None,
    sinsal_code: str | None = None,
) -> list[str]:
    """지지운(yearunji) 콘텐츠 idx_code 후보 목록을 생성한다.

    t5 = 관점(A=미혼/일반, B=기혼). view 지정 시 해당 관점만, 없으면 A·B 모두 전개.
    t2(1~12)는 원국정보 없이 미확정 -> 전개.
    sinsal_code=None 이면 기본행 + 0(大吉)/1(大凶) fallback 포함(false negative 방지).
    sinsal_code 지정 시 해당 신살 분기행만 생성.
    """
    t1, t3, t4 = _indices(day_stem, seun_ganzhi)
    views = (view,) if view in ("A", "B") else ("A", "B")
    keys: list[str] = []
    for t2 in range(1, 13):            # token2 = 명식분류 후보 1~12
        for v in views:               # token5 = 미혼(A)/기혼(B)
            base = f"{t1}-{t2}-{t3}-{t4}-{v}"
            if sinsal_code is not None:
                keys.append(f"{base}-{sinsal_code}")  # 특정 신살 분기행
            else:
                keys.append(base)          # 기본 길흉행(있을 경우)
                keys.append(f"{base}-0")   # 大吉 고정분기(base 없는 조합 대비)
                keys.append(f"{base}-1")   # 大凶 고정분기(base 없는 조합 대비)
    return keys


def cheongan_table(day_stem: str) -> str:
    """일간으로 천간운 source_table명을 반환한다."""
    return f"yearun{STEMS.index(day_stem) + 1}"


def jiji_table(day_stem: str) -> str:
    """일간으로 지지운 source_table명을 반환한다."""
    return f"yearunji{STEMS.index(day_stem) + 1}"


def yearun_keys(ilgan_idx: int, seun_ganzhi: str, day_stem: str) -> dict:
    """일간 기준 세운의 천간운/지지운 콘텐츠 키를 반환한다.

    Args:
        ilgan_idx: 일간 천간 인덱스(1=甲 .. 10=癸). 검증/호환용.
        seun_ganzhi: 세운 60갑자 2글자(예 '戊寅').
        day_stem: 일간 천간 1글자(예 '辛'). 십신·키 산출의 기준이다.

    Returns:
        {"천간운": [키...], "지지운": [키...]} — yearun + yearunji 키 묶음.
        부가로 산출 십신("천간십신"/"지지십신")도 함께 담는다.
    """
    # 인덱스와 천간 문자 일관성 확인(불일치 시 day_stem 우선)
    if not (1 <= ilgan_idx <= 10) or STEMS[ilgan_idx - 1] != day_stem:
        ilgan_idx = STEMS.index(day_stem) + 1

    gan, ji = seun_ganzhi[0], seun_ganzhi[1]
    cheon_sipsin = sipsin(day_stem, gan)           # 세운 천간 십신
    ji_sipsin = sipsin(day_stem, ji)               # 세운 지지 십신(본기 기준)

    return {
        "천간운": cheongan_keys(day_stem, seun_ganzhi),
        "지지운": jiji_keys(day_stem, seun_ganzhi),
        "천간십신": cheon_sipsin,
        "지지십신": ji_sipsin,
    }


# ---------------------------------------------------------------------------
# 스모크 테스트 (辛일간 戊寅 -> yearun8 키 확인)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # 오라클: 辛일간(idx 8) 세운 戊寅 남자 -> '8-1-5-3-A'
    result = yearun_keys(8, "戊寅", "辛")

    print("[입력] 辛일간 / 세운 戊寅")
    print(f"천간운 테이블 : {cheongan_table('辛')}")   # yearun8 기대
    print(f"지지운 테이블 : {jiji_table('辛')}")        # yearunji8 기대
    print(f"천간십신      : {result['천간십신']}")       # 正印 기대 (辛->戊)
    print(f"지지십신      : {result['지지십신']}")       # 正財 기대 (辛->寅本氣甲)
    print(f"천간운 키[0]  : {result['천간운'][0]}")      # 8-1-5-3-A 기대
    print("천간운 키 일부:", result["천간운"][:3])
    print("지지운 키 일부:", result["지지운"][:4])

    # --- 검증 단언 ---
    assert cheongan_table("辛") == "yearun8", "천간운 테이블 불일치"
    assert jiji_table("辛") == "yearunji8", "지지운 테이블 불일치"
    assert result["천간운"][0] == "8-1-5-3-A", "오라클 키 불일치(천간운)"
    assert "8-2-5-3-A" in result["지지운"], "오라클 키 누락(지지운)"
    assert result["천간십신"] == "正印", "천간십신 산출 오류"
    assert result["지지십신"] == "正財", "지지십신 산출 오류"

    # 십신 산출 추가 검증(sample_map 표본)
    assert sipsin("甲", "甲") == "比肩"            # 甲 세운 甲
    assert sipsin("甲", "申") == "偏官"            # 甲 세운 申(本氣 庚)
    assert sipsin("戊", "壬") == "偏財"            # 戊 세운 壬
    assert sipsin("戊", "午") == "正印"            # 戊 세운 午(本氣 丁)
    assert sipsin("癸", "丙") == "正財"            # 癸 세운 丙
    assert sipsin("癸", "戌") == "正官"            # 癸 세운 戌(本氣 戊, 정정 반영)
    assert normalize_sipsin("印綬") == "正印"      # 동의어 정규화

    print("\n[PASS] 모든 스모크 테스트 통과")
