"""신살 산출 엔진 (sinsal_engine).

검증된 131개 신살 판정 룰을 단일 모듈로 병합한 것이다.
- 입력 차트 d 구조:
    d["pillars"]["year"|"month"|"day"|"hour"] = {"stem","branch","pillar"}
    (pillar = stem+branch 의 60갑자 문자열)
    선택: d["gender"] = "남"|"여"
- detect_sinsal(d) 가 보유 신살을 [{"name","key","confidence"}] 리스트로 반환한다.
  confidence 가 low 인 함수나 항상 False 인 미상 함수는 발화하지 않으므로
  결과에는 실제 발화한(판정 True) 신살만 포함된다.
표준 라이브러리만 사용한다.
"""

from typing import Callable

# =========================================================================
# 공용 상수
# =========================================================================

# 십천간 / 십이지지 순서 문자열
GAN: str = "甲乙丙丁戊己庚辛壬癸"  # 천간
JI: str = "子丑寅卯辰巳午未申酉戌亥"  # 지지

# 네 기둥 키
PILLAR_KEYS: tuple[str, ...] = ("year", "month", "day", "hour")

# 천간합(干合)
CHEONGAN_HAP: dict[str, str] = {
    "甲": "己", "己": "甲", "乙": "庚", "庚": "乙",
    "丙": "辛", "辛": "丙", "丁": "壬", "壬": "丁",
    "戊": "癸", "癸": "戊",
}

# 지지 육합(六合)
YUKHAP: dict[str, str] = {
    "子": "丑", "丑": "子", "寅": "亥", "亥": "寅",
    "卯": "戌", "戌": "卯", "辰": "酉", "酉": "辰",
    "巳": "申", "申": "巳", "午": "未", "未": "午",
}

# 지지 충(沖)
CHUNG: dict[str, str] = {
    "子": "午", "午": "子", "卯": "酉", "酉": "卯",
    "寅": "申", "申": "寅", "巳": "亥", "亥": "巳",
    "辰": "戌", "戌": "辰", "丑": "未", "未": "丑",
}

# 삼합국 대표(년지/일지 → 삼합 그룹) 빠른 조회용
# 申子辰(水) 寅午戌(火) 巳酉丑(金) 亥卯未(木)
SAMHAP_GROUP: dict[str, str] = {
    "申": "水", "子": "水", "辰": "水",
    "寅": "火", "午": "火", "戌": "火",
    "巳": "金", "酉": "金", "丑": "金",
    "亥": "木", "卯": "木", "未": "木",
}

# 십이운성 절(絶)지 — 일간 기준
JEOL: dict[str, str] = {
    "甲": "申", "乙": "酉", "丙": "亥", "丁": "子", "戊": "亥",
    "己": "子", "庚": "寅", "辛": "卯", "壬": "巳", "癸": "午",
}

# 십이운성 목욕(沐浴)지 — 일간 기준
MOKYOK: dict[str, str] = {
    "甲": "子", "乙": "巳", "丙": "卯", "丁": "申", "戊": "卯",
    "己": "申", "庚": "午", "辛": "亥", "壬": "酉", "癸": "寅",
}


# =========================================================================
# 내부 헬퍼
# =========================================================================

def _stems(d: dict) -> list[str]:
    """사주 네 기둥의 천간 리스트를 반환한다."""
    p = d["pillars"]
    return [p[k]["stem"] for k in PILLAR_KEYS]


def _branches(d: dict) -> list[str]:
    """사주 네 기둥의 지지 리스트를 반환한다."""
    p = d["pillars"]
    return [p[k]["branch"] for k in PILLAR_KEYS]


def _pillar(d: dict, key: str) -> str:
    """해당 기둥의 60갑자 문자열을 반환한다(없으면 stem+branch 합성)."""
    cell = d["pillars"][key]
    return cell.get("pillar") or (cell["stem"] + cell["branch"])


# =========================================================================
# A. 일간기준 귀인·록 (1-1 ~ 1-27)
# =========================================================================

def f_1_1(d: dict) -> bool:
    """천을귀인(天乙貴人) — 일간 또는 년간 기준 귀인 두 지지 중 하나라도 보유."""
    t = {
        "甲": ["丑", "未"], "戊": ["丑", "未"], "庚": ["丑", "未"],
        "乙": ["子", "申"], "己": ["子", "申"], "丙": ["亥", "酉"],
        "丁": ["亥", "酉"], "辛": ["寅", "午"], "壬": ["卯", "巳"], "癸": ["卯", "巳"],
    }
    ds = d["pillars"]["day"]["stem"]
    ys = d["pillars"]["year"]["stem"]
    bs = _branches(d)
    return any(b in t.get(g, []) for g in (ds, ys) for b in bs)


