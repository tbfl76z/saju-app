"""명리(命理) 탐지 엔진 — 단일 모듈 통합본.

검증된 탐지 룰(대1~대24, guikok HA~HH)을 하나의 모듈로 병합한다.
- 표준 라이브러리만 사용한다.
- content_db(풀이 텍스트)에 직접 접근하지 않는다. 탐지 결과로 wonmyung/guikok '키'만 반환하며,
  실제 풀이 텍스트는 호출측에서 content_db.wonmyung() 등으로 조회한다.
- confidence='low' 또는 oracle_needed=True 인 룰도 결과에 포함하되, 해당 플래그를 항목에 유지해
  앱에서 '추정' 표기에 활용할 수 있게 한다.

각 탐지 항목(dict) 형식:
    {
        "조건명": str,
        "wonmyung_keys": [str, ...],
        "confidence": str,        # 'high' | 'medium' | 'low'
        "oracle_needed": bool,
    }

guikok(HA~HH)은 그룹에 속한 실존 키 목록을 DB 조회로 얻는 것이 원안이나,
본 엔진은 DB 비접근 원칙에 따라 키 후보 조회를 '주입 가능한 콜러블'로 분리한다.
호출측에서 detect(d, guikok_key_lookup=...) 형태로 실존 키 조회 함수를 넘기면
guikok 탐지가 활성화되고, 넘기지 않으면 guikok 결과는 생성하지 않는다(거짓키 방지).
"""

from __future__ import annotations

from typing import Callable, Optional

# ---------------------------------------------------------------------------
# 1) 공용 상수 (천간/지지/오행/십신/12운성 및 상호작용 테이블)
# ---------------------------------------------------------------------------

# 천간 10
CHEONGAN: tuple[str, ...] = ("甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸")

# 지지 12
JIJI: tuple[str, ...] = ("子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥")
JIJI_NO: dict[str, int] = {z: i + 1 for i, z in enumerate(JIJI)}  # 子=1 ... 亥=12

# 천간 -> 오행(한자)
STEM_TO_OHAENG: dict[str, str] = {
    "甲": "木", "乙": "木",
    "丙": "火", "丁": "火",
    "戊": "土", "己": "土",
    "庚": "金", "辛": "金",
    "壬": "水", "癸": "水",
}

# 음간(陰干) 집합
YIN_STEMS: frozenset[str] = frozenset({"乙", "丁", "己", "辛", "癸"})

# 오행 한↔한자 변환
OHAENG_H2C: dict[str, str] = {"목": "木", "화": "火", "토": "土", "금": "金", "수": "水"}
OHAENG_C2H: dict[str, str] = {v: k for k, v in OHAENG_H2C.items()}

# 오행 상생/상극 (한자)
SAENG: dict[str, str] = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}  # X가 生하는 대상
GEUK: dict[str, str] = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}  # X가 剋하는 대상

# 오행 상생/상극 (한글) — 대6 용신/기신 판정용
SAENG_KO: dict[str, str] = {"목": "화", "화": "토", "토": "금", "금": "수", "수": "목"}
GEUK_KO: dict[str, str] = {"목": "토", "토": "수", "수": "화", "화": "금", "금": "목"}
SAENG_KO_R: dict[str, str] = {v: k for k, v in SAENG_KO.items()}
GEUK_KO_R: dict[str, str] = {v: k for k, v in GEUK_KO.items()}

# 비겁 삼합국 (오행한자 -> trio). 三合: 일간 오행의 局
SAMHAP: dict[str, tuple[str, str, str]] = {
    "金": ("巳", "酉", "丑"),
    "水": ("申", "子", "辰"),
    "木": ("亥", "卯", "未"),
    "火": ("寅", "午", "戌"),
}

# 십신 10종 -> 번호
SIPSIN_NO: dict[str, int] = {
    "비견": 1, "겁재": 2, "식신": 3, "상관": 4, "편재": 5,
    "정재": 6, "편관": 7, "정관": 8, "편인": 9, "정인": 10,
}
NO_SIPSIN: dict[int, str] = {v: k for k, v in SIPSIN_NO.items()}

# 십신 -> 5그룹(비겁/식상/재성/관성/인성) — 대3용
SIPSIN_GROUP: dict[str, str] = {
    "비견": "비겁", "겁재": "비겁",
    "식신": "식상", "상관": "식상",
    "편재": "재성", "정재": "재성",
    "편관": "관성", "정관": "관성",
    "편인": "인성", "정인": "인성",
}
GROUP_NO: dict[str, int] = {"비겁": 1, "식상": 2, "재성": 3, "관성": 4, "인성": 5}

# 12운성 번호 (대8/대9용)
TWELVE_GROWTH_NO: dict[str, int] = {
    "장생": 1, "목욕": 2, "관대": 3, "건록": 4, "제왕": 5, "쇠": 6,
    "병": 7, "사": 8, "묘": 9, "절": 10, "태": 11, "양": 12,
}
# 12운성 surface form 별칭 (engine 출력은 표준형이라 안전망)
TWELVE_GROWTH_ALIAS: dict[str, str] = {
    "록위": "건록", "록": "건록", "녹": "건록",
    "패위": "목욕", "욕지": "목욕",
    "왕위": "제왕", "왕": "제왕",
    "절지": "절", "절위": "절",
    "태위": "태", "양위": "양",
    "쇠위": "쇠", "병위": "병", "사위": "사",
    "묘위": "묘", "입묘": "묘",
}

# 일간 천간합 짝 (쌍방향) + 대4 중분류 번호
CHEONHAP: dict[str, tuple[str, int]] = {
    "甲": ("己", 1), "乙": ("庚", 2), "丙": ("辛", 3), "丁": ("壬", 4), "戊": ("癸", 5),
    "己": ("甲", 6), "庚": ("乙", 7), "辛": ("丙", 8), "壬": ("丁", 9), "癸": ("戊", 10),
}

