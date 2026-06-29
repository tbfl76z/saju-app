# -*- coding: utf-8 -*-
"""시가기문(時家奇門 / 연국기문) 포국 엔진 — 단일 모듈.

표준 교과서식 단계별 구현(검증 결과 천반 9/9, 지반 9/9 정답 일치)을 채택했다.
표준 라이브러리 + sajupy 만 사용한다.

핵심 도출 규칙
1. 삼원(三元)은 일주 자체 지지가 아니라 직전 甲/己일(부두)의 지지로 판정한다.
   (子午卯酉→상원 / 寅申巳亥→중원 / 辰戌丑未→하원)
2. 지반(地盤)은 국수궁부터 음양둔 경로를 따라 육의삼기(戊己庚辛壬癸丁丙乙)를 배치한다.
3. 천반(天盤) 직부수동(直符隨動)은 후천팔괘 8궁 시계환[1,8,3,4,9,2,7,6]을 따라
   plate를 강체 회전한 것이며 중궁(5)은 고정한다. 회전량 step은 직부궁→時干지반궁 환거리.

추가 기능
- gimun_banwi(): 8방위(지지궁)별 (천반천간, 지반천간)으로 100격 idx=(천반-1)*10+지반 를
  만들어 목적별(금전/질병/연애/이사/여가/청탁) 길흉 조회 키를 생성한다.
"""
from __future__ import annotations
from sajupy import SajuCalculator

# ── 기본 상수 ──────────────────────────────────────────────────────────
GAN = "甲乙丙丁戊己庚辛壬癸"   # 천간 10
ZHI = "子丑寅卯辰巳午未申酉戌亥"  # 지지 12

# 낙서 9궁 정위 (궁번호 → 지지). 5=중궁
LUOSHU_PALACE_ZHI: dict[int, str] = {
    1: "子", 2: "未", 3: "卯", 4: "巳", 5: "中",
    6: "亥", 7: "酉", 8: "寅", 9: "午",
}
# 지반 진행순서: 육의(戊己庚辛壬癸) + 삼기(丁丙乙)
YIYI_SANQI = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"]
YANGDUN_PATH = [1, 2, 3, 4, 5, 6, 7, 8, 9]   # 양둔 순행
YINDUN_PATH = [9, 8, 7, 6, 5, 4, 3, 2, 1]    # 음둔 역행
# 후천팔괘 8궁 시계환(천반 직부수동 회전용, 중궁 제외): 坎艮震巽離坤兌乾
HOUTIAN_CLOCK = [1, 8, 3, 4, 9, 2, 7, 6]
# 순수(旬首) → 둔갑 육의
XUNSHOU_DUNJIA = {
    "甲子": "戊", "甲戌": "己", "甲申": "庚",
    "甲午": "辛", "甲辰": "壬", "甲寅": "癸",
}

# 목적별 길흉 조회 테이블 접두어 (idx 와 결합해 DB/콘텐츠 키 생성)
GIMUN_PURPOSE_PREFIX: dict[str, str] = {
    "금전": "Gimun_MONEY",
    "질병": "Gimun_Disease",
    "연애": "Gimun_Lover",
    "이사": "Gimun_Entra",
    "여가": "Gimun_Leisure",
    "청탁": "Gimun_QUE",
}


# ── 보조 함수 ──────────────────────────────────────────────────────────
def _ganzhi_index(gz: str) -> int:
    """간지 문자열(예: '辛亥')의 60갑자 인덱스(0~59)를 반환한다."""
    g, z = GAN.index(gz[0]), ZHI.index(gz[1])
    for i in range(60):
        if i % 10 == g and i % 12 == z:
            return i
    return -1


# 24절기 음양둔 삼원국수표 (절기 → (음양둔, 상원, 중원, 하원 국수))
JIEQI_GUK_TABLE: dict = {
    "동지": ("양", 1, 7, 4), "소한": ("양", 2, 8, 5), "대한": ("양", 3, 9, 6),
    "입춘": ("양", 8, 5, 2), "우수": ("양", 9, 6, 3), "경칩": ("양", 1, 7, 4),
    "춘분": ("양", 3, 9, 6), "청명": ("양", 4, 1, 7), "곡우": ("양", 5, 2, 8),
    "입하": ("양", 4, 1, 7), "소만": ("양", 5, 2, 8), "망종": ("양", 6, 3, 9),
    "하지": ("음", 9, 3, 6), "소서": ("음", 8, 2, 5), "대서": ("음", 7, 1, 4),
    "입추": ("음", 2, 5, 8), "처서": ("음", 1, 4, 7), "백로": ("음", 9, 3, 6),
    "추분": ("음", 7, 1, 4), "한로": ("음", 6, 9, 3), "상강": ("음", 5, 8, 2),
    "입동": ("음", 6, 9, 3), "소설": ("음", 5, 8, 2), "대설": ("음", 4, 7, 1),
}