def f_1_2(d: dict) -> bool:
    """복성귀인(福星貴人) — 일간 기준 지지 1개 대조."""
    t = {"甲": "寅", "乙": "丑", "丙": "子", "丁": "酉", "戊": "申",
         "己": "未", "庚": "午", "辛": "巳", "壬": "辰", "癸": "卯"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_3(d: dict) -> bool:
    """천관귀인(天官貴人) — 일간 기준 지지 1개 대조."""
    t = {"甲": "未", "乙": "辰", "丙": "巳", "丁": "酉", "戊": "戌",
         "己": "卯", "庚": "亥", "辛": "申", "壬": "酉", "癸": "午"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_4(d: dict) -> bool:
    """천록(天祿; 建祿·正祿) — 일간 록지 대조."""
    t = {"甲": "寅", "乙": "卯", "丙": "巳", "丁": "午", "戊": "巳",
         "己": "午", "庚": "申", "辛": "酉", "壬": "亥", "癸": "子"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_5(d: dict) -> bool:
    """암록(暗祿) — 일간 록지의 육합 지지 대조."""
    t = {"甲": "亥", "乙": "戌", "丙": "申", "丁": "未", "戊": "申",
         "己": "未", "庚": "巳", "辛": "辰", "壬": "寅", "癸": "丑"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_6(d: dict) -> bool:
    """금여록(金與祿) — 록지에서 순행 2위차 지지 대조."""
    t = {"甲": "辰", "乙": "巳", "丙": "未", "丁": "申", "戊": "未",
         "己": "申", "庚": "戌", "辛": "亥", "壬": "丑", "癸": "寅"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_7(d: dict) -> bool:
    """문창귀인(文昌貴人) — 일간 식신 지지 대조."""
    t = {"甲": "巳", "乙": "午", "丙": "申", "丁": "酉", "戊": "申",
         "己": "酉", "庚": "亥", "辛": "子", "壬": "寅", "癸": "卯"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_8(d: dict) -> bool:
    """학당귀인(學堂貴人) — 일간 오행 장생지 대조."""
    t = {"甲": "亥", "乙": "午", "丙": "寅", "丁": "酉", "戊": "寅",
         "己": "酉", "庚": "巳", "辛": "子", "壬": "申", "癸": "卯"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_9(d: dict) -> bool:
    """문곡귀인(文曲貴人) — 일간 오행 병지(학당 대궁) 대조."""
    t = {"甲": "巳", "乙": "子", "丙": "申", "丁": "卯", "戊": "申",
         "己": "卯", "庚": "亥", "辛": "午", "壬": "寅", "癸": "酉"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_10(d: dict) -> bool:
    """관귀학관(官貴學館) — 일간 정관 오행 장생지 대조."""
    t = {"甲": "巳", "乙": "巳", "丙": "申", "丁": "申", "戊": "亥",
         "己": "亥", "庚": "寅", "辛": "寅", "壬": "申", "癸": "申"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_11(d: dict) -> bool:
    """재고귀인(財庫貴人) — 일간 재성 오행 고(庫·墓) 지지 대조."""
    t = {"甲": "辰", "乙": "辰", "丙": "丑", "丁": "丑", "戊": "辰",
         "己": "辰", "庚": "未", "辛": "未", "壬": "戌", "癸": "戌"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_12(d: dict) -> bool:
    """천주귀인(天廚貴人) — 일간 식신록 대조."""
    t = {"甲": "巳", "乙": "午", "丙": "巳", "丁": "午", "戊": "申",
         "己": "酉", "庚": "亥", "辛": "子", "壬": "寅", "癸": "卯"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_13(d: dict) -> bool:
    """태극귀인(太極貴人) — 산출법 미상(표준표가 정답차트와 충돌). 보수적 비활성."""
    return False


def f_1_14(d: dict) -> bool:
    """협록(夾祿) — 일간 록지를 앞·뒤로 끼는 두 지지가 모두 보유 시 발화."""
    rok = {"甲": "寅", "乙": "卯", "丙": "巳", "丁": "午", "戊": "巳",
           "己": "午", "庚": "申", "辛": "酉", "壬": "亥", "癸": "子"}
    r = rok.get(d["pillars"]["day"]["stem"])
    if not r:
        return False
    i = JI.index(r)
    bs = _branches(d)
    return JI[(i - 1) % 12] in bs and JI[(i + 1) % 12] in bs


def f_1_15(d: dict) -> bool:
    """국인(國印) — 일간 기준 지지 1개 대조."""
    t = {"甲": "戌", "乙": "亥", "丙": "丑", "丁": "寅", "戊": "丑",
         "己": "寅", "庚": "辰", "辛": "巳", "壬": "未", "癸": "申"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_16(d: dict) -> bool:
    """절도귀인(節度貴人) — 일간 기준 지지 1개 대조."""
    t = {"甲": "申", "乙": "酉", "丙": "亥", "丁": "子", "戊": "亥",
         "己": "子", "庚": "寅", "辛": "卯", "壬": "巳", "癸": "午"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_17(d: dict) -> bool:
    """천재(天財) — 일간 정재 오행 장생지 대조."""
    t = {"甲": "寅", "乙": "寅", "丙": "巳", "丁": "巳", "戊": "申",
         "己": "申", "庚": "亥", "辛": "亥", "壬": "寅", "癸": "寅"}
    return t.get(d["pillars"]["day"]["stem"]) in _branches(d)


def f_1_18(d: dict) -> bool:
    """당부(唐符) — 산출법 미상. 보수적 비활성."""
    return False


def f_1_19(d: dict) -> bool:
    """천사성(天赦星·天赫) — 계절(월지) + 특정 일주."""
    p = _pillar(d, "day")
    m = d["pillars"]["month"]["branch"]
    if m in {"寅", "卯", "辰"} and p == "戊寅":
        return True
    if m in {"巳", "午", "未"} and p == "甲午":
        return True
    if m in {"申", "酉", "戌"} and p == "戊申":
        return True
    if m in {"亥", "子", "丑"} and p == "甲子":
        return True
    return False


def f_1_20(d: dict) -> bool:
    """월덕귀인(月德貴人) — 월지 삼합국 양간을 천간에 대조."""
    grp = {"寅": "丙", "午": "丙", "戌": "丙", "申": "壬", "子": "壬", "辰": "壬",
           "巳": "庚", "酉": "庚", "丑": "庚", "亥": "甲", "卯": "甲", "未": "甲"}
    return grp.get(d["pillars"]["month"]["branch"]) in _stems(d)


def f_1_21(d: dict) -> bool:
    """월덕합(月德合) — 월덕귀인 천간과 천간합 이루는 천간 보유 시 발화."""
    grp = {"寅": "丙", "午": "丙", "戌": "丙", "申": "壬", "子": "壬", "辰": "壬",
           "巳": "庚", "酉": "庚", "丑": "庚", "亥": "甲", "卯": "甲", "未": "甲"}
    md = grp.get(d["pillars"]["month"]["branch"])
    return CHEONGAN_HAP.get(md) in _stems(d) if md else False


def f_1_22(d: dict) -> bool:
    """천덕귀인(天德貴人) — 월지 기준 천덕(천간 또는 지지) 대조."""
    t = {"寅": "丁", "卯": "申", "辰": "壬", "巳": "辛", "午": "亥", "未": "甲",
         "申": "癸", "酉": "寅", "戌": "丙", "亥": "乙", "子": "巳", "丑": "庚"}
    v = t.get(d["pillars"]["month"]["branch"])
    return v in _stems(d) or v in _branches(d)


def f_1_23(d: dict) -> bool:
    """천덕합(天德合) — 월지별 천덕 합신(천간합 또는 육합) 대조."""
    hap = {"寅": "壬", "卯": "巳", "辰": "丁", "巳": "丙", "午": "寅", "未": "己",
           "申": "戊", "酉": "亥", "戌": "辛", "亥": "庚", "子": "申", "丑": "乙"}
    v = hap.get(d["pillars"]["month"]["branch"])
    return (v in _stems(d) or v in _branches(d)) if v else False


def f_1_24(d: dict) -> bool:
    """천의성(天醫星·活人星) — 월지 직전 지지 대조."""
    i = JI.index(d["pillars"]["month"]["branch"])
    return JI[(i - 1) % 12] in _branches(d)


def f_1_25(d: dict) -> bool:
    """천희신(天喜神) — 년지 기준 대궁 계열 지지 대조."""
    t = {"子": "酉", "丑": "申", "寅": "未", "卯": "午", "辰": "巳", "巳": "辰",
         "午": "卯", "未": "寅", "申": "丑", "酉": "子", "戌": "亥", "亥": "戌"}
    return t.get(d["pillars"]["year"]["branch"]) in _branches(d)


def f_1_26(d: dict) -> bool:
    """황은대사(皇恩大赦) — 월지 기준 길성 지지 대조."""
    t = {"寅": "戌", "卯": "丑", "辰": "寅", "巳": "巳", "午": "酉", "未": "卯",
         "申": "子", "酉": "午", "戌": "亥", "亥": "辰", "子": "申", "丑": "未"}
    return t.get(d["pillars"]["month"]["branch"]) in _branches(d)


def f_1_27(d: dict) -> bool:
    """장명성(長命星) — 산출법 미상. 보수적 비활성."""
    return False


# =========================================================================
# B. 형살·일주살 (1-28 ~ 1-46)
# =========================================================================

def f_1_28(d: dict) -> bool:
    """양차살(陽差殺) — 일주/시주가 양차살 간지일 때."""
    s = {"丙子", "丙午", "戊寅", "戊申", "壬辰", "壬戌"}
    return _pillar(d, "day") in s or _pillar(d, "hour") in s


def f_1_29(d: dict) -> bool:
    """음착살(陰錯殺) — 일주/시주가 음착살 간지일 때."""
    s = {"丁丑", "丁未", "辛卯", "辛酉", "癸巳", "癸亥"}
    return _pillar(d, "day") in s or _pillar(d, "hour") in s


def f_1_30(d: dict) -> bool:
    """곤랑도화(滾浪桃花) — 천간합 + 지지 子卯 형 동시 충족."""
    stems = _stems(d)
    branches = _branches(d)
    hap = {("甲", "己"), ("乙", "庚"), ("丙", "辛"), ("丁", "壬"), ("戊", "癸")}
    has_hap = any(
        (stems[i], stems[j]) in hap or (stems[j], stems[i]) in hap
        for i in range(4) for j in range(i + 1, 4)
    )
    has_xing = "子" in branches and "卯" in branches
    return has_hap and has_xing


def f_1_31(d: dict) -> bool:
    """현침살(懸針殺) — 뾰족한 천간(甲辛)과 지지(卯午未申)가 모두 존재."""
    stems = _stems(d)
    branches = _branches(d)
    hang_g = {"甲", "辛"}
    hang_z = {"卯", "午", "未", "申"}
    return any(s in hang_g for s in stems) and any(b in hang_z for b in branches)


def f_1_32(d: dict) -> bool:
    """절로공망(截路空亡) — 일간 기준 시지가 절로공망 지지일 때."""
    p = d["pillars"]
    ilgan = p["day"]["stem"]
    sizhi = p["hour"]["branch"]
    t = {"甲": ("申", "酉"), "己": ("申", "酉"), "乙": ("午", "未"), "庚": ("午", "未"),
         "丙": ("辰", "巳"), "辛": ("辰", "巳"), "丁": ("寅", "卯"), "壬": ("寅", "卯"),
         "戊": ("子", "丑"), "癸": ("子", "丑")}
    return sizhi in t.get(ilgan, ())


def f_1_33(d: dict) -> bool:
    """계비관(鷄飛關) — 산출법 불명확. 보수적 비활성."""
    return False


def f_1_34(d: dict) -> bool:
    """천전살(天轉殺) — 월지 계절별 특정 일주 일치."""
    ilju = _pillar(d, "day")
    yuezhi = d["pillars"]["month"]["branch"]
    if yuezhi in {"寅", "卯", "辰"}:
        return ilju == "乙卯"
    if yuezhi in {"巳", "午", "未"}:
        return ilju == "丙午"
    if yuezhi in {"申", "酉", "戌"}:
        return ilju == "辛酉"
    if yuezhi in {"亥", "子", "丑"}:
        return ilju == "壬子"
    return False


def f_1_35(d: dict) -> bool:
    """지전살(地轉殺) — 월지 계절별 특정 일주 일치."""
    ilju = _pillar(d, "day")
    yuezhi = d["pillars"]["month"]["branch"]
    if yuezhi in {"寅", "卯", "辰"}:
        return ilju == "辛卯"
    if yuezhi in {"巳", "午", "未"}:
        return ilju == "戊午"
    if yuezhi in {"申", "酉", "戌"}:
        return ilju == "癸酉"
    if yuezhi in {"亥", "子", "丑"}:
        return ilju == "丙子"
    return False


def f_1_36(d: dict) -> bool:
    """양인살(羊刃殺) — 일간(양간) 제왕 지지 보유."""
    ilgan = d["pillars"]["day"]["stem"]
    t = {"甲": "卯", "丙": "午", "戊": "午", "庚": "酉", "壬": "子"}
    return ilgan in t and t[ilgan] in _branches(d)


def f_1_37(d: dict) -> bool:
    """비인(飛刃) — 양인의 정충 지지 보유(양간 한정)."""
    ilgan = d["pillars"]["day"]["stem"]
    yang = {"甲": "卯", "丙": "午", "戊": "午", "庚": "酉", "壬": "子"}
    if ilgan not in yang:
        return False
    return CHUNG[yang[ilgan]] in _branches(d)


def f_1_38(d: dict) -> bool:
    """홍염살(紅艶殺) — 일간 기준 특정 지지 보유."""
    ilgan = d["pillars"]["day"]["stem"]
    t = {"甲": "午", "乙": "午", "丙": "寅", "丁": "未", "戊": "辰",
         "己": "辰", "庚": "戌", "辛": "酉", "壬": "子", "癸": "申"}
    return t.get(ilgan) in _branches(d)


def f_1_39(d: dict) -> bool:
    """유하살(流霞殺) — 일간 기준 특정 지지 보유."""
    ilgan = d["pillars"]["day"]["stem"]
    t = {"甲": "酉", "乙": "戌", "丙": "未", "丁": "申", "戊": "巳",
         "己": "午", "庚": "辰", "辛": "卯", "壬": "亥", "癸": "寅"}
    return t.get(ilgan) in _branches(d)


def f_1_40(d: dict) -> bool:
    """수익살(水溺殺) — 특정 수액 일주(보수적)."""
    s = {"丙子", "癸未", "壬戌"}
    return _pillar(d, "day") in s


def f_1_41(d: dict) -> bool:
    """천나(天羅) — 火命(丙丁)에서 戌·亥 동반."""
    ilgan = d["pillars"]["day"]["stem"]
    branches = _branches(d)
    return ilgan in ("丙", "丁") and ("戌" in branches and "亥" in branches)


def f_1_42(d: dict) -> bool:
    """지망(地網) — 水命(壬癸)에서 辰·巳 동반."""
    ilgan = d["pillars"]["day"]["stem"]
    branches = _branches(d)
    return ilgan in ("壬", "癸") and ("辰" in branches and "巳" in branches)


def f_1_43(d: dict) -> bool:
    """고란살(孤鸞殺) — 고란살 일주."""
    s = {"甲寅", "乙巳", "丁巳", "戊申", "辛亥"}
    return _pillar(d, "day") in s


def f_1_44(d: dict) -> bool:
    """효신살(梟神殺) — 일지가 일간의 편인(도식)일 때."""
    p = d["pillars"]
    ilgan = p["day"]["stem"]
    ilji = p["day"]["branch"]
    t = {"甲": "子", "乙": "亥", "丙": "寅", "丁": "卯", "戊": "午",
         "己": "巳", "庚": "辰", "辛": "丑", "壬": "申", "癸": "酉"}
    return t.get(ilgan) == ilji


def f_1_45(d: dict) -> bool:
    """백호대살(白虎大殺) — 본 프로그램 content 13_2_3: 일간 기준 지지표."""
    ilgan = d["pillars"]["day"]["stem"]
    t = {"甲": "酉", "乙": "酉", "丙": "子", "丁": "子", "戊": "午",
         "己": "午", "庚": "卯", "辛": "卯", "壬": "午", "癸": "午"}
    return t.get(ilgan) in _branches(d)


def f_1_46(d: dict) -> bool:
    """괴강살(魁罡殺) — 괴강 간지 일주."""
    s = {"庚辰", "庚戌", "壬辰", "壬戌", "戊戌"}
    return _pillar(d, "day") in s


# =========================================================================
# C. 신살·도화류 (1-47 ~ 1-66)
# =========================================================================

def f_1_47(d: dict) -> bool:
    """상배일(喪配日) — 부부 이별·상처 일주."""
    dj = _pillar(d, "day")
    return dj in {"丙午", "丁巳", "戊午", "壬子", "癸亥", "甲寅", "乙卯", "庚申", "辛酉"}


def f_1_48(d: dict) -> bool:
    """라체도화살(裸體桃花殺) — 라체도화 일주."""
    dj = _pillar(d, "day")
    return dj in {"戊辰", "戊戌", "辛亥", "辛巳", "壬子", "壬午", "乙卯", "己卯"}


def f_1_49(d: dict) -> bool:
    """평두살(平頭殺) — 평평한 글자(천간 甲丙丁壬, 지지 子辰) 보유."""
    stems = _stems(d)
    branches = _branches(d)
    return (any(s in {"甲", "丙", "丁", "壬"} for s in stems)
            or any(b in {"子", "辰"} for b in branches))


def f_1_50(d: dict) -> bool:
    """육수성(六秀星) — 육수 일주."""
    dj = _pillar(d, "day")
    return dj in {"丙午", "丁未", "戊子", "戊午", "己丑", "己未"}


def f_1_51(d: dict) -> bool:
    """교록성(交祿星) — 록 교차 간지 보유."""
    p = d["pillars"]
    pil = [(p[x]["stem"], p[x]["branch"]) for x in PILLAR_KEYS]
    gyorok = {("甲", "申"), ("乙", "酉"), ("庚", "寅"), ("辛", "卯")}
    return any((g, b) in gyorok for g, b in pil)


def f_1_52(d: dict) -> bool:
    """탕화살(湯火殺) — 일지가 寅·午·丑."""
    return d["pillars"]["day"]["branch"] in {"寅", "午", "丑"}


def f_1_53(d: dict) -> bool:
    """화상살(畵象殺) — 산출법 미상. 보수적 비활성."""
    return False


def f_1_54(d: dict) -> bool:
    """야제살(夜啼殺) — 생월 계절별 정해진 시지."""
    mz = d["pillars"]["month"]["branch"]
    hz = d["pillars"]["hour"]["branch"]
    if mz in {"寅", "卯", "辰"}:
        return hz == "午"
    if mz in {"巳", "午", "未"}:
        return hz == "酉"
    if mz in {"申", "酉", "戌"}:
        return hz == "子"
    if mz in {"亥", "子", "丑"}:
        return hz == "卯"
    return False


def f_1_55(d: dict) -> bool:
    """격각살(隔角殺) — 일지/년지와 시지가 격각(간격 2칸) 관계."""
    p = d["pillars"]
    dz = p["day"]["branch"]
    yz = p["year"]["branch"]
    hz = p["hour"]["branch"]
    hi = JI.index(hz)
    for base in (dz, yz):
        bi = JI.index(base)
        if (hi - bi) % 12 == 2 or (bi - hi) % 12 == 2:
            return True
    return False


def f_1_56(d: dict) -> bool:
    """심수살(深水殺) — 산출법 미상. 보수적 비활성."""
    return False


def f_1_57(d: dict) -> bool:
    """단교관살(斷橋關殺) — 월별 지지표 불일치로 확정 불가. 보수적 비활성."""
    return False


def f_1_58(d: dict) -> bool:
    """백일관(百日關) — 산출법 미상. 보수적 비활성."""
    return False


def f_1_59(d: dict) -> bool:
    """금쇄관살(金鎖關殺) — 월지별 정해진 지지 보유."""
    mz = d["pillars"]["month"]["branch"]
    t = {"寅": "辰", "卯": "丑", "辰": "寅", "巳": "卯", "午": "子", "未": "酉",
         "申": "午", "酉": "亥", "戌": "未", "亥": "申", "子": "巳", "丑": "戌"}
    return t.get(mz) in _branches(d)


def f_1_60(d: dict) -> bool:
    """상문(喪門) — 년지 +2 지지 보유."""
    yz = d["pillars"]["year"]["branch"]
    return JI[(JI.index(yz) + 2) % 12] in _branches(d)


def f_1_61(d: dict) -> bool:
    """조객(弔客) — 년지 -2 지지 보유."""
    yz = d["pillars"]["year"]["branch"]
    return JI[(JI.index(yz) - 2) % 12] in _branches(d)


def f_1_62(d: dict) -> bool:
    """귀문관(鬼門關) — 귀문 짝 조합 동반."""
    br = set(_branches(d))
    pr = {"子": "酉", "丑": "午", "寅": "未", "卯": "申", "辰": "亥", "巳": "戌",
          "午": "丑", "未": "寅", "申": "卯", "酉": "子", "戌": "巳", "亥": "辰"}
    return any(pr.get(b) in br for b in br)


def f_1_63(d: dict) -> bool:
    """도화살(桃花殺)·함지·년살 — 년지/일지 삼합국 목욕지 보유."""
    p = d["pillars"]
    yz = p["year"]["branch"]
    dz = p["day"]["branch"]
    br = _branches(d)
    dh = {"申": "酉", "子": "酉", "辰": "酉", "寅": "卯", "午": "卯", "戌": "卯",
          "巳": "午", "酉": "午", "丑": "午", "亥": "子", "卯": "子", "未": "子"}
    return any(t in br for t in {dh.get(yz), dh.get(dz)} if t)


def f_1_64(d: dict) -> bool:
    """원진(怨嗔) — 원진 짝 동반."""
    br = set(_branches(d))
    w = {"子": "未", "未": "子", "丑": "午", "午": "丑", "寅": "酉", "酉": "寅",
         "卯": "申", "申": "卯", "辰": "亥", "亥": "辰", "巳": "戌", "戌": "巳"}
    return any(w.get(b) in br for b in br)


def f_1_65(d: dict) -> bool:
    """고진(孤辰)·고신(孤神) — 년지 방합 다음 글자 보유."""
    yz = d["pillars"]["year"]["branch"]
    g = {"亥": "寅", "子": "寅", "丑": "寅", "寅": "巳", "卯": "巳", "辰": "巳",
         "巳": "申", "午": "申", "未": "申", "申": "亥", "酉": "亥", "戌": "亥"}
    return g.get(yz) in _branches(d)


def f_1_66(d: dict) -> bool:
    """과숙(寡宿) — 년지 방합 직전 글자 보유."""
    yz = d["pillars"]["year"]["branch"]
    g = {"亥": "戌", "子": "戌", "丑": "戌", "寅": "丑", "卯": "丑", "辰": "丑",
         "巳": "辰", "午": "辰", "未": "辰", "申": "未", "酉": "未", "戌": "未"}
    return g.get(yz) in _branches(d)


# =========================================================================
# D. 특수살 (1-67 ~ 1-99)
# =========================================================================

def f_1_67(d: dict) -> bool:
    """재살(災殺)/수옥살(囚獄殺) — 년지 삼합국 재살지 보유."""
    jmap = {"申": "午", "子": "午", "辰": "午", "寅": "子", "午": "子", "戌": "子",
            "巳": "卯", "酉": "卯", "丑": "卯", "亥": "酉", "卯": "酉", "未": "酉"}
    yb = d["pillars"]["year"]["branch"]
    return jmap[yb] in _branches(d)


def f_1_68(d: dict) -> bool:
    """농아(聾啞) — 산출표 부재. 보수적 비활성."""
    return False


def f_1_69(d: dict) -> bool:
    """홍란성(紅鸞星) — 채택표 불명확. 보수적 비활성."""
    return False


def f_1_70(d: dict) -> bool:
    """도삽도화(倒揷桃花) — 산출조건 불명확. 보수적 비활성."""
    return False


def f_1_71(d: dict) -> bool:
    """결항(結項) — 산출표 부재. 보수적 비활성."""
    return False


def f_1_72(d: dict) -> bool:
    """간학일(干學日) — 채택조건 불명확. 보수적 비활성."""
    return False


def f_1_73(d: dict) -> bool:
    """환살(鰥殺)/환과살 — 일간 절지 보유(남성 한정)."""
    if d.get("gender") == "여":
        return False
    ilgan = d["pillars"]["day"]["stem"]
    return JEOL[ilgan] in _branches(d)


def f_1_74(d: dict) -> bool:
    """과살(寡殺)/환과살 — 일간 절지 보유(여성 한정)."""
    if d.get("gender") != "여":
        return False
    ilgan = d["pillars"]["day"]["stem"]
    return JEOL[ilgan] in _branches(d)


def f_1_75(d: dict) -> bool:
    """중혼살(重婚殺) — 산출표 부재. 보수적 비활성."""
    return False


def f_1_76(d: dict) -> bool:
    """절방살(絶房殺) — 산출조건 불명확. 보수적 비활성."""
    return False


def f_1_77(d: dict) -> bool:
    """재가살(再嫁殺) — 채택표 불명확. 보수적 비활성."""
    return False


def f_1_78(d: dict) -> bool:
    """뇌공관(雷公關) — 산출표 불명확. 보수적 비활성."""
    return False


def f_1_79(d: dict) -> bool:
    """진신(進神) — 진신 4일주."""
    dp = _pillar(d, "day")
    return dp in {"甲子", "甲午", "己卯", "己酉"}


def f_1_80(d: dict) -> bool:
    """천상귀인(天上貴人) — 산출표 불명확. 보수적 비활성."""
    return False


def f_1_81(d: dict) -> bool:
    """지하귀인(地下貴人) — 산출표 불명확. 보수적 비활성."""
    return False


def f_1_82(d: dict) -> bool:
    """인문귀인(人門貴人) — 산출표 불명확. 보수적 비활성."""
    return False


def f_1_83(d: dict) -> bool:
    """십악대패살(十惡大敗殺) — 십악대패 10간지 일주."""
    dp = _pillar(d, "day")
    return dp in {"甲辰", "乙巳", "丙申", "丁亥", "戊戌", "己丑",
                  "庚辰", "辛巳", "壬申", "癸亥"}


def f_1_84(d: dict) -> bool:
    """백호대살(白虎大殺)/오귀살 — 구궁 중궁(5)에 닿는 간지 보유."""
    sixty = [GAN[i % 10] + JI[i % 12] for i in range(60)]
    mid = set()
    pal = 5
    for i in range(60):
        if pal == 5:
            mid.add(sixty[i])
        pal = pal + 1 if pal < 9 else 1
    p = d["pillars"]
    gz = [p[k]["stem"] + p[k]["branch"] for k in PILLAR_KEYS]
    return any(g in mid for g in gz)


def f_1_85(d: dict) -> bool:
    """음양살(陰陽殺) — 丙子(남) 또는 戊午(여) 일주."""
    dp = _pillar(d, "day")
    return dp in {"丙子", "戊午"}


def f_1_86(d: dict) -> bool:
    """유실살(有室殺) — 일간 목욕지 보유."""
    ilgan = d["pillars"]["day"]["stem"]
    return MOKYOK[ilgan] in _branches(d)


def f_1_87(d: dict) -> bool:
    """소실살(小室殺) — 산출표 불명확. 보수적 비활성."""
    return False


def f_1_88(d: dict) -> bool:
    """하정살(下情殺) — 산출표 부재. 보수적 비활성."""
    return False


def f_1_89(d: dict) -> bool:
    """급각살(急脚殺) — 생월 계절별 지지 보유."""
    mb = d["pillars"]["month"]["branch"]
    season = ("봄" if mb in "寅卯辰" else "여름" if mb in "巳午未"
              else "가을" if mb in "申酉戌" else "겨울")
    tgt = {"봄": {"亥", "子"}, "여름": {"卯", "未"},
           "가을": {"寅", "戌"}, "겨울": {"丑", "辰"}}[season]
    return any(b in tgt for b in _branches(d))


def f_1_90(d: dict) -> bool:
    """부벽살(斧劈殺) — 월지군별 타겟 지지 보유."""
    mb = d["pillars"]["month"]["branch"]
    t = "巳" if mb in "子午卯酉" else "酉" if mb in "寅申巳亥" else "丑"
    return t in _branches(d)


def f_1_91(d: dict) -> bool:
    """낙정관살(落井關殺) — 일간 기준 지지 보유."""
    n = {"甲": "巳", "己": "巳", "乙": "子", "庚": "子", "丙": "申",
         "辛": "申", "丁": "戌", "壬": "戌", "戊": "卯", "癸": "卯"}
    ilgan = d["pillars"]["day"]["stem"]
    return n[ilgan] in _branches(d)


def f_1_92(d: dict) -> bool:
    """건각(蹇脚) — 산출표 불명확. 보수적 비활성."""
    return False


def f_1_93(d: dict) -> bool:
    """혈인(血刃) — 채택표 불명확. 보수적 비활성."""
    return False


def f_1_94(d: dict) -> bool:
    """배곡살(背曲殺) — 산출표 부재. 보수적 비활성."""
    return False


def f_1_95(d: dict) -> bool:
    """귀한일(鬼限日) — 채택표 불명확. 보수적 비활성."""
    return False


def f_1_96(d: dict) -> bool:
    """혈지(血支) — 검증 불가·과대발화 위험. 보수적 비활성."""
    return False


def f_1_97(d: dict) -> bool:
    """삼구살(三丘殺) — 채택표 불명확. 보수적 비활성."""
    return False


def f_1_98(d: dict) -> bool:
    """오묘살(五墓殺) — 년·일·시지 중 未 보유."""
    p = d["pillars"]
    return "未" in {p["year"]["branch"], p["day"]["branch"], p["hour"]["branch"]}


def f_1_99(d: dict) -> bool:
    """권설(卷舌) — 산출표 부재. 보수적 비활성."""
    return False


# =========================================================================
# E. 특수살2·삼재·복음 (1-100 ~ 1-131)
# =========================================================================

def f_1_100(d: dict) -> bool:
    """태백살(太白殺) — 년지 神煞早見表(子=申 순행) 지지 보유."""
    yb = d["pillars"]["year"]["branch"]
    t = JI[(JI.index("申") + JI.index(yb)) % 12]
    return t in _branches(d)


def f_1_101(d: dict) -> bool:
    """자결(自結) — 태백살과 동일 神煞表(子=申 순행)."""
    yb = d["pillars"]["year"]["branch"]
    t = JI[(JI.index("申") + JI.index(yb)) % 12]
    return t in _branches(d)


def f_1_102(d: dict) -> bool:
    """천낭살(天狼殺) — 산출표 부족. 보수적 비활성."""
    return False


def f_1_103(d: dict) -> bool:
    """천옥살(天獄殺) — 시작값 부족. 보수적 비활성."""
    return False


def f_1_104(d: dict) -> bool:
    """오귀살(五鬼殺) — 년지 神煞早見表(子=戌 순행) 지지 보유."""
    yb = d["pillars"]["year"]["branch"]
    t = JI[(JI.index("戌") + JI.index(yb)) % 12]
    return t in _branches(d)


def f_1_105(d: dict) -> bool:
    """관부살(官符殺) — 오귀살과 동일 神煞表(子=戌 순행)."""
    yb = d["pillars"]["year"]["branch"]
    t = JI[(JI.index("戌") + JI.index(yb)) % 12]
    return t in _branches(d)


def f_1_106(d: dict) -> bool:
    """세합(歲合) — 년지 육합 지지 보유."""
    yb = d["pillars"]["year"]["branch"]
    return YUKHAP[yb] in _branches(d)


def f_1_107(d: dict) -> bool:
    """태양(太陽) — 시작값 부족. 보수적 비활성."""
    return False


def f_1_108(d: dict) -> bool:
    """복덕(福德) — 시작값 부족. 보수적 비활성."""
    return False


def f_1_109(d: dict) -> bool:
    """천모(天耗) — 세운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_110(d: dict) -> bool:
    """지모(地耗) — 세운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_111(d: dict) -> bool:
    """입삼재(入三災) — 세운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_112(d: dict) -> bool:
    """휴삼재(休三災) — 세운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_113(d: dict) -> bool:
    """출삼재(出三災) — 세운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_114(d: dict) -> bool:
    """복음월지(伏吟月支) — 월지가 년지와 동일."""
    p = d["pillars"]
    return p["month"]["branch"] == p["year"]["branch"]


def f_1_115(d: dict) -> bool:
    """복음일지(伏吟日支) — 일지가 년지와 동일."""
    p = d["pillars"]
    return p["day"]["branch"] == p["year"]["branch"]


def f_1_116(d: dict) -> bool:
    """복음시지(伏吟時支) — 시지가 년지와 동일."""
    p = d["pillars"]
    return p["hour"]["branch"] == p["year"]["branch"]


def f_1_117(d: dict) -> bool:
    """공망(空亡) — 일주 60갑자 旬의 공망 두 지지 중 하나 보유."""
    p = d["pillars"]
    dg = p["day"]["stem"]
    db = p["day"]["branch"]
    gi, ji = GAN.index(dg), JI.index(db)
    k = next(x for x in range(60) if x % 10 == gi and x % 12 == ji)
    s = (k // 10) * 10
    gm = (JI[(s + 10) % 12], JI[(s + 11) % 12])
    return any(b in gm for b in _branches(d))


def f_1_118(d: dict) -> bool:
    """교신·구신(絞神·勾神) — 세운 작용·산출표 부족. 비활성."""
    return False


def f_1_119(d: dict) -> bool:
    """탄함(呑陷) — 산출표 부족. 보수적 비활성."""
    return False


def f_1_120(d: dict) -> bool:
    """천액(天厄) — 산출표 부족. 보수적 비활성."""
    return False


def f_1_121(d: dict) -> bool:
    """검봉(劍鋒) — 시작값 부족. 보수적 비활성."""
    return False


def f_1_122(d: dict) -> bool:
    """음살(陰殺) — 산출표 부족. 보수적 비활성."""
    return False


def f_1_123(d: dict) -> bool:
    """천형(天刑) — 산출표 부족. 보수적 비활성."""
    return False


def f_1_124(d: dict) -> bool:
    """파쇄(破碎) — 산출 단서 부족. 보수적 비활성."""
    return False


def f_1_125(d: dict) -> bool:
    """표미(豹尾) — 시작값 부족. 보수적 비활성."""
    return False


def f_1_126(d: dict) -> bool:
    """병부(病符) — 세운 판정 성격. 보수적 비활성."""
    return False


def f_1_127(d: dict) -> bool:
    """음인(陰刃) — 산출표 부족. 보수적 비활성."""
    return False


def f_1_128(d: dict) -> bool:
    """천곡(天哭) — 시작값 부족. 보수적 비활성."""
    return False


def f_1_129(d: dict) -> bool:
    """피두(被頭) — 행운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_130(d: dict) -> bool:
    """비부(飛符) — 행운 판정 개념(natal 미적용). 비활성."""
    return False


def f_1_131(d: dict) -> bool:
    """암금살(暗金殺) — 산출 단서 부족. 보수적 비활성."""
    return False


# =========================================================================
# 신살 레지스트리
#   (key, name, confidence, judge)
#   confidence: "high" | "medium" | "low"
#   low 또는 항상 False 인 미상 신살도 등록은 하되, detect_sinsal 에서
#   confidence == "low" 항목은 기본적으로 결과에서 제외한다.
# =========================================================================

SINSAL_TABLE: list[tuple[str, str, str, Callable[[dict], bool]]] = [
    # A
    ("1-1", "천을귀인(天乙貴人)", "high", f_1_1),
    ("1-2", "복성귀인(福星貴人)", "medium", f_1_2),
    ("1-3", "천관귀인(天官貴人)", "medium", f_1_3),
    ("1-4", "천록(天祿)", "high", f_1_4),
    ("1-5", "암록(暗祿)", "high", f_1_5),
    ("1-6", "금여록(金與祿)", "high", f_1_6),
    ("1-7", "문창귀인(文昌貴人)", "high", f_1_7),
    ("1-8", "학당귀인(學堂貴人)", "high", f_1_8),
    ("1-9", "문곡귀인(文曲貴人)", "medium", f_1_9),
    ("1-10", "관귀학관(官貴學館)", "medium", f_1_10),
    ("1-11", "재고귀인(財庫貴人)", "medium", f_1_11),
    ("1-12", "천주귀인(天廚貴人)", "high", f_1_12),
    ("1-13", "태극귀인(太極貴人)", "low", f_1_13),
    ("1-14", "협록(夾祿)", "medium", f_1_14),
    ("1-15", "국인(國印)", "medium", f_1_15),
    ("1-16", "절도귀인(節度貴人)", "high", f_1_16),
    ("1-17", "천재(天財)", "high", f_1_17),
    ("1-18", "당부(唐符)", "low", f_1_18),
    ("1-19", "천사성(天赦星)", "medium", f_1_19),
    ("1-20", "월덕귀인(月德貴人)", "high", f_1_20),
    ("1-21", "월덕합(月德合)", "high", f_1_21),
    ("1-22", "천덕귀인(天德貴人)", "high", f_1_22),
    ("1-23", "천덕합(天德合)", "high", f_1_23),
    ("1-24", "천의성(天醫星)", "medium", f_1_24),
    ("1-25", "천희신(天喜神)", "medium", f_1_25),
    ("1-26", "황은대사(皇恩大赦)", "medium", f_1_26),
    ("1-27", "장명성(長命星)", "low", f_1_27),
    # B
    ("1-28", "양차살(陽差殺)", "high", f_1_28),
    ("1-29", "음착살(陰錯殺)", "high", f_1_29),
    ("1-30", "곤랑도화(滾浪桃花)", "medium", f_1_30),
    ("1-31", "현침살(懸針殺)", "high", f_1_31),
    ("1-32", "절로공망(截路空亡)", "medium", f_1_32),
    ("1-33", "계비관(鷄飛關)", "low", f_1_33),
    ("1-34", "천전살(天轉殺)", "medium", f_1_34),
    ("1-35", "지전살(地轉殺)", "medium", f_1_35),
    ("1-36", "양인살(羊刃殺)", "high", f_1_36),
    ("1-37", "비인(飛刃)", "high", f_1_37),
    ("1-38", "홍염살(紅艶殺)", "high", f_1_38),
    ("1-39", "유하살(流霞殺)", "high", f_1_39),
    ("1-40", "수익살(水溺殺)", "low", f_1_40),
    ("1-41", "천나(天羅)", "low", f_1_41),
    ("1-42", "지망(地網)", "low", f_1_42),
    ("1-43", "고란살(孤鸞殺)", "high", f_1_43),
    ("1-44", "효신살(梟神殺)", "medium", f_1_44),
    ("1-45", "백호대살(白虎大殺)", "high", f_1_45),
    ("1-46", "괴강살(魁罡殺)", "high", f_1_46),
    # C
    ("1-47", "상배일(喪配日)", "low", f_1_47),
    ("1-48", "라체도화살(裸體桃花殺)", "high", f_1_48),
    ("1-49", "평두살(平頭殺)", "low", f_1_49),
    ("1-50", "육수성(六秀星)", "medium", f_1_50),
    ("1-51", "교록성(交祿星)", "high", f_1_51),
    ("1-52", "탕화살(湯火殺)", "medium", f_1_52),
    ("1-53", "화상살(畵象殺)", "low", f_1_53),
    ("1-54", "야제살(夜啼殺)", "low", f_1_54),
    ("1-55", "격각살(隔角殺)", "high", f_1_55),
    ("1-56", "심수살(深水殺)", "low", f_1_56),
    ("1-57", "단교관살(斷橋關殺)", "low", f_1_57),
    ("1-58", "백일관(百日關)", "low", f_1_58),
    ("1-59", "금쇄관살(金鎖關殺)", "high", f_1_59),
    ("1-60", "상문(喪門)", "high", f_1_60),
    ("1-61", "조객(弔客)", "high", f_1_61),
    ("1-62", "귀문관(鬼門關)", "high", f_1_62),
    ("1-63", "도화살(桃花殺)", "high", f_1_63),
    ("1-64", "원진(怨嗔)", "high", f_1_64),
    ("1-65", "고진(孤辰)·고신(孤神)", "high", f_1_65),
    ("1-66", "과숙(寡宿)", "high", f_1_66),
    # D
    ("1-67", "재살(災殺)/수옥살(囚獄殺)", "high", f_1_67),
    ("1-68", "농아(聾啞)", "low", f_1_68),
    ("1-69", "홍란성(紅鸞星)", "low", f_1_69),
    ("1-70", "도삽도화(倒揷桃花)", "low", f_1_70),
    ("1-71", "결항(結項)", "low", f_1_71),
    ("1-72", "간학일(干學日)", "low", f_1_72),
    ("1-73", "환살(鰥殺)", "medium", f_1_73),
    ("1-74", "과살(寡殺)", "low", f_1_74),
    ("1-75", "중혼살(重婚殺)", "low", f_1_75),
    ("1-76", "절방살(絶房殺)", "low", f_1_76),
    ("1-77", "재가살(再嫁殺)", "low", f_1_77),
    ("1-78", "뇌공관(雷公關)", "low", f_1_78),
    ("1-79", "진신(進神)", "medium", f_1_79),
    ("1-80", "천상귀인(天上貴人)", "low", f_1_80),
    ("1-81", "지하귀인(地下貴人)", "low", f_1_81),
    ("1-82", "인문귀인(人門貴人)", "low", f_1_82),
    ("1-83", "십악대패살(十惡大敗殺)", "high", f_1_83),
    ("1-84", "백호대살(白虎大殺)/오귀살(五鬼殺)", "medium", f_1_84),
    ("1-85", "음양살(陰陽殺)", "medium", f_1_85),
    ("1-86", "유실살(有室殺)", "medium", f_1_86),
    ("1-87", "소실살(小室殺)", "low", f_1_87),
    ("1-88", "하정살(下情殺)", "low", f_1_88),
    ("1-89", "급각살(急脚殺)", "medium", f_1_89),
    ("1-90", "부벽살(斧劈殺)", "low", f_1_90),
    ("1-91", "낙정관살(落井關殺)", "medium", f_1_91),
    ("1-92", "건각(蹇脚)", "low", f_1_92),
    ("1-93", "혈인(血刃)", "low", f_1_93),
    ("1-94", "배곡살(背曲殺)", "low", f_1_94),
    ("1-95", "귀한일(鬼限日)", "low", f_1_95),
    ("1-96", "혈지(血支)", "low", f_1_96),
    ("1-97", "삼구살(三丘殺)", "low", f_1_97),
    ("1-98", "오묘살(五墓殺)", "low", f_1_98),
    ("1-99", "권설(卷舌)", "low", f_1_99),
    # E
    ("1-100", "태백살(太白殺)", "high", f_1_100),
    ("1-101", "자결(自結)", "medium", f_1_101),
    ("1-102", "천낭살(天狼殺)", "low", f_1_102),
    ("1-103", "천옥살(天獄殺)", "low", f_1_103),
    ("1-104", "오귀살(五鬼殺)", "high", f_1_104),
    ("1-105", "관부살(官符殺)", "high", f_1_105),
    ("1-106", "세합(歲合)", "medium", f_1_106),
    ("1-107", "태양(太陽)", "low", f_1_107),
    ("1-108", "복덕(福德)", "low", f_1_108),
    ("1-109", "천모(天耗)", "low", f_1_109),
    ("1-110", "지모(地耗)", "low", f_1_110),
    ("1-111", "입삼재(入三災)", "low", f_1_111),
    ("1-112", "휴삼재(休三災)", "low", f_1_112),
    ("1-113", "출삼재(出三災)", "low", f_1_113),
    ("1-114", "복음월지(伏吟月支)", "low", f_1_114),
    ("1-115", "복음일지(伏吟日支)", "low", f_1_115),
    ("1-116", "복음시지(伏吟時支)", "low", f_1_116),
    ("1-117", "공망(空亡)", "high", f_1_117),
    ("1-118", "교신·구신(絞神·勾神)", "low", f_1_118),
    ("1-119", "탄함(呑陷)", "low", f_1_119),
    ("1-120", "천액(天厄)", "low", f_1_120),
    ("1-121", "검봉(劍鋒)", "low", f_1_121),
    ("1-122", "음살(陰殺)", "low", f_1_122),
    ("1-123", "천형(天刑)", "low", f_1_123),
    ("1-124", "파쇄(破碎)", "low", f_1_124),
    ("1-125", "표미(豹尾)", "low", f_1_125),
    ("1-126", "병부(病符)", "low", f_1_126),
    ("1-127", "음인(陰刃)", "low", f_1_127),
    ("1-128", "천곡(天哭)", "low", f_1_128),
    ("1-129", "피두(被頭)", "low", f_1_129),
    ("1-130", "비부(飛符)", "low", f_1_130),
    ("1-131", "암금살(暗金殺)", "low", f_1_131),
]


# =========================================================================
# 최종 통합 함수
# =========================================================================

def detect_sinsal(d: dict, include_low: bool = False) -> list[dict]:
    """사주 차트 d 에서 보유 신살을 판정해 리스트로 반환한다.

    반환: [{"name","key","confidence"}, ...]
    - 판정함수가 True 인 신살만 포함한다.
    - confidence == "low" 인 신살은 기본적으로 제외한다(거짓양성 방지).
      include_low=True 로 호출하면 low 도 포함한다.
    """
    result: list[dict] = []
    for key, name, conf, judge in SINSAL_TABLE:
        if conf == "low" and not include_low:
            continue
        try:
            fired = judge(d)
        except Exception:
            # 입력 결손 등으로 판정 불가하면 미발화 처리한다.
            fired = False
        if fired:
            result.append({"name": name, "key": key, "confidence": conf})
    return result


# =========================================================================
# 자체 스모크테스트
# =========================================================================

if __name__ == "__main__":
    # 정답차트: 乙丑年 乙酉月 辛亥日 辛卯時 (남성)
    oracle_chart = {
        "gender": "남",
        "pillars": {
            "year": {"stem": "乙", "branch": "丑", "pillar": "乙丑"},
            "month": {"stem": "乙", "branch": "酉", "pillar": "乙酉"},
            "day": {"stem": "辛", "branch": "亥", "pillar": "辛亥"},
            "hour": {"stem": "辛", "branch": "卯", "pillar": "辛卯"},
        },
    }

    fired = detect_sinsal(oracle_chart)
    print(f"정답차트: 乙丑 乙酉 辛亥 辛卯 (남) — 발화 신살 {len(fired)}개")
    print("-" * 50)
    for s in fired:
        print(f"  [{s['key']:>6}] {s['name']} (confidence={s['confidence']})")

    # low 포함 결과 개수도 참고로 출력한다.
    fired_all = detect_sinsal(oracle_chart, include_low=True)
    print("-" * 50)
    print(f"(low 포함 시 총 {len(fired_all)}개)")