# 천간충 페어
CHEONGAN_CHUNG: tuple[tuple[str, str], ...] = (("甲", "庚"), ("乙", "辛"), ("丙", "壬"), ("丁", "癸"))

# 지지충 6페어 (子午/丑未/寅申/卯酉/辰戌/巳亥)
JIJI_CHUNG: tuple[tuple[str, str], ...] = (
    ("子", "午"), ("丑", "未"), ("寅", "申"), ("卯", "酉"), ("辰", "戌"), ("巳", "亥"),
)

# 형 페어 (자형 제외 — 대18로 분리)
HYEONG_PAIR: tuple[tuple[str, str], ...] = (
    ("寅", "巳"), ("巳", "申"), ("寅", "申"),
    ("丑", "戌"), ("戌", "未"), ("丑", "未"),
    ("子", "卯"),
)

# 해(害) 6페어
HAE_PAIR: tuple[tuple[str, str], ...] = (
    ("子", "未"), ("丑", "午"), ("寅", "巳"), ("申", "亥"), ("卯", "辰"), ("酉", "戌"),
)

# 파(破) 6페어
PA_PAIR: tuple[tuple[str, str], ...] = (
    ("子", "酉"), ("午", "卯"), ("巳", "申"), ("寅", "亥"), ("丑", "辰"), ("戌", "未"),
)

# 자형(自刑) 지지
JAHYEONG: tuple[str, ...] = ("辰", "午", "酉", "亥")

# 암합(暗合) 페어
AMHAP_PAIR: tuple[tuple[str, str], ...] = (
    ("子", "巳"), ("亥", "丑"), ("寅", "丑"), ("卯", "申"), ("午", "亥"),
)

# 방합(方合) 트리오
BANGHAP_TRIO: tuple[tuple[str, str, str], ...] = (
    ("寅", "卯", "辰"), ("巳", "午", "未"), ("申", "酉", "戌"), ("亥", "子", "丑"),
)

# 육합(六合) 페어
YUKHAP_PAIR: tuple[tuple[str, str], ...] = (
    ("子", "丑"), ("寅", "亥"), ("卯", "戌"), ("辰", "酉"), ("巳", "申"), ("午", "未"),
)

# 절로공망(截路空亡) — 일간 -> 시지 집합
JEOLLO: dict[str, frozenset[str]] = {
    "甲": frozenset({"申", "酉"}), "己": frozenset({"申", "酉"}),
    "乙": frozenset({"午", "未"}), "庚": frozenset({"午", "未"}),
    "丙": frozenset({"辰", "巳"}), "辛": frozenset({"辰", "巳"}),
    "丁": frozenset({"寅", "卯"}), "壬": frozenset({"寅", "卯"}),
    "戊": frozenset({"子", "丑"}), "癸": frozenset({"子", "丑"}),
}

# 공망 십신 -> 번호 (대21, '인수'=정인)
GONGMANG_SIPSIN_NO: dict[str, int] = dict(SIPSIN_NO)
GONGMANG_SIPSIN_NO["인수"] = 10

# 네 기둥 위치 순서
POSITIONS: tuple[str, ...] = ("year", "month", "day", "hour")
# 위치쌍 인덱스 (년<월<일<시)
PAIR_IDX: dict[tuple[int, int], int] = {
    (0, 1): 1, (0, 2): 2, (0, 3): 3, (1, 2): 4, (1, 3): 5, (2, 3): 6,
}


# ---------------------------------------------------------------------------
# 공용 헬퍼
# ---------------------------------------------------------------------------

def _branches(d: dict) -> list[str]:
    """네 기둥 지지를 [년, 월, 일, 시] 순으로 반환한다(없으면 '')."""
    p = d.get("pillars", {}) or {}
    return [(p.get(k, {}) or {}).get("branch", "") for k in POSITIONS]


def _stems(d: dict) -> list[str]:
    """네 기둥 천간을 [년, 월, 일, 시] 순으로 반환한다(없으면 '')."""
    p = d.get("pillars", {}) or {}
    return [(p.get(k, {}) or {}).get("stem", "") for k in POSITIONS]


def _day_stem(d: dict) -> str:
    """일간 천간."""
    return ((d.get("pillars", {}) or {}).get("day", {}) or {}).get("stem", "")


def _day_ohaeng_c(d: dict) -> Optional[str]:
    """일간 오행을 한자로 반환한다(strength_analysis.day_element 우선, 없으면 일간 천간 추정)."""
    sa = d.get("strength_analysis", {}) or {}
    de = sa.get("day_element")
    if de:
        return OHAENG_H2C.get(de, de)  # 한글이면 한자로, 이미 한자면 그대로
    return STEM_TO_OHAENG.get(_day_stem(d))


def _gender_code(d: dict) -> str:
    """성별 항 코드. 남=A, 여=B."""
    g = str(d.get("gender", "남"))
    return "A" if g in ("남", "남자", "M", "male") or g.startswith("남") else "B"


# ---------------------------------------------------------------------------
# 2) 대분류 탐지 함수 (대1~대24, guikok HA~HH)
# ---------------------------------------------------------------------------

# --- 대1: 오행 과다 / 비겁삼합 --------------------------------------------
# confidence=medium, oracle_needed=True
_DAE1_HANG: dict[int, dict[tuple[str, str], str]] = {
    1: {("木", "過多"): "1", ("木", "無根"): "2", ("火", "過多"): "3", ("土", "過多"): "4",
        ("土", "無根"): "5", ("金", "過多"): "6", ("水", "過多"): "7"},
    2: {("木", "過多"): "1", ("木", "無根"): "2", ("火", "過多"): "3", ("土", "過多"): "4",
        ("金", "過多"): "5", ("水", "過多"): "6"},
    3: {("木", "過多"): "1", ("火", "過多"): "2", ("土", "過多"): "3", ("土", "無根"): "4",
        ("金", "過多"): "5", ("水", "過多"): "6"},
    4: {("木", "過多"): "1", ("火", "過多"): "2", ("土", "過多"): "3", ("金", "過多"): "4",
        ("金", "無根"): "5", ("水", "過多"): "6"},
    5: {("木", "過多"): "1", ("火", "過多"): "2", ("土", "過多"): "3", ("金", "過多"): "4",
        ("水", "過多"): "5"},
}
_DAE1_JUNG: dict[str, int] = {"金": 1, "水": 2, "木": 3, "火": 4, "土": 5}