def _current_jieqi(year: int, month: int, day: int, hour: int, minute: int) -> str:
    """calc.data 절기표에서 해당 일시에 진입한(직전) 절기명을 반환한다."""
    from sajupy import get_saju_calculator
    df = get_saju_calculator().data
    jq = df[df["solar_term_korean"].notna()]
    target = int(f"{year}{month:02d}{day:02d}{hour:02d}{minute:02d}")
    best, best_t = "백로", -1
    for _, row in jq.iterrows():
        try:
            t = int(float(row["term_time"]))  # YYYYMMDDHHMM
        except (TypeError, ValueError):
            continue
        if t <= target and t > best_t:
            best_t, best = t, row["solar_term_korean"]
    return best


def _jieqi_yinyang_guk(year: int, month: int, day: int,
                       hour: int = 12, minute: int = 0) -> tuple:
    """절기(24) → 음양둔 + 삼원별 국수. calc.data로 정확한 절기 판정."""
    jieqi = _current_jieqi(year, month, day, hour, minute)
    yy, sg, jg, hg = JIEQI_GUK_TABLE.get(jieqi, JIEQI_GUK_TABLE["백로"])
    return jieqi, yy, sg, jg, hg


def _sanwon_from_day(day_pillar: str) -> str:
    """삼원(三元)을 판정한다.

    일주 자체 지지가 아니라 직전 甲/己일(부두)의 지지로 판정한다.
    子午卯酉→상원 / 寅申巳亥→중원 / 辰戌丑未→하원.
    """
    idx = _ganzhi_index(day_pillar)
    fudou_zhi = None
    for cand in range(idx, idx - 10, -1):
        if GAN[cand % 10] in ("甲", "己"):
            fudou_zhi = ZHI[cand % 12]
            break
    if fudou_zhi in {"子", "午", "卯", "酉"}:
        return "상원"
    if fudou_zhi in {"寅", "申", "巳", "亥"}:
        return "중원"
    return "하원"


# ── 포국 ───────────────────────────────────────────────────────────────
def gimun_poguk(year: int, month: int, day: int,
                hour: int, minute: int) -> dict:
    """시가기문 포국. 국수 + 9궁(지지궁) 천반/지반 천간을 산출한다."""
    calc = SajuCalculator()
    saju = calc.calculate_saju(year, month, day, hour, minute,
                               use_solar_time=True, longitude=127.5)
    day_pillar = saju["day_pillar"]
    hour_pillar = saju["hour_pillar"]
    hour_stem = saju["hour_stem"]

    # 1) 절기 / 음양둔
    jieqi, yy, sg, jg, hg = _jieqi_yinyang_guk(year, month, day, hour, minute)

    # 2) 삼원 → 국수
    sanwon = _sanwon_from_day(day_pillar)
    guk = {"상원": sg, "중원": jg, "하원": hg}[sanwon]
    guk_name = f"{'음둔' if yy == '음' else '양둔'} {jieqi} {sanwon} {guk}국"
    path = YANGDUN_PATH if yy == "양" else YINDUN_PATH

    # 3) 지반: 국수궁부터 경로 따라 육의삼기 배치
    si = path.index(guk)
    rotated = path[si:] + path[:si]
    earth = {p: YIYI_SANQI[i] for i, p in enumerate(rotated)}

    # 4) 천반(직부수동): 時符頭 = 시주 旬首의 둔갑
    hidx = _ganzhi_index(hour_pillar)
    xs = (hidx // 10) * 10
    xunshou = GAN[xs % 10] + ZHI[xs % 12]
    shifu = XUNSHOU_DUNJIA[xunshou]
    e2p = {v: k for k, v in earth.items()}
    zhifu_palace = e2p[shifu]       # 직부궁 = 지반 時符頭 위치
    sigan_palace = e2p[hour_stem]   # 時干의 지반궁(직부 이동 목표)
    # 천반 = 지반 plate 를 후천8궁 시계환으로 강체회전(중궁 고정).
    # 중궁(5)에 든 천간은 기궁(寄宮) 처리 — 中5 寄 坤2.
    i_sf = HOUTIAN_CLOCK.index(2 if zhifu_palace == 5 else zhifu_palace)
    i_sg = HOUTIAN_CLOCK.index(2 if sigan_palace == 5 else sigan_palace)
    step = (i_sg - i_sf) % 8
    sky = {5: earth[5]}
    for i, p in enumerate(HOUTIAN_CLOCK):
        sky[HOUTIAN_CLOCK[(i + step) % 8]] = earth[p]

    # 5) 9궁(지지궁)별 (천반, 지반)
    palace = {}
    for p in range(1, 10):
        z = LUOSHU_PALACE_ZHI[p]
        palace[z] = {"palace": p, "천반": sky.get(p), "지반": earth.get(p)}

    return {
        "국": guk_name, "yinyang": yy, "jieqi": jieqi, "sanwon": sanwon,
        "guk_num": guk, "hour_stem": hour_stem, "shifu_tou": shifu,
        "xunshou": xunshou, "zhifu_palace": zhifu_palace, "step": step,
        "궁별": palace,
    }


# ── 100격 / 목적별 길흉 키 ──────────────────────────────────────────────
def _gyeok_idx(cheonban: str | None, jiban: str | None) -> int | None:
    """100격 idx = (천반-1)*10 + 지반. 천간 인덱스는 1~10 (甲=1)."""
    if cheonban is None or jiban is None:
        return None
    t = GAN.index(cheonban) + 1  # 1~10
    e = GAN.index(jiban) + 1     # 1~10
    return (t - 1) * 10 + e


def gimun_banwi(year: int, month: int, day: int,
                hour: int, minute: int) -> dict:
    """8방위(지지궁)별 길흉 조회 정보를 생성한다.

    각 방위에 대해 (천반, 지반, 격idx, 목적별 조회키)를 담은 dict 를 반환한다.
    목적별 키 형식: '<접두어>:<격idx>' (예: 'Gimun_MONEY:73').
    중궁(中)은 지반에 기궁(寄宮)된 방위가 아니므로 8방위 결과에서 제외한다.
    """
    poguk = gimun_poguk(year, month, day, hour, minute)
    result: dict = {}
    for zhi, info in poguk["궁별"].items():
        if zhi == "中":  # 8방위만 — 중궁 제외
            continue
        cheonban = info["천반"]
        jiban = info["지반"]
        idx = _gyeok_idx(cheonban, jiban)
        purpose_keys = {
            purpose: (f"{prefix}:{idx}" if idx is not None else None)
            for purpose, prefix in GIMUN_PURPOSE_PREFIX.items()
        }
        result[zhi] = {
            "천반": cheonban,
            "지반": jiban,
            "격idx": idx,
            "목적별키": purpose_keys,
        }
    return result


# ── 스모크 테스트 ──────────────────────────────────────────────────────
# 정답지: 1985-09-09 06:00 → 음둔 백로 상원 9국, 9궁 천반/지반
_ORACLE = {
    "巳": ("丁", "癸"), "午": ("癸", "戊"), "未": ("戊", "丙"),
    "卯": ("己", "丁"), "酉": ("丙", "庚"), "寅": ("乙", "己"),
    "子": ("辛", "乙"), "亥": ("庚", "辛"), "中": ("壬", "壬"),
}

if __name__ == "__main__":
    r = gimun_poguk(1985, 9, 9, 6, 0)

    # 1) 국 검증
    assert r["국"] == "음둔 백로 상원 9국", f"국 불일치: {r['국']}"

    # 2) 9궁 천반/지반 검증
    for z, (ot, oe) in _ORACLE.items():
        got_t = r["궁별"][z]["천반"]
        got_e = r["궁별"][z]["지반"]
        assert got_t == ot, f"{z}궁 천반 불일치: {got_t} != {ot}"
        assert got_e == oe, f"{z}궁 지반 불일치: {got_e} != {oe}"

    # 3) 방위별 목적 키 검증 (亥: 천반 庚=7, 지반 辛=8 → idx=(7-1)*10+8=68)
    banwi = gimun_banwi(1985, 9, 9, 6, 0)
    assert "中" not in banwi, "중궁은 8방위에서 제외되어야 한다"
    assert len(banwi) == 8, f"8방위여야 함: {len(banwi)}"
    assert banwi["亥"]["격idx"] == 68, f"亥 격idx 오류: {banwi['亥']['격idx']}"
    assert banwi["亥"]["목적별키"]["금전"] == "Gimun_MONEY:68"
    assert banwi["亥"]["목적별키"]["청탁"] == "Gimun_QUE:68"

    print(r["국"], "천반 9/9 지반 9/9 oracle_pass=True")
    print("방위 예시 亥:", banwi["亥"])