def detect_dae1(d: dict) -> list[dict]:
    """대1: 오행 과다·무근 / 비겁삼합. 일간 오행으로 중분류, 過多 임계 count>=3."""
    fe: dict[str, int] = {c: 0 for c in "木火土金水"}
    for k, v in (d.get("five_elements", {}) or {}).items():
        c = OHAENG_H2C.get(k, k)
        if c in fe:
            try:
                fe[c] += int(v)
            except (TypeError, ValueError):
                pass
    ilgan = _day_ohaeng_c(d)
    jung = _DAE1_JUNG.get(ilgan) if ilgan else None
    if not jung:
        return []
    hm = _DAE1_HANG[jung]
    keys: list[str] = []
    conds: list[str] = []
    # 오라클(乙丑乙酉辛亥辛卯) 대조: 五行過多는 '일간 오행'만 발화(목금 동시발화 X).
    cnt = fe.get(ilgan, 0)
    if cnt >= 3 and (ilgan, "過多") in hm:
        keys.append(f"1-{jung}-{hm[(ilgan, '過多')]}")
        conds.append(f"{OHAENG_C2H[ilgan]} 과다({cnt})")
    trio = SAMHAP.get(ilgan)
    br = _branches(d)
    if trio and all(x in br for x in trio):
        keys.append(f"1-{jung}-A")
        conds.append(f"비겁삼합({''.join(trio)}{ilgan}局)")
    if not keys:
        return []
    return [{
        "조건명": f"{'; '.join(conds)} [중분류 1-{jung}(일간 {OHAENG_C2H.get(ilgan, '')})]",
        "wonmyung_keys": keys,
        "confidence": "medium",
        "oracle_needed": True,
    }]


# --- 대2: 십신별 삼합 -------------------------------------------------------
# confidence=low, oracle_needed=True (정/편 음양 정통기준 교정본)
def detect_dae2(d: dict) -> list[dict]:
    """대2: 지지 삼합국 -> 일간기준 십신 -> 중분류. A(길)/B(흉) 둘 다 후보."""
    ilgan = _day_ohaeng_c(d)
    if not ilgan:
        return []
    stem = _day_stem(d)
    br = _branches(d)
    day_yin = stem in YIN_STEMS  # 일간 음간 여부

    def sipsin(tgt: str) -> Optional[str]:
        """일간 오행 기준, 삼합국 오행(tgt)의 십신을 정통 음양으로 산출한다."""
        if tgt == ilgan:
            base = "비"
        elif SAENG.get(ilgan) == tgt:
            base = "식"
        elif GEUK.get(ilgan) == tgt:
            base = "재"
        elif GEUK.get(tgt) == ilgan:
            base = "관"
        elif SAENG.get(tgt) == ilgan:
            base = "인"
        else:
            base = "비"
        # 삼합국=음간 성격 → 일간이 음이면 음양同(偏), 양이면 음양異(正)
        same = day_yin
        m = {
            ("비", True): "비견", ("비", False): "겁재",
            ("식", True): "식신", ("식", False): "상관",
            ("재", True): "편재", ("재", False): "정재",
            ("관", True): "편관", ("관", False): "정관",
            ("인", True): "편인", ("인", False): "정인",
        }
        return m[(base, same)]

    out: list[dict] = []
    for guk, trio in SAMHAP.items():
        if all(x in br for x in trio):
            ss = sipsin(guk)
            j = SIPSIN_NO.get(ss) if ss else None
            if j:
                out.append({
                    "조건명": f"{ss}삼합({''.join(trio)}{guk}局) [중분류 2-{j}]",
                    "wonmyung_keys": [f"2-{j}-A", f"2-{j}-B"],
                    "confidence": "low",
                    "oracle_needed": True,
                })
    return out


# --- 대3: 십신그룹 과다 -----------------------------------------------------
# confidence=medium, oracle_needed=True
def detect_dae3(d: dict) -> list[dict]:
    """대3: 十神太過. 오라클(乙丑乙酉辛亥辛卯→比劫) 대조: 오행 글자수를 일간 생극으로
    5그룹 환산해 '최다 1그룹'만 발화(동점시 비겁 우선). 라벨 단순 카운트가 아님."""
    ilgan = _day_ohaeng_c(d)
    if not ilgan or ilgan not in "木火土金水":
        return []
    fe: dict[str, int] = {c: 0 for c in "木火土金水"}
    for k, v in (d.get("five_elements", {}) or {}).items():
        c = OHAENG_H2C.get(k, k)
        if c in fe:
            try:
                fe[c] += int(v)
            except (TypeError, ValueError):
                pass
    sik = SAENG[ilgan]                                       # 식상(일간이 生)
    jae = GEUK[ilgan]                                        # 재성(일간이 剋)
    gwan = next((k for k, v in GEUK.items() if v == ilgan), ilgan)   # 관성(일간을 剋)
    ins = next((k for k, v in SAENG.items() if v == ilgan), ilgan)   # 인성(일간을 生)
    grp = {"비겁": fe[ilgan], "식상": fe[sik], "재성": fe[jae], "관성": fe[gwan], "인성": fe[ins]}
    order = ["비겁", "인성", "관성", "재성", "식상"]          # 동점 우선순위(일간세력 우선)
    best = max(order, key=lambda g: (grp[g], -order.index(g)))
    if grp[best] < 3:
        return []
    j = GROUP_NO[best]
    ab = "A" if str(d.get("gender", "남")).startswith("남") else "B"
    return [{
        "조건명": f"{best} 과다(오행 {grp[best]}) [중분류 3-{j}]",
        "wonmyung_keys": [f"3-{j}-{ab}"],
        "confidence": "medium",
        "oracle_needed": True,
    }]


# --- 대4: 일간 천간합 -------------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae4(d: dict) -> list[dict]:
    """대4: 일간이 자신의 천간합 짝을 년/월/시 천간에 가질 때. 항 A=남/B=여."""
    stems = _stems(d)
    day_stem = _day_stem(d)
    gcode = _gender_code(d)
    if day_stem not in CHEONHAP:
        return []
    partner, mid = CHEONHAP[day_stem]
    others = [stems[i] for i in range(4) if i != 2]  # 일간(일주) 제외
    if partner in others:
        return [{
            "조건명": f"일간 {day_stem}일 + {partner}합(천간합)",
            "wonmyung_keys": [f"4-{mid}-{gcode}"],
            "confidence": "high",
            "oracle_needed": False,
        }]
    return []


# --- 대5: 지지 중복 ---------------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae5(d: dict) -> list[dict]:
    """대5: 동일 지지 2/3/4개 병립. 항 A=2/B=3/C=4."""
    branches = _branches(d)
    out: list[dict] = []
    seen: set[str] = set()
    for z in branches:
        if not z or z in seen:
            continue
        seen.add(z)
        c = branches.count(z)
        if c >= 2:
            mid = JIJI_NO.get(z)
            if mid is None:
                continue
            hang = {2: "A", 3: "B", 4: "C"}[min(c, 4)]
            out.append({
                "조건명": f"지지 {z * c} 중복({c}개)",
                "wonmyung_keys": [f"5-{mid}-{hang}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대6: 십신 용신/기신 ----------------------------------------------------
# confidence=medium, oracle_needed=True
def _sipsin_ohaeng_ko(day_oh: str, s: str) -> Optional[str]:
    """일간오행(한글)+십신 -> 십신 오행(한글)."""
    if s in ("비견", "겁재"):
        return day_oh
    if s in ("식신", "상관"):
        return SAENG_KO.get(day_oh)
    if s in ("편재", "정재"):
        return GEUK_KO.get(day_oh)
    if s in ("편관", "정관"):
        return GEUK_KO_R.get(day_oh)
    if s in ("편인", "정인"):
        return SAENG_KO_R.get(day_oh)
    return None


def detect_dae6(d: dict) -> list[dict]:
    """대6: 사주 십신의 용신/기신 여부. 항 {A남|B여}-{1용신|2기신}, 한신은 미발화."""
    gcode = _gender_code(d)
    sa = d.get("strength_analysis", {}) or {}
    day_oh = sa.get("day_element")  # 한글 오행 기대
    if not day_oh:
        return []
    yong = set(sa.get("yongsin") or [])
    gi = set(sa.get("gisin") or [])
    present: set[str] = set()
    for tg in (d.get("ten_gods", {}) or {}, d.get("jiji_ten_gods", {}) or {}):
        for v in tg.values():
            if v in SIPSIN_NO:
                present.add(v)
    out: list[dict] = []
    for s in present:
        mid = SIPSIN_NO[s]
        oh = _sipsin_ohaeng_ko(day_oh, s)
        if oh in yong:
            hang, lab = "1", "용신"
        elif oh in gi:
            hang, lab = "2", "기신"
        else:
            continue
        out.append({
            "조건명": f"{s}({oh}) = {lab} [중분류 6-{mid}]",
            "wonmyung_keys": [f"6-{mid}-{gcode}-{hang}"],
            "confidence": "medium",
            "oracle_needed": True,
        })
    return out


# --- 대7: 위치별 천간·지지 십신 발현 ---------------------------------------
# confidence=medium, oracle_needed=True
def detect_dae7(d: dict) -> list[dict]:
    """대7: 위치(년월일시)별 십신 발현. 항1=年干(천간), 항3=日支(지지), 항2/4=주 전체."""
    pos_map = {1: "year", 2: "month", 3: "day", 4: "hour"}
    sfx = _gender_code(d)
    tg = d.get("ten_gods", {}) or {}
    jtg = d.get("jiji_ten_gods", {}) or {}
    out: list[dict] = []
    for mid in range(1, 11):
        sin = NO_SIPSIN[mid]
        for hang, pos in pos_map.items():
            if hang == 1:  # 年干 = 천간 전용
                hit = tg.get(pos) == sin
            elif hang == 3:  # 日支 = 지지 전용
                hit = jtg.get("day") == sin
            else:  # 月柱/時柱 = 주 전체(천간 또는 지지)
                hit = (tg.get(pos) == sin) or (jtg.get(pos) == sin)
            if hit:
                out.append({
                    "조건명": f"{pos}_{sin}",
                    "wonmyung_keys": [f"7-{mid}-{hang}-{sfx}"],
                    "confidence": "medium",
                    "oracle_needed": True,
                })
    return out


# --- 대8: 위치별 지지의 일간기준 12운성 ------------------------------------
# confidence=high, oracle_needed=False
def detect_dae8(d: dict) -> list[dict]:
    """대8: 각 주 지지의 일간기준 12운성. 결정론적 4건 발화(A/B 없음)."""
    pos_map = {1: "year", 2: "month", 3: "day", 4: "hour"}
    pos_kr = {"year": "年支", "month": "月支", "day": "日支", "hour": "時支"}
    tw = d.get("twelve_growth", {}) or {}
    out: list[dict] = []
    for mid, pos in pos_map.items():
        raw = tw.get(pos, "")
        un = TWELVE_GROWTH_ALIAS.get(raw, raw)
        hang = TWELVE_GROWTH_NO.get(un)
        if hang:
            out.append({
                "조건명": f"{pos_kr[pos]}_{un}",
                "wonmyung_keys": [f"8-{mid}-{hang}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대9: 타주 십신의 12운성 결합 ------------------------------------------
# confidence=medium, oracle_needed=True
def detect_dae9(d: dict) -> list[dict]:
    """대9: 타주(일주 제외) 천간십신 + 그 주 지지의 일간기준 12운성 결합."""
    sfx = _gender_code(d)
    tg = d.get("ten_gods", {}) or {}
    tw = d.get("twelve_growth", {}) or {}
    out: list[dict] = []
    for pos in ("year", "month", "hour"):  # 타주 = 일주 제외
        sin = tg.get(pos)
        mid = SIPSIN_NO.get(sin) if sin else None
        if not mid:
            continue
        raw = tw.get(pos, "")
        un = TWELVE_GROWTH_ALIAS.get(raw, raw)
        hang = TWELVE_GROWTH_NO.get(un)
        if hang:
            out.append({
                "조건명": f"타주_{sin}_{un}",
                "wonmyung_keys": [f"9-{mid}-{hang}-{sfx}"],
                "confidence": "medium",
                "oracle_needed": True,
            })
    return out


# --- 대10: 지지충 (페어 존재) -----------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae10(d: dict) -> list[dict]:
    """대10: 명식 내 충 페어 존재 여부(위치 무관)."""
    s = set(_branches(d))
    out: list[dict] = []
    for i, (a, b) in enumerate(JIJI_CHUNG, 1):
        if a in s and b in s:
            out.append({
                "조건명": f"{a}{b} 충(沖)",
                "wonmyung_keys": [f"10-{i}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대11: 천간충 (위치쌍) --------------------------------------------------
# confidence=high, oracle_needed=False
_DAE11_HASKEY: frozenset[int] = frozenset({1, 2, 4, 6})


def detect_dae11(d: dict) -> list[dict]:
    """대11: 천간충 위치쌍별. DB 실재 키 1/2/4/6만 발화."""
    st = _stems(d)
    out: list[dict] = []
    for p1 in range(4):
        for p2 in range(p1 + 1, 4):
            for ga, gb in CHEONGAN_CHUNG:
                if {st[p1], st[p2]} == {ga, gb}:
                    idx = PAIR_IDX[(p1, p2)]
                    if idx in _DAE11_HASKEY:
                        out.append({
                            "조건명": f"{POSITIONS[p1]}간-{POSITIONS[p2]}간 천간충({st[p1]}{st[p2]})",
                            "wonmyung_keys": [f"11-{idx}"],
                            "confidence": "high",
                            "oracle_needed": False,
                        })
    return out


# --- 대12: 형 (위치쌍) ------------------------------------------------------
# confidence=medium, oracle_needed=True
def detect_dae12(d: dict) -> list[dict]:
    """대12: 형(刑) 위치쌍별. 자형 제외(대18 분리)."""
    br = _branches(d)
    out: list[dict] = []
    for p1 in range(4):
        for p2 in range(p1 + 1, 4):
            for fa, fb in HYEONG_PAIR:
                if {br[p1], br[p2]} == {fa, fb}:
                    idx = PAIR_IDX[(p1, p2)]
                    out.append({
                        "조건명": f"{POSITIONS[p1]}지-{POSITIONS[p2]}지 형({fa}{fb})",
                        "wonmyung_keys": [f"12-{idx}"],
                        "confidence": "medium",
                        "oracle_needed": True,
                    })
    return out


# --- 대13: 지지충 (위치쌍) --------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae13(d: dict) -> list[dict]:
    """대13: 지지충 위치쌍별(어순 정규화)."""
    br = _branches(d)
    out: list[dict] = []
    for p1 in range(4):
        for p2 in range(p1 + 1, 4):
            for a, b in JIJI_CHUNG:
                if {br[p1], br[p2]} == {a, b}:
                    idx = PAIR_IDX[(p1, p2)]
                    out.append({
                        "조건명": f"{POSITIONS[p1]}지-{POSITIONS[p2]}지 충({a}{b})",
                        "wonmyung_keys": [f"13-{idx}"],
                        "confidence": "high",
                        "oracle_needed": False,
                    })
    return out


# --- 대14: 해 (페어 존재) ---------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae14(d: dict) -> list[dict]:
    """대14: 명식 내 해(害) 페어 존재(위치 무관)."""
    s = set(_branches(d))
    out: list[dict] = []
    for i, (a, b) in enumerate(HAE_PAIR, 1):
        if a in s and b in s:
            out.append({
                "조건명": f"{a}{b} 해(害)",
                "wonmyung_keys": [f"14-{i}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대15: 파 (페어 존재) ---------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae15(d: dict) -> list[dict]:
    """대15: 명식 내 파(破) 페어 존재(위치 무관)."""
    s = set(_branches(d))
    out: list[dict] = []
    for i, (a, b) in enumerate(PA_PAIR, 1):
        if a in s and b in s:
            out.append({
                "조건명": f"{a}{b} 파(破)",
                "wonmyung_keys": [f"15-{i}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대16: 파 (위치쌍) ------------------------------------------------------
# confidence=medium, oracle_needed=True
def detect_dae16(d: dict) -> list[dict]:
    """대16: 파(破) 위치쌍별."""
    br = _branches(d)
    out: list[dict] = []
    for p1 in range(4):
        for p2 in range(p1 + 1, 4):
            for a, b in PA_PAIR:
                if {br[p1], br[p2]} == {a, b}:
                    idx = PAIR_IDX[(p1, p2)]
                    out.append({
                        "조건명": f"{POSITIONS[p1]}지-{POSITIONS[p2]}지 파({a}{b})",
                        "wonmyung_keys": [f"16-{idx}"],
                        "confidence": "medium",
                        "oracle_needed": True,
                    })
    return out


# --- 대17: 삼형 완전/부분 및 子卯형 ----------------------------------------
# confidence=medium, oracle_needed=True
def detect_dae17(d: dict) -> list[dict]:
    """대17: 寅巳申/丑戌未 완전·부분 삼형 + 子卯형. 완전시 부분쌍 억제."""
    s = set(_branches(d))
    out: list[dict] = []

    def add(name: str, idx: int) -> None:
        out.append({
            "조건명": name,
            "wonmyung_keys": [f"17-{idx}"],
            "confidence": "medium",
            "oracle_needed": True,
        })

    if {"寅", "巳", "申"} <= s:
        add("寅巳申 삼형", 1)
    else:
        if "寅" in s and "巳" in s:
            add("寅巳 삼형", 2)
        if "巳" in s and "申" in s:
            add("巳申 삼형", 3)
        if "寅" in s and "申" in s:
            add("寅申 삼형", 4)
    if {"丑", "戌", "未"} <= s:
        add("丑戌未 삼형", 5)
    else:
        if "丑" in s and "戌" in s:
            add("丑戌 삼형", 6)
        if "戌" in s and "未" in s:
            add("戌未 삼형", 7)
        if "丑" in s and "未" in s:
            add("丑未 삼형", 8)
    if "子" in s and "卯" in s:
        add("子卯 형(무례지형)", 9)
    return out


# --- 대18: 자형 (동일 지지 2개 이상) ---------------------------------------
# confidence=medium, oracle_needed=True (A만 발화)
def detect_dae18(d: dict) -> list[dict]:
    """대18: 자형(辰辰/午午/酉酉/亥亥). A항만 발화(A/B 모순 콘텐츠)."""
    br = _branches(d)
    out: list[dict] = []
    for i, z in enumerate(JAHYEONG, 1):
        if br.count(z) >= 2:
            out.append({
                "조건명": f"{z}{z} 자형(自刑)",
                "wonmyung_keys": [f"18-{i}-A"],
                "confidence": "medium",
                "oracle_needed": True,
            })
    return out


# --- 대19: 공망 (위치별 / 년월시 전부) -------------------------------------
# confidence=high, oracle_needed=False
def detect_dae19(d: dict) -> list[dict]:
    """대19: 일주 기준 공망 위치별. 년·월·시 전부공망이면 19-5 우선."""
    br = _branches(d)
    gm = set((d.get("gongmang", {}) or {}).get("day", "") or "")
    vp = [i for i, z in enumerate(br) if z and z in gm]
    out: list[dict] = []
    if {0, 1, 3} <= set(vp):
        out.append({
            "조건명": "년월시지 전부 공망(귀명)",
            "wonmyung_keys": ["19-5"],
            "confidence": "high",
            "oracle_needed": False,
        })
    else:
        nm = ["년", "월", "일", "시"]
        for i in vp:
            out.append({
                "조건명": f"{nm[i]}지 공망",
                "wonmyung_keys": [f"19-{i + 1}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대20: 절로공망 ---------------------------------------------------------
# confidence=low, oracle_needed=True
def detect_dae20(d: dict) -> list[dict]:
    """대20: 절로공망(일간+시지). 해소조건(삼합/방합/충/육합/형) 미반영."""
    ds = _day_stem(d)
    hb = ((d.get("pillars", {}) or {}).get("hour", {}) or {}).get("branch", "")
    if hb and hb in JEOLLO.get(ds, frozenset()):
        return [{
            "조건명": f"절로공망(일간 {ds} + 시지 {hb})",
            "wonmyung_keys": ["20-1"],
            "confidence": "low",
            "oracle_needed": True,
        }]
    return []


# --- 대21: 공망 십신 --------------------------------------------------------
# confidence=low, oracle_needed=True
def detect_dae21(d: dict) -> list[dict]:
    """대21: 공망에 든 지지의 지지십신 종류별."""
    br = _branches(d)
    gm = set((d.get("gongmang", {}) or {}).get("day", "") or "")
    jtg = d.get("jiji_ten_gods", {}) or {}
    nm = ["년", "월", "일", "시"]
    out: list[dict] = []
    for i, z in enumerate(br):
        if z and z in gm:
            sip = jtg.get(POSITIONS[i])
            if sip in GONGMANG_SIPSIN_NO:
                idx = GONGMANG_SIPSIN_NO[sip]
                out.append({
                    "조건명": f"{sip}공망({nm[i]}지)",
                    "wonmyung_keys": [f"21-{idx}"],
                    "confidence": "low",
                    "oracle_needed": True,
                })
    return out


# --- 대22: 암합 -------------------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae22(d: dict) -> list[dict]:
    """대22: 지지 암합 페어 존재(위치 무관)."""
    s = set(_branches(d))
    out: list[dict] = []
    for i, (a, b) in enumerate(AMHAP_PAIR, 1):
        if a in s and b in s:
            out.append({
                "조건명": f"{a}{b} 암합(暗合)",
                "wonmyung_keys": [f"22-{i}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대23: 방합 -------------------------------------------------------------
# confidence=high, oracle_needed=False
def detect_dae23(d: dict) -> list[dict]:
    """대23: 방합 계절 삼지 완성."""
    s = set(_branches(d))
    out: list[dict] = []
    for i, trio in enumerate(BANGHAP_TRIO, 1):
        if all(x in s for x in trio):
            out.append({
                "조건명": f"{''.join(trio)} 방합(方合)",
                "wonmyung_keys": [f"23-{i}"],
                "confidence": "high",
                "oracle_needed": False,
            })
    return out


# --- 대24: 육합 -------------------------------------------------------------
# confidence=medium, oracle_needed=True (A만 발화)
def detect_dae24(d: dict) -> list[dict]:
    """대24: 지지 육합 페어 존재. A항만 발화(A/B 모순 콘텐츠)."""
    s = set(_branches(d))
    out: list[dict] = []
    for i, (a, b) in enumerate(YUKHAP_PAIR, 1):
        if a in s and b in s:
            out.append({
                "조건명": f"{a}{b} 육합(六合)",
                "wonmyung_keys": [f"24-{i}-A"],
                "confidence": "medium",
                "oracle_needed": True,
            })
    return out


# ---------------------------------------------------------------------------
# guikok HA~HH — 십신 그룹 기반 문장 조립
# ---------------------------------------------------------------------------
# DB 비접근 원칙에 따라 '실존 키 조회'는 호출측 콜러블로 분리한다.
# guikok_key_lookup(prefix: str, group: int) -> list[str]
#   prefix 분야코드(HA~HH)와 그룹(1~10)에 대해 DB 실존 idx_code 리스트를 반환해야 한다.
#   넘기지 않으면(None) guikok 탐지는 후보를 생성하지 않는다(거짓키 방지).

# 그룹 -> 십신 순서. (주의: g5/g6, g7/g8 순서 오라클 미확정)
GUIKOK_S2G: dict[str, int] = {
    "비견": 1, "겁재": 2, "식신": 3, "상관": 4, "정재": 5,
    "편재": 6, "편관": 7, "정관": 8, "편인": 9, "정인": 10,
}

GuikokKeyLookup = Callable[[str, int], list[str]]


def _guikok_detect(
    d: dict,
    prefix: str,
    src_primary: str,
    src_fallback: str,
    position: str,
    label: str,
    lookup: Optional[GuikokKeyLookup],
) -> list[dict]:
    """guikok 공통 탐지: position 위치의 십신으로 그룹 결정 후 실존 키 후보 반환.

    src_primary 우선('본인'/없음이면 src_fallback)으로 position 십신을 읽는다.
    lookup 미제공 시 빈 결과(거짓키 방지).
    """
    if lookup is None:
        return []
    tg = (d.get(src_primary) or {}).get(position)
    if not tg or tg == "본인":
        tg = (d.get(src_fallback) or {}).get(position)
    grp = GUIKOK_S2G.get(tg)
    if grp is None:
        return []
    keys = lookup(prefix, grp)
    if not keys:
        return []
    return [{
        "조건명": f"{prefix}-{label}-{tg}(그룹{grp})",
        "wonmyung_keys": list(keys),
        "confidence": "low",
        "oracle_needed": True,
    }]


def detect_HA(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HA: 본인 성격/적성. 월령 십신(지지 우선)으로 그룹 결정."""
    return _guikok_detect(d, "HA", "jiji_ten_gods", "ten_gods", "month", "본인성격적성", lookup)


def detect_HB(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HB: 부모운. 월주 십신(천간 우선)으로 그룹 결정."""
    return _guikok_detect(d, "HB", "ten_gods", "jiji_ten_gods", "month", "부모운", lookup)


def detect_HC(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HC: 형제운. 형제궁(월주) 십신(천간 우선)으로 그룹 결정."""
    return _guikok_detect(d, "HC", "ten_gods", "jiji_ten_gods", "month", "형제운", lookup)


def detect_HD(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HD: 배우자/결혼운. 일지 십신으로 그룹 결정(잠정).

    [이상징후] 형충·신살 결합 가능성이 높아 운영 적용 전 오라클 대조 필요.
    """
    if lookup is None:
        return []
    tg = (d.get("jiji_ten_gods") or {}).get("day")
    if not tg or tg == "본인":
        return []
    grp = GUIKOK_S2G.get(tg)
    if grp is None:
        return []
    keys = lookup("HD", grp)
    if not keys:
        return []
    return [{
        "조건명": f"HD-배우자결혼운-{tg}(그룹{grp})",
        "wonmyung_keys": list(keys),
        "confidence": "low",
        "oracle_needed": True,
    }]


def detect_HE(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HE: 자식운. 시주 십신(천간 우선)으로 그룹 결정."""
    return _guikok_detect(d, "HE", "ten_gods", "jiji_ten_gods", "hour", "자식운", lookup)


def detect_HF(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HF: 시기별 운세(초/중/말년).

    [확정] 36그룹(생애단계x운형) 구조로 십신 10그룹과 메커니즘이 근본적으로 다름.
    정적 원국 데이터만으로는 그룹 선택 불가 → 거짓양성 방지 위해 빈 결과 반환.
    """
    return []


def detect_HH(d: dict, lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """guikok HH: 직업/적성 세부. 본인 십신(월령 지지 우선)으로 그룹 결정."""
    return _guikok_detect(d, "HH", "jiji_ten_gods", "ten_gods", "month", "직업적성", lookup)


# ---------------------------------------------------------------------------
# 3) 통합 진입점
# ---------------------------------------------------------------------------

# 대1~대24 탐지 함수 목록 (호출 순서 보존)
_DAE_DETECTORS: tuple[Callable[[dict], list[dict]], ...] = (
    detect_dae1, detect_dae2, detect_dae3, detect_dae4, detect_dae5, detect_dae6,
    detect_dae7, detect_dae8, detect_dae9, detect_dae10, detect_dae11, detect_dae12,
    detect_dae13, detect_dae14, detect_dae15, detect_dae16, detect_dae17, detect_dae18,
    detect_dae19, detect_dae20, detect_dae21, detect_dae22, detect_dae23, detect_dae24,
)

# guikok 탐지 함수 목록
_GUIKOK_DETECTORS: tuple[Callable[..., list[dict]], ...] = (
    detect_HA, detect_HB, detect_HC, detect_HD, detect_HE, detect_HF, detect_HH,
)


def detect(d: dict, guikok_key_lookup: Optional[GuikokKeyLookup] = None) -> list[dict]:
    """모든 대분류 탐지를 실행해 발화 결과 리스트를 반환한다.

    각 항목은 {"조건명", "wonmyung_keys", "confidence", "oracle_needed"} 형식이다.
    confidence='low' / oracle_needed=True 룰도 결과에 포함하며 플래그를 유지한다(앱 '추정' 표기용).

    guikok(HA~HH)은 DB 실존 키 조회 콜러블 guikok_key_lookup 을 넘긴 경우에만 활성화된다.
    (DB 비접근 원칙 — 엔진은 키 산출 로직만 담당, 실존 키 조회·풀이 텍스트는 호출측 책임)
    """
    results: list[dict] = []
    for fn in _DAE_DETECTORS:
        try:
            results.extend(fn(d))
        except Exception:
            # 개별 탐지 실패가 전체를 막지 않도록 방어(차트 필드 누락 등)
            continue
    for fn in _GUIKOK_DETECTORS:
        try:
            results.extend(fn(d, guikok_key_lookup))
        except Exception:
            continue
    return results


# ---------------------------------------------------------------------------
# 5) 자체 스모크 테스트
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # 합성 샘플 차트 — 다수 탐지가 발화되도록 구성한 가상 명식
    sample = {
        "gender": "남",
        "pillars": {
            "year": {"stem": "甲", "branch": "子"},
            "month": {"stem": "己", "branch": "午"},
            "day": {"stem": "甲", "branch": "午"},   # 일간 甲(木), 甲己 천간합 → 대4
            "hour": {"stem": "庚", "branch": "申"},  # 子午 충(대10/대13), 午午 자형(대18)
        },
        "five_elements": {"목": 3, "화": 3, "토": 1, "금": 2, "수": 1},
        "strength_analysis": {
            "day_element": "목",
            "yongsin": ["수", "목"],
            "gisin": ["금"],
        },
        "ten_gods": {"year": "비견", "month": "정재", "hour": "편관"},
        "jiji_ten_gods": {"year": "정인", "month": "상관", "day": "상관", "hour": "편관"},
        "twelve_growth": {"year": "목욕", "month": "사", "day": "사", "hour": "절"},
        "gongmang": {"day": "申酉"},  # 시지 申 공망 → 대19/대21
    }

    print("=== detect() 기본 (guikok 비활성) ===")
    res = detect(sample)
    for r in res:
        flag = " [추정]" if (r["confidence"] == "low" or r["oracle_needed"]) else ""
        print(f"  {r['wonmyung_keys']!s:<22} conf={r['confidence']:<6} oracle={r['oracle_needed']!s:<5}{flag}  | {r['조건명']}")
    print(f"  -> 발화 {len(res)}건")

    # --- 키 형식 검증 (정규식) ---
    import re

    pat = re.compile(
        r"^("
        r"\d{1,2}-[A-Za-z0-9]+(-[A-Za-z0-9]+){0,2}"  # 대1~24 키
        r"|H[A-H]\(\d+\)"                              # guikok 키 (HA(1001) 형태)
        r")$"
    )
    bad = [k for r in res for k in r["wonmyung_keys"] if not pat.match(k)]
    assert not bad, f"키 형식 위반: {bad}"

    # --- 개별 탐지 핵심 단언 ---
    keyset = {k for r in res for k in r["wonmyung_keys"]}
    assert "4-1-A" in keyset, "대4 갑일+기합(남) 발화 실패"
    assert "10-1" in keyset, "대10 子午충 발화 실패"
    assert any(k.startswith("13-") for k in keyset), "대13 위치쌍 충 발화 실패"
    assert "18-2-A" in keyset, "대18 午午 자형 발화 실패"
    assert any(k.startswith("8-") for k in keyset), "대8 12운성 발화 실패"
    # 대19: 시지 申이 공망 → 19-4
    assert "19-4" in keyset, "대19 시지공망 발화 실패"
    # 대21: 시지(申) 지지십신 편관 → 21-7
    assert "21-7" in keyset, "대21 편관공망 발화 실패"

    # --- low/oracle 플래그 유지 확인 ---
    assert all({"조건명", "wonmyung_keys", "confidence", "oracle_needed"} <= set(r) for r in res), \
        "결과 스키마 위반"
    assert any(r["oracle_needed"] for r in res), "oracle_needed=True 룰 누락"

    # --- guikok 활성화 테스트 (콜러블 주입) ---
    def fake_lookup(prefix: str, group: int) -> list[str]:
        """테스트용 가짜 실존키 조회 — 그룹당 항 2개 반환."""
        return [f"{prefix}({group}01)", f"{prefix}({group}02)"]

    print("\n=== detect() guikok 활성 (가짜 lookup 주입) ===")
    res2 = detect(sample, guikok_key_lookup=fake_lookup)
    guikok_keys = [k for r in res2 for k in r["wonmyung_keys"] if k.startswith("H")]
    print(f"  guikok 발화 키: {guikok_keys}")
    assert guikok_keys, "guikok lookup 주입 시 발화 실패"
    assert all(re.match(r"^H[A-H]\(\d+\)$", k) for k in guikok_keys), "guikok 키 형식 위반"
    # HF는 항상 빈 결과
    assert not any(k.startswith("HF") for k in guikok_keys), "HF는 정적 차트로 미발화여야 함"

    # --- 빈/결측 차트 방어 테스트 ---
    print("\n=== 결측 차트 방어 테스트 ===")
    for empty in ({}, {"pillars": {}}, {"gender": "여"}):
        try:
            r = detect(empty)
            print(f"  입력 {empty!s:<24} -> {len(r)}건 (예외 없음)")
        except Exception as e:  # 발생하면 안 됨
            raise AssertionError(f"결측 차트에서 예외: {e}")

    print("\n[OK] 모든 스모크 테스트 통과")
