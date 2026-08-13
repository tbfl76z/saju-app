# -*- coding: utf-8 -*-
"""고전 명리 라우터 (레거시 사주명리 4.0 포팅).

saju_app의 계산엔진(sajupy + saju_utils)을 그대로 재사용해 차트를 산출하고,
레거시 정형 풀이(명리 解說·자미두수·궁합·주역·즉석점·기문둔갑)를 조립한다.
모든 점법 계산은 원본 프로그램(오라클)으로 검증된 엔진을 사용한다.

main.py 에 한 줄로 연결: app.include_router(classic.router)
"""
import os
import random
import datetime as _dt
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from sajupy import SajuCalculator, get_saju_details, lunar_to_solar, solar_to_lunar
from saju_utils import get_extended_saju_data, get_sinsal_list, TWELVE_GROWTH, get_gongmang
from content_db import ContentDB, CHEONGAN, JIJI
import divination
import ai_report
import myungri_engine
import sinsal_engine
import yearun_engine
import gimun_engine
from collections import defaultdict

router = APIRouter(prefix="/classic", tags=["classic"])
_calc = SajuCalculator()
_DB = os.path.join(os.path.dirname(__file__), "saju4_content.db")
content = ContentDB(_DB)

SIPSIN_HAN = {"비견": "比肩", "겁재": "劫財", "식신": "食神", "상관": "傷官", "편재": "偏財",
              "정재": "正財", "편관": "偏官", "정관": "正官", "편인": "偏印", "정인": "印綬"}
SS12 = {"겁살": 1, "재살": 2, "천살": 3, "지살": 4, "년살": 5, "월살": 6,
        "망신살": 7, "장성살": 8, "반안살": 9, "역마살": 10, "육해살": 11, "화개살": 12}
DIR_KO = {"子": "정북", "丑": "북북동", "寅": "동북", "卯": "정동", "辰": "동남", "巳": "남남동",
          "午": "정남", "未": "남남서", "申": "서남", "酉": "정서", "戌": "서북", "亥": "북북서"}

# 택일(擇日): 건제12신 + 황도흑도 (표준 산법)
GEONJE = ["建", "除", "滿", "平", "定", "執", "破", "危", "成", "收", "開", "閉"]
GEONJE_KO = {"建": "건(建)", "除": "제(除)", "滿": "만(滿)", "平": "평(平)", "定": "정(定)", "執": "집(執)",
             "破": "파(破)", "危": "위(危)", "成": "성(成)", "收": "수(收)", "開": "개(開)", "閉": "폐(閉)"}
# 월지 → 청룡(황도 시작) 일지
CHEONGRYONG = {"子": "申", "丑": "戌", "寅": "子", "卯": "寅", "辰": "辰", "巳": "午",
               "午": "申", "未": "戌", "申": "子", "酉": "寅", "戌": "辰", "亥": "午"}
HWANGHEUK = ["청룡", "명당", "천형", "주작", "금궤", "천덕", "백호", "옥당", "천뢰", "현무", "사명", "구진"]
_HWANGDO_IDX = {0, 1, 4, 5, 7, 10}  # 황도(길): 청룡·명당·금궤·천덕·옥당·사명
# 목적별 길한 건제신(idx) / 공통 흉신
PURPOSE_GIL = {"결혼": {4, 8, 10}, "이사": {1, 8, 10}, "개업": {0, 2, 8, 10}, "계약": {4, 8, 10}, "여행": {1, 8, 10}}
_GEONJE_HYUNG = {6, 11}  # 破·閉 (공통 흉)


class ClassicReq(BaseModel):
    name: str = ""
    gender: str = "남"
    year: int
    month: int
    day: int
    hour: int = 12
    minute: int = 0
    calendar: str = "양력"
    is_leap: bool = False
    unknown_time: bool = False
    focus: str = "종합"  # 자미 해석 세분화 초점(종합/성격/재물/애정/직업/건강/대한/유년)


def _chart(req: ClassicReq) -> dict:
    y, m, d = req.year, req.month, req.day
    if req.calendar == "음력":
        s = lunar_to_solar(y, m, d, is_leap_month=req.is_leap)
        y, m, d = s["solar_year"], s["solar_month"], s["solar_day"]
    hh, mm = (12, 0) if req.unknown_time else (req.hour, req.minute)
    res = _calc.calculate_saju(y, m, d, hh, mm, use_solar_time=True, longitude=127.5, early_zi_time=False)
    det = get_extended_saju_data(get_saju_details(res), gender=req.gender)
    det["name"], det["gender"], det["_solar"] = req.name, req.gender, (y, m, d)
    return det


def _myungri(det: dict) -> dict:
    """명리 원명해설(8섹션) + 일간론 + 신살해설 + 대운 + 연운."""
    out = {}
    P = det["pillars"]
    ig = CHEONGAN.index(P["day"]["stem"]) + 1
    wj = JIJI.index(P["month"]["branch"]) + 1

    def daygan(h):
        r = content._q("SELECT text FROM content WHERE source_table='DayGan' AND idx_code=? AND text!=''", f"{ig}-{wj}-{h}")
        return r[0]["text"] if r else ""
    out["원명원리"] = daygan(1)
    out["일주론"] = content.ilju_text(P["day"]["stem"], P["day"]["branch"]) or ""
    out["일간론"] = [{"label": lb, "text": daygan(h)} for lb, h in (("성격", 2), ("금전관", 7), ("애정관", 8)) if daygan(h)]
    # 원국 종합(대1,3,6,7,8,9) + 형충/공망 등
    wm = []
    for r in myungri_engine.detect(det):
        keys = r.get("wonmyung_keys", [])
        dae = keys[0].split("-")[0] if keys else ""
        txt = " ".join(t for t in (content.wonmyung(k) for k in keys) if t)
        if txt:
            wm.append({"조건": r["조건명"], "풀이": txt,
                       "그룹": "원명해설" if dae in ("1", "3", "6", "7", "8", "9") else "기타"})
    out["원국종합"] = wm
    # 각종 길흉신살
    out["길흉신살"] = [{"신살": s["name"], "풀이": " ".join((content.by_code("sinsal", s["key"]) or {}).values())}
                   for s in sinsal_engine.detect_sinsal(det)]
    out["길흉신살"] = [x for x in out["길흉신살"] if x["풀이"]]
    # 12신살 해설
    sh = []
    for pk, ko in (("year", "년"), ("month", "월"), ("day", "일"), ("hour", "시")):
        nm = ((det.get("sinsal", {}) or {}).get(pk) or "").split(",")[0].strip()
        no = SS12.get(nm)
        if no:
            r = content._q("SELECT text FROM content WHERE source_table='12sinsal' AND idx_code=? AND text!=''", f"1-{no}-A")
            if r and not any(x["신살"] == nm for x in sh):
                sh.append({"위치": ko, "신살": nm, "풀이": r[0]["text"]})
    out["십이신살"] = sh
    # 대운
    sex = "1" if str(det.get("gender", "남")).startswith("남") else "2"
    OH = {**{c: "木" for c in "甲乙寅卯"}, **{c: "火" for c in "丙丁巳午"}, **{c: "土" for c in "戊己辰戌丑未"},
          **{c: "金" for c in "庚辛申酉"}, **{c: "水" for c in "壬癸子亥"}}

    def dt(tbl, sip, band, ch):
        r = content._q("SELECT text FROM content WHERE source_table=? AND idx_code=? AND text!=''", tbl, f"{sex}-{SIPSIN_HAN.get(sip, sip)}-{band}-1")
        return (r[0]["text"] if r else "").replace("{#대운#}", f"{ch}{OH.get(ch, '')}대운")
    dl = []
    for du in (det.get("fortune", {}) or {}).get("list", []):
        age = du.get("age", 0)
        band = ((age - 1) // 10) * 10 if age else 0
        gz = du.get("ganzhi", "")
        ssn = (du.get("sinsal", "") or "").split(",")[0].strip()
        no = SS12.get(ssn)
        sr = content._q("SELECT text FROM content WHERE source_table='Myung_DaeUnSal' AND idx_code=? AND text!=''", f"{no}-1") if no else []
        dl.append({"age": age, "간지": gz,
                   "천간운": dt("Myung_DaeUnExp", du.get("stem_ten_god", ""), band, gz[:1]),
                   "지지운": dt("Myung_DaeUnJiExp", du.get("branch_ten_god", ""), band, gz[1:2]),
                   "신살": sr[0]["text"] if sr else ""})
    out["대운"] = dl
    # 연운(올해 세운)
    import re
    ty = _dt.date.today().year
    gz = CHEONGAN[(ty - 4) % 10] + JIJI[(ty - 4) % 12]

    def match(tbl, ch, pos):
        for r in content._q("SELECT text FROM content WHERE source_table=? AND text!='' ORDER BY id", tbl):
            mt = re.match(r"\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])年", r["text"])
            if mt and mt.group(1)[pos] == ch:
                return r["text"]
        return ""
    out["연운"] = {"year": ty, "ganzhi": gz, "천간운": match(f"yearun{ig}", gz[0], 0), "지지운": match(f"yearunji{ig}", gz[1], 1)}
    return out


GUNG12 = ["명궁", "형제", "부처", "자녀", "재백", "질액", "천이", "노복", "관록", "전택", "복덕", "부모"]
GUNG_HAN = {"명궁": "命宮", "형제": "兄弟", "부처": "夫妻", "자녀": "子女", "재백": "財帛", "질액": "疾厄",
            "천이": "遷移", "노복": "奴僕", "관록": "官祿", "전택": "田宅", "복덕": "福德", "부모": "父母"}
STAR_HAN = {"자미": "紫微", "천기": "天機", "태양": "太陽", "무곡": "武曲", "천동": "天同", "염정": "廉貞",
            "천부": "天府", "태음": "太陰", "탐랑": "貪狼", "거문": "巨門", "천상": "天相", "천량": "天梁",
            "칠살": "七殺", "파군": "破軍"}
# 命主: 명궁 지지 → 주성 (5개 원본 명반 검증)
MYUNGJU = {"子": "탐랑", "丑": "거문", "亥": "거문", "寅": "녹존", "戌": "녹존", "卯": "문곡",
           "酉": "문곡", "辰": "염정", "申": "염정", "巳": "무곡", "未": "무곡", "午": "파군"}
# 身主: 년지 → 성요 (5개 원본 명반 검증)
SINJU = {"子": "화성", "午": "화성", "丑": "천상", "未": "천상", "寅": "천량", "申": "천량",
         "卯": "천동", "酉": "천동", "辰": "문창", "戌": "문창", "巳": "천기", "亥": "천기"}


def _jami(det: dict) -> dict:
    """자미두수 12궁 명반(해석 없이 명반만). 원본 프로그램과 동일한 성요·배치 산출."""
    P = det["pillars"]
    lun = solar_to_lunar(*det["_solar"])
    ysi = CHEONGAN.index(P["year"]["stem"])
    yzi = JIJI.index(P["year"]["branch"])
    hbi = JIJI.index(P["hour"]["branch"])
    j = divination.자미_오행국(ysi, lun["lunar_month"], hbi)
    mi = JIJI.index(j["명궁"])
    guk = j["국수"]
    zmi = divination.자미_위치(guk, lun["lunar_day"])
    ju = divination.명궁_주성(guk, lun["lunar_day"], mi)
    male = str(det.get("gender", "남")).startswith("남")
    # 身宮: 寅起정월 순행(생월) + 생시 順行 (命宮은 생시 逆行). 命主/身主 산출
    sin_idx = (2 + (lun["lunar_month"] - 1) + hbi) % 12
    myeongju = MYUNGJU.get(j["명궁"], "")
    sinju = SINJU.get(JIJI[yzi], "")
    # 14주성 + 보조성·잡성·박사12신·장생12신·소한·묘왕·사화 (원본 명반 오라클 검증)
    chart = divination.자미_14주성(guk, lun["lunar_day"])
    aux = divination.자미_보조성(guk, lun["lunar_month"], hbi, lun["lunar_day"], ysi, yzi, mi, zmi, male)
    yang_year = ysi % 2 == 0
    forward = (yang_year and male) or (not yang_year and not male)  # 양남·음녀 順 / 음남·양녀 逆

    def yunyeon(zi):  # 流年: 년지궁=1세, 지지 順行 12년 주기
        base = ((zi - yzi) % 12) + 1
        return [base + 12 * k for k in range(10) if base + 12 * k <= 120]
    board = []
    for zi in range(12):
        order = (mi - zi) % 12  # 궁 라벨: 명궁→형제→…→부모 (항상 지지 역행)
        # 大限 진행: 양남·음녀는 지지 順行(명궁→부모궁 방향), 음남·양녀는 지지 逆行
        step = (zi - mi) % 12 if forward else (mi - zi) % 12
        start = guk + step * 10
        gung = GUNG12[order]
        stars = chart.get(zi, [])
        a = aux[zi]
        board.append({
            "지지": JIJI[zi], "궁간지": CHEONGAN[divination.명궁_천간(ysi, zi)] + JIJI[zi],
            "궁": gung, "궁한자": GUNG_HAN[gung],
            "주성": [STAR_HAN.get(s, s) for s in stars], "주성한글": stars,
            "대한": f"{start}-{start + 9}", "is명궁": zi == mi, "is신궁": zi == sin_idx,
            "보좌": a["보좌"], "잡성": a["잡성"], "박사신": a["박사신"], "장생신": a["장생신"],
            "소한": a["소한"], "유년": yunyeon(zi)[:5], "묘왕": {s: g for s, g in a["묘왕"]},
            "사화": [{"화": h, "성": STAR_HAN.get(s, s)} for h, s in a["사화"]],
        })
    _t = _dt.date.today()
    _sy, _sm, _sd = det["_solar"]
    age = _t.year - _sy - (1 if (_t.month, _t.day) < (_sm, _sd) else 0)  # 자미는 만 나이 기준
    # 올해 유년(流年)궁 = 그 해 태세(지지) 궁 — 나이로 찾지 않는다(정석).
    # 연초(입춘 전)는 전년 태세로 근사(자미 유년은 음력 새해 기준이나 입춘으로 근사).
    _ty = _t.year if (_t.month, _t.day) >= (2, 4) else _t.year - 1
    yun_branch = JIJI[(_ty - 4) % 12]
    return {**j, "음력": f"{lun.get('lunar_year', '')}.{lun['lunar_month']}.{lun['lunar_day']}",
            "명궁주성": ju, "명주": myeongju, "신주": sinju, "신궁": JIJI[sin_idx],
            "현재나이": age, "올해유년궁": yun_branch, "유년기준연도": _ty, "명반": board}


@router.post("/full")
async def full(req: ClassicReq):
    """자미두수 명반 (해석 없이 명반만)."""
    try:
        det = _chart(req)
        return {"자미두수": _jami(det)}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/jami/analyze")
async def jami_analyze(req: ClassicReq):
    """자미두수 명반 AI 해석(SSE 스트림). 명반을 절대 기준으로 자미두수 체계로 풀이."""
    try:
        det = _chart(req)
        jami = _jami(det)
    except Exception as e:
        raise HTTPException(500, str(e))
    return StreamingResponse(
        ai_report.stream_jami(jami, req.focus),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/compatibility")
async def compatibility(male: ClassicReq, female: ClassicReq):
    dm, df = _chart(male), _chart(female)
    gzm, gzf = dm["pillars"]["day"]["pillar"], df["pillars"]["day"]["pillar"]
    om, of = divination.NAPEUM.get(gzm), divination.NAPEUM.get(gzf)
    return {"male": {"일주": gzm, "납음": om}, "female": {"일주": gzf, "납음": of},
            "납음궁합": content.gunghap_napeum(om, of),
            "운성궁합": content.gunghap_unseong(dm["twelve_growth"].get("day"), df["twelve_growth"].get("day")),
            "성격궁합": content.gunghap_char(dm["pillars"]["day"]["stem"], df["pillars"]["day"]["stem"])}


@router.post("/juyeok")
async def juyeok():
    yos = divination.동전_작괘()
    sang, ha, eum, byeon = divination.작괘_괘상(yos)
    g = content.juyeok_lookup(sang, ha)
    if not g:
        raise HTTPException(500, "괘 없음")
    out = {"효": yos, "음양": eum, "변효": byeon, "괘명": g["name"], "풀이": g["text"]}
    # 변괘(지괘): 변효 위치의 음양을 반전해 재조합
    if byeon:
        yy = [(v ^ 1) if (i + 1) in byeon else v for i, v in enumerate(eum)]
        ha2 = yy[0] | (yy[1] << 1) | (yy[2] << 2)
        sang2 = yy[3] | (yy[4] << 1) | (yy[5] << 2)
        g2 = content.juyeok_lookup(sang2, ha2)
        if g2:
            out["변괘"] = {"음양": yy, "괘명": g2["name"], "풀이": g2["text"]}
    return out


@router.get("/jeukseok")
async def jeukseok_cats():
    return content.jeukseok_categories()


@router.get("/jeukseok/{category}")
async def jeukseok(category: str):
    n = random.randint(1, 64)
    txt = content.jeukseok_draw(category, n)
    if txt is None:
        raise HTTPException(404, "없음")
    return {"category": category, "풀이": txt}


@router.get("/gimun")
async def gimun(year: int = 0, month: int = 1, day: int = 1, hour: int = 12, minute: int = 0, purpose: str = "금전"):
    if not year:
        t = _dt.datetime.now()
        year, month, day, hour, minute = t.year, t.month, t.day, t.hour, t.minute
    try:
        bw = gimun_engine.gimun_banwi(year, month, day, hour, minute)
        pog = gimun_engine.gimun_poguk(year, month, day, hour, minute)
    except Exception as e:
        raise HTTPException(500, str(e))
    palaces = pog.get("궁별", {})
    out = []
    for zhi, info in bw.items():
        key = (info.get("목적별키", {}) or {}).get(purpose, "")
        tbl, _, idx = key.partition(":")
        f = content.by_code(tbl, idx) if idx else {}
        out.append({"방위": DIR_KO.get(zhi, zhi), "지지": zhi, "천반": info.get("천반"), "지반": info.get("지반"),
                    "궁": (palaces.get(zhi, {}) or {}).get("palace"),
                    "격": (f.get("SENTENCE") or "").strip(), "풀이": (f.get("DATA") or "").strip()})
    center = palaces.get("中", {}) or {}
    return {"국": pog.get("국"), "purpose": purpose, "방위": out,
            "중궁": {"천반": center.get("천반"), "지반": center.get("지반"), "궁": center.get("palace", 5)}}


class FollowupReq(BaseModel):
    prev: str = ""
    question: str


@router.post("/followup")
async def followup(req: FollowupReq):
    """해석 후 추가 질문 — 이전 해석 맥락 + 질문 → 대화형 답변(SSE)."""
    return StreamingResponse(
        ai_report.stream_followup(req.prev, req.question),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/jami/compat")
async def jami_compat(a: ClassicReq, b: ClassicReq):
    """자미두수 궁합 — 두 명반 비교 AI 해석(SSE 스트림)."""
    try:
        ja = _jami(_chart(a))
        jb = _jami(_chart(b))
    except Exception as e:
        raise HTTPException(500, str(e))
    return StreamingResponse(
        ai_report.stream_jami_compat(ja, jb),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# 지지 띠 이름 (년지 → 한국어 띠)
_TTI_KO = {"子": "쥐", "丑": "소", "寅": "호랑이", "卯": "토끼", "辰": "용", "巳": "뱀",
           "午": "말", "未": "양", "申": "원숭이", "酉": "닭", "戌": "개", "亥": "돼지"}


@router.get("/taegil")
async def taegil(purpose: str = "결혼", year: int = 0, month: int = 0,
                 birth_year: int = 0, birth_month: int = 0, birth_day: int = 0):
    """택일(擇日) — 건제12신 + 황도흑도로 목적별 길일 추천 (참고용).

    생년월일(birth_*)을 주면 본인 생년지(띠)와 충(沖)하는 날(본명충일, 本命沖日)을
    길일에서 제외해 개인별로 다른 결과를 낸다.
    """
    import calendar
    t = _dt.date.today()
    if not year:
        year = t.year
    if not month:
        month = t.month

    # 본인 생년지(띠) — 입춘 경계를 반영하려 만세력으로 실제 연주 지지를 구한다
    own_branch = None
    if birth_year and birth_month and birth_day:
        try:
            bres = _calc.calculate_saju(birth_year, birth_month, birth_day, 12, 0,
                                        use_solar_time=True, longitude=127.5, early_zi_time=False)
            own_branch = get_saju_details(bres)["pillars"]["year"]["branch"]
        except Exception:
            own_branch = None
    own_idx = JIJI.index(own_branch) if own_branch else None

    gil = PURPOSE_GIL.get(purpose, PURPOSE_GIL["결혼"])
    ndays = calendar.monthrange(year, month)[1]
    out = []
    excluded_bonmyeong = 0  # 본명충일로 제외된 날 수 (안내용)
    for day in range(1, ndays + 1):
        try:
            res = _calc.calculate_saju(year, month, day, 12, 0, use_solar_time=True, longitude=127.5, early_zi_time=False)
            P = get_saju_details(res)["pillars"]
        except Exception:
            continue
        ii = JIJI.index(P["day"]["branch"])
        wi = JIJI.index(P["month"]["branch"])
        gj = (ii - wi) % 12  # 건제12신 idx
        if gj in _GEONJE_HYUNG:  # 파·폐 제외
            continue
        hh = (ii - JIJI.index(CHEONGRYONG[JIJI[wi]])) % 12
        is_hwang = hh in _HWANGDO_IDX
        score = (2 if gj in gil else 0) + (2 if is_hwang else 0)
        if score <= 0:
            continue
        # 길일 조건을 충족한 날이라도 본명충일(일지가 본인 생년지와 沖 = 지지 6칸 차이)이면
        # 개인 흉일로 제외한다 → 여기서 세야 "제외된 길일 수"가 정확하다
        if own_idx is not None and (ii - own_idx) % 12 == 6:
            excluded_bonmyeong += 1
            continue
        out.append({"day": day, "간지": P["day"]["pillar"], "요일": ["월", "화", "수", "목", "금", "토", "일"][_dt.date(year, month, day).weekday()],
                    "건제": GEONJE_KO[GEONJE[gj]], "황도": HWANGHEUK[hh], "황도길": is_hwang, "score": score})
    out.sort(key=lambda x: (-x["score"], x["day"]))
    return {"purpose": purpose, "year": year, "month": month, "길일": out,
            "본인띠": own_branch or "", "본인띠명": _TTI_KO.get(own_branch, "") if own_branch else "",
            "본명충제외": excluded_bonmyeong}


# ==== 래정법(來情法) ====
# 내담자 사주 + 방문 연월일시 → 방문 시각 8글자를 내담자 일간 기준 십신으로 변환해
# 방문 목적(용건)을 가능성 순으로 추정한다. 표준 명리 십신 통설 기반이며, 단정이 아니라
# '가능성 높은 용건 순'으로 제시한다.
_SIP_GROUP = {
    "比肩": "비겁", "劫財": "비겁", "食神": "식상", "傷官": "식상",
    "偏財": "재성", "正財": "재성", "偏官": "관성", "正官": "관성",
    "偏印": "인성", "正印": "인성",
}
_SIP_KO = {
    "比肩": "비견", "劫財": "겁재", "食神": "식신", "傷官": "상관",
    "偏財": "편재", "正財": "정재", "偏官": "편관", "正官": "정관",
    "偏印": "편인", "正印": "정인",
}
# 방문 8글자 위치별 가중(월지 최강=왕, 일주 강조 — 전통 래정 '월지 중심 + 일진')
_RAE_POS_W = {
    ("month", "branch"): 3.0, ("day", "stem"): 2.0, ("day", "branch"): 2.0,
    ("month", "stem"): 1.5, ("hour", "branch"): 1.5, ("hour", "stem"): 1.0,
    ("year", "stem"): 1.0, ("year", "branch"): 1.0,
}
# 방문 지지의 12운성 세력 배율 — 왕(旺)이면 그 십신 세력↑, 쇠·병·사·묘·절이면↓
_UNSEONG_MULT = {
    "장생": 1.3, "관대": 1.3, "건록": 1.3, "제왕": 1.3,
    "목욕": 1.0, "양": 1.0, "쇠": 1.0,
    "병": 0.75, "사": 0.75, "묘": 0.75, "절": 0.75, "태": 0.75,
}
# 방문 지지의 12신살(내담자 띠=년지 기준) → 방문 목적 보너스
_SINSAL_PURPOSE = {
    "년살": ("애정·이성", 1.5), "망신살": ("애정·이성", 0.8),
    "역마살": ("문서·계약·이사", 1.5), "지살": ("문서·계약·이사", 1.2), "화개살": ("문서·계약·이사", 1.0),
    "장성살": ("직장·사업", 1.2), "반안살": ("직장·사업", 1.0),
    "겁살": ("건강·질병", 0.8), "재살": ("건강·질병", 0.8), "천살": ("건강·질병", 0.8),
}


def _raejeong_calc(gender, y, m, d, h, mi, vy, vm, vd, vh, vmi=0):
    """래정 산출 — 내담자 일간 대비 방문시각 십신 분포 + 12운성·12신살 + 목적 랭킹."""
    cres = _calc.calculate_saju(y, m, d, h, mi, use_solar_time=True, longitude=127.5, early_zi_time=False)
    cP = get_saju_details(cres)["pillars"]
    day_stem = cP["day"]["stem"]
    c_year_branch = cP["year"]["branch"]  # 내담자 띠(년지) — 12신살 기준
    vres = _calc.calculate_saju(vy, vm, vd, vh, vmi, use_solar_time=True, longitude=127.5, early_zi_time=False)
    vP = get_saju_details(vres)["pillars"]

    group_w = defaultdict(float)
    detail = []
    sinsal_found = []  # 방문 지지의 12신살 목록
    for pos in ("year", "month", "day", "hour"):
        for kind in ("stem", "branch"):
            ch = vP[pos][kind]
            sp = yearun_engine.sipsin(day_stem, ch)  # 지지는 본기 천간으로 자동 치환
            grp = _SIP_GROUP[sp]
            w = _RAE_POS_W[(pos, kind)]
            info = {"위치": pos, "종류": kind, "글자": ch, "십신": _SIP_KO[sp], "그룹": grp}
            if kind == "branch":
                us = TWELVE_GROWTH.get(day_stem, {}).get(ch)
                if us:
                    w *= _UNSEONG_MULT.get(us, 1.0)  # 12운성 세력 반영
                    info["운성"] = us
                ss = get_sinsal_list(c_year_branch, ch)  # 내담자 띠 기준 12신살
                if ss:
                    info["신살"] = ss
                    sinsal_found.append(ss)
            group_w[grp] += w
            detail.append(info)

    g = lambda k: group_w.get(k, 0.0)
    male = gender in ("남", "M", "남자")
    # 십신그룹 → 방문 목적 배점 (남명 재성=이성/여명 관성=이성)
    P = {
        "재물·금전": g("재성") * 1.0 + g("비겁") * 0.4,
        "애정·이성": (g("재성") if male else g("관성")) * 0.8,
        "직장·사업": g("관성") * 1.0 + g("식상") * 0.6,
        "문서·계약·이사": g("인성") * 1.0,
        "건강·질병": g("관성") * 0.3 + g("식상") * 0.3,
        "인간관계·경쟁": g("비겁") * 1.0,
    }
    # 12신살 목적 보너스 (도화=애정, 역마·지살=이사, 화개=문서, 장성·반안=직장, 겁·재·천살=관재/건강)
    for ss in sinsal_found:
        hit = _SINSAL_PURPOSE.get(ss)
        if hit:
            P[hit[0]] = P.get(hit[0], 0.0) + hit[1]

    total = sum(v for v in P.values() if v > 0) or 1.0
    ranking = [{"목적": k, "score": round(v, 1), "pct": round(v / total * 100)}
               for k, v in sorted(P.items(), key=lambda x: -x[1]) if v > 0]
    # AI 해석용 방문 지지 특징(운성·신살) 요약
    feat = []
    for it in detail:
        if it.get("운성") or it.get("신살"):
            tags = [t for t in (it.get("운성"), it.get("신살")) if t]
            feat.append(f"{it['글자']}({', '.join(tags)})")
    return {
        "내담자일간": day_stem,
        "내담자띠": c_year_branch,
        "방문사주": {"연": vP["year"]["pillar"], "월": vP["month"]["pillar"],
                    "일": vP["day"]["pillar"], "시": vP["hour"]["pillar"]},
        "방문일진": vP["day"]["pillar"],
        "십신분포": {k: round(v, 1) for k, v in group_w.items()},
        "방문특징": feat,
        "목적랭킹": ranking,
        "상세": detail,
    }


# ==== 박일우 명리 일진내정법(日辰來情法) ====
# 내방일(상담일)의 일진 지지를 0으로 두고 순행 한 칸씩 진(辰)을 배열한다.
# 2진~5진 = 일진 +1~+4, 대2진~대5진 = 일진 -1~-4. 4진(實)이 방문 목적.
_ILJIN_JIN = [
    (-4, "대5진", "상문충", "해결"),
    (-3, "대4진", "목적충", "실망"),
    (-2, "대3진", "준개", "이연"),
    (-1, "대2진", "반안", "무기력·오가객"),
    (0, "일진", "군(根)", "두마음"),
    (1, "2진", "양인", "능력·욕심"),
    (2, "3진", "상문", "천액·상해·조심"),
    (3, "4진", "목적(實)", "방문 목적"),
    (4, "5진", "비복(비겁)", "이별"),
]
# 지지 원진(元嗔) 쌍
_WONJIN = {"子": "未", "未": "子", "丑": "午", "午": "丑", "寅": "酉", "酉": "寅",
           "卯": "申", "申": "卯", "辰": "亥", "亥": "辰", "巳": "戌", "戌": "巳"}
# 원국 각 주의 상징(공간·관련사)
_JU_INFO = {
    "year": ("년주", "토지·선산·부동산(조부모)"),
    "month": ("월주", "가정·가장(직장)"),
    "day": ("일주", "안방·배우자·이성"),
    "hour": ("시주", "사업장·사업·자식"),
}
# 원진이 걸린 주별 해석
_WONJIN_JU = {
    "year": "현재 모든 방향이 힘들고 부담스러움",
    "month": "직장·가정이 힘듦",
    "day": "배우자·연인 문제",
    "hour": "사업·자식 문제",
}
# 공망(空亡)에 걸린 육신(십신그룹)별 해석
_GONGMANG_YUKSIN = {
    "인성": "문서로 조심해야 하며, 허영을 버리고 나아가야 함",
    "재성": "노동으로 종사하며, 돈을 쉽게 벌지 못함",
    "관성": "명예직에 뜻을 두나 관운을 쉽게 얻기 어려움",
    "식상": "(여성) 자식 두기 어렵고, 문서 관련 애로가 있음",
    "비겁": "인복 없이 홀로 노력함",
}


def _iljin_naejeong_calc(gender, y, m, d, h, mi, vy, vm, vd, vh, vmi=0):
    """박일우 일진내정법 — 내방일 일진 기준 진(辰) 배열 + 4진 목적 + 공망·원진·원국 대조."""
    cres = _calc.calculate_saju(y, m, d, h, mi, use_solar_time=True, longitude=127.5, early_zi_time=False)
    cP = get_saju_details(cres)["pillars"]
    day_stem = cP["day"]["stem"]
    ju_branch = {pos: cP[pos]["branch"] for pos in ("year", "month", "day", "hour")}

    vres = _calc.calculate_saju(vy, vm, vd, vh, vmi, use_solar_time=True, longitude=127.5, early_zi_time=False)
    vP = get_saju_details(vres)["pillars"]
    iljin_ganzhi = vP["day"]["pillar"]
    iljin_branch = vP["day"]["branch"]
    ii = JIJI.index(iljin_branch)

    # 진(辰) 배열 — 각 진 지지의 내방자 일간 대비 십성 + 원국 어느 주에 걸리는지
    jin = []
    for off, name, star, mean in _ILJIN_JIN:
        bz = JIJI[(ii + off) % 12]
        sp = _SIP_KO[yearun_engine.sipsin(day_stem, bz)]
        in_ju = [_JU_INFO[p][0] for p, b in ju_branch.items() if b == bz]
        jin.append({"자리": name, "offset": off, "지지": bz, "성": star, "의미": mean,
                    "십성": sp, "원국주": in_ju})
    sa_jin = next(j for j in jin if j["자리"] == "4진")  # 4진 = 방문 목적

    # 공망(내방일 일진의 공망) → 내방자 일간 대비 육신
    gm = get_gongmang(iljin_ganzhi)  # 예: "戌亥"
    gongmang = []
    for gb in (gm or ""):
        if gb not in JIJI:
            continue
        grp = _SIP_GROUP[yearun_engine.sipsin(day_stem, gb)]
        gongmang.append({"지지": gb, "육신": grp, "해석": _GONGMANG_YUKSIN.get(grp, "")})

    # 원진(일진 지지의 원진)이 원국 어느 주에 걸리는지
    wj_branch = _WONJIN.get(iljin_branch, "")
    wonjin = []
    for p, b in ju_branch.items():
        if b == wj_branch:
            wonjin.append({"주": _JU_INFO[p][0], "지지": b, "해석": _WONJIN_JU[p]})

    # 원국 각 주 정보 (진 배열이 어느 주에 걸리는지 함께 해석)
    won_guk = [{"주": _JU_INFO[p][0], "지지": ju_branch[p], "상징": _JU_INFO[p][1]}
               for p in ("year", "month", "day", "hour")]

    return {
        "내담자일간": day_stem,
        "내방일진": iljin_ganzhi,
        "진배열": jin,
        "방문목적진": {"지지": sa_jin["지지"], "십성": sa_jin["십성"], "원국주": sa_jin["원국주"]},
        "공망": {"공망지지": gm, "해석": gongmang},
        "원진": {"원진지지": wj_branch, "걸린주": wonjin},
        "원국": won_guk,
    }


class RaejeongReq(BaseModel):
    # 내담자(상담자) 사주
    gender: str = "남"
    year: int = 1990
    month: int = 1
    day: int = 1
    hour: int = 12
    minute: int = 0
    # 방문(내방) 연월일시 — visit_hour<0이면 현재 시각으로
    visit_year: int = 0
    visit_month: int = 0
    visit_day: int = 0
    visit_hour: int = -1
    visit_minute: int = 0
    focus: str = ""  # 집중 해석할 방문 목적(빈 값이면 전체)


def _visit_or_now(req: "RaejeongReq"):
    """방문 시각 미지정(visit_hour<0) 시 현재 연월일시로 보정. (년/월/일/시/분)"""
    t = _dt.datetime.now()
    if req.visit_hour is None or req.visit_hour < 0:
        return (req.visit_year or t.year, req.visit_month or t.month, req.visit_day or t.day, t.hour, t.minute)
    return (req.visit_year or t.year, req.visit_month or t.month, req.visit_day or t.day,
            req.visit_hour, max(0, req.visit_minute))


@router.post("/raejeong")
async def raejeong(req: RaejeongReq):
    """박일우 일진내정법 — 진(辰) 배열 + 4진 방문 목적 + 공망·원진·원국 대조."""
    vy, vm, vd, vh, vmi = _visit_or_now(req)
    return _iljin_naejeong_calc(req.gender, req.year, req.month, req.day, req.hour, req.minute, vy, vm, vd, vh, vmi)


@router.post("/raejeong/analyze")
async def raejeong_analyze(req: RaejeongReq):
    """일진내정법 AI 해석(스트리밍)."""
    vy, vm, vd, vh, vmi = _visit_or_now(req)
    data = _iljin_naejeong_calc(req.gender, req.year, req.month, req.day, req.hour, req.minute, vy, vm, vd, vh, vmi)
    return StreamingResponse(ai_report.stream_iljin_naejeong(data, req.gender), media_type="text/event-stream")


# ==== 일진 달력 (전문가용 — 달력에서 날짜별 일진·내 일간 대비 십성/운성) ====
@router.get("/iljin-calendar")
async def iljin_calendar(year: int, month: int, day_gan: str = ""):
    """해당 월의 일별 일진(간지). day_gan(일간)을 주면 십성·12운성까지 대조한다."""
    import calendar as _cal
    ndays = _cal.monthrange(year, month)[1]
    first_weekday = _dt.date(year, month, 1).weekday()  # 0=월
    days = []
    for day in range(1, ndays + 1):
        try:
            res = _calc.calculate_saju(year, month, day, 12, 0, use_solar_time=True, longitude=127.5, early_zi_time=False)
            P = get_saju_details(res)["pillars"]
        except Exception:
            continue
        gz = P["day"]["pillar"]
        item = {"day": day, "간지": gz}
        if day_gan in CHEONGAN:
            item["십성"] = _SIP_KO[yearun_engine.sipsin(day_gan, gz[0])]
            item["지지십성"] = _SIP_KO[yearun_engine.sipsin(day_gan, gz[1])]
            item["운성"] = TWELVE_GROWTH.get(day_gan, {}).get(gz[1], "-")
        days.append(item)
    return {"year": year, "month": month, "first_weekday": first_weekday, "days": days}


# ==== 현공비성(玄空飛星) AI 해석 ====
# 비성반 계산은 프론트 lib/flyingStars.ts(문헌·실전 검증 완료)에서 수행하고,
# 여기서는 그 결과를 받아 해석 프롬프트만 구성한다(재계산 금지 원칙).
class HyeongongReq(BaseModel):
    sitting: str = "子"
    facing: str = "午"
    period: int = 9       # 원운 — 준공(건축) 시기 기준으로 세운 반의 운
    cur_period: int = 0   # 당운 — 감정(입주) 시점의 운. 왕쇠 판정 기준(0=미전달)
    structure: str = ""
    annual_year: int = 0
    cells: list = []      # [{방위,산성,향성,운반,연성,조합,팔택}]
    ming_gua: str = ""    # 팔택 본명괘(선택)
    plate: str = ""       # "하괘" | "체괘" — 겸향이면 체괘로 세운 반이다


@router.post("/hyeongong/analyze")
async def hyeongong_analyze(req: HyeongongReq):
    """현공비성 AI 해석(스트리밍)."""
    return StreamingResponse(ai_report.stream_hyeongong(req.model_dump()), media_type="text/event-stream")


# ── 도면 판독(비전) — 입극점 산입 범위 판단 ────────────────────────────────
class FloorPlanReq(BaseModel):
    image: str = ""          # data URL 또는 순수 base64
    mime_type: str = "image/jpeg"


@router.post("/floorplan/analyze")
async def floorplan_analyze(req: FloorPlanReq):
    """도면 사진의 산입 범위를 AI가 판단한다.

    좌표는 뽑지 않는다 — 외곽선 검출은 클라이언트 이미지 처리가 맡고,
    여기서는 '어느 공간을 전유부로 볼 것인가'라는 판단만 받는다.
    """
    import base64
    import json as _json

    raw = (req.image or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="이미지가 비어 있습니다.")
    mime = req.mime_type or "image/jpeg"
    if raw.startswith("data:"):
        try:
            header, raw = raw.split(",", 1)
            mime = header.split(":", 1)[1].split(";", 1)[0] or mime
        except Exception:
            raise HTTPException(status_code=400, detail="이미지 형식을 읽을 수 없습니다.")
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="이미지 디코딩에 실패했습니다.")
    if not data:
        raise HTTPException(status_code=400, detail="이미지가 비어 있습니다.")
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="이미지가 너무 큽니다(6MB 초과). 축소해서 보내주세요.")

    text = ai_report.analyze_floorplan(data, mime)
    if not text:
        raise HTTPException(status_code=503, detail="도면 판독에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    try:
        return _json.loads(text)
    except Exception:
        # 모델이 JSON 외 텍스트를 섞은 경우 첫 { ~ 마지막 } 만 추려 재시도
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            try:
                return _json.loads(text[s:e + 1])
            except Exception:
                pass
        raise HTTPException(status_code=502, detail="판독 결과를 해석하지 못했습니다.")


# ── 위성지도 불러오기 — 주소로 건물 배치각을 보는 용도 ──────────────────────
class MapReq(BaseModel):
    address: str = ""        # 주소(비우면 lat/lng 사용)
    lat: float | None = None
    lng: float | None = None
    zoom: int = 19           # 18~20이 단지 한 동이 보이는 배율
    size: int = 640          # 정사각
    scale: int = 2           # 2 = 고해상도(같은 범위를 2배 픽셀로)
    maptype: str = "satellite"   # "satellite" | "basic"(일반지도)


def _mpp(lat: float, zoom: int, scale: int) -> float:
    """웹 메르카토르 미터/픽셀 — 위도 보정 포함."""
    import math
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** zoom) / scale


async def _naver_map(req: MapReq, kid: str, ksec: str) -> dict:
    """네이버 클라우드 플랫폼 — Geocoding + Static Map(위성).

    Static Map은 월 300만 건 무료이고 최대 1024px까지 받는다.

    실호출로 확인한 두 가지:
      · 엔드포인트는 maps.apigw.ntruss.com 이다. 구 naveropenapi.apigw.ntruss.com 은
        같은 키로도 401 "A subscription to the API is required" 가 난다.
      · maptype 은 satellite_base 를 쓴다. satellite 는 상호·도로 라벨이 얹혀 나와
        중심 찍기와 외곽선 작업을 방해한다.
      · format 은 jpg. 같은 2048px에서 png 3.5MB / jpg 291KB 로 12배 차이가 난다
        (위성사진은 사진이라 png 무손실이 의미가 없다).
    center 파라미터가 '경도,위도' 순서인 점에 주의(구글과 반대).
    """
    import base64

    import httpx

    H = {"x-ncp-apigw-api-key-id": kid, "x-ncp-apigw-api-key": ksec}
    mtype = "basic" if (req.maptype or "").lower() == "basic" else "satellite_base"
    lat, lng, resolved = req.lat, req.lng, ""
    level = max(0, min(20, int(req.zoom or 19)))
    size = max(64, min(1024, int(req.size or 640)))
    scale = 2 if int(req.scale or 2) >= 2 else 1

    async with httpx.AsyncClient(timeout=15) as client:
        if lat is None or lng is None:
            addr = (req.address or "").strip()
            if not addr:
                raise HTTPException(status_code=400, detail="주소 또는 좌표가 필요합니다.")
            g = await client.get(
                "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
                params={"query": addr}, headers=H,
            )
            if g.status_code in (401, 403):
                raise HTTPException(status_code=503, detail="네이버 인증 실패 — Geocoding API 이용 신청과 키를 확인하세요.")
            if g.status_code != 200:
                raise HTTPException(status_code=502, detail=f"주소 검색 실패(HTTP {g.status_code})")
            gj = g.json()
            addrs = gj.get("addresses") or []
            if gj.get("status") != "OK":
                raise HTTPException(status_code=502, detail=f"주소 검색 오류: {gj.get('errorMessage') or gj.get('status')}")
            if not addrs:
                raise HTTPException(status_code=404, detail="주소를 찾지 못했습니다. 도로명주소나 건물명을 넣어 보세요.")
            top = addrs[0]
            lng, lat = float(top["x"]), float(top["y"])   # x=경도, y=위도
            resolved = top.get("roadAddress") or top.get("jibunAddress") or ""

        m = await client.get(
            "https://maps.apigw.ntruss.com/map-static/v2/raster",
            params={
                "center": f"{lng},{lat}",      # 경도,위도 순
                "level": level, "w": size, "h": size,
                # satellite_base = 라벨 없는 순수 위성 / basic = 일반지도
                "scale": scale, "maptype": mtype, "format": "jpg",
            },
            headers=H,
        )
    if m.status_code in (401, 403):
        raise HTTPException(status_code=503, detail="네이버 인증 실패 — Static Map API 이용 신청 여부를 확인하세요.")
    if m.status_code != 200 or not m.headers.get("content-type", "").startswith("image"):
        raise HTTPException(status_code=502, detail=f"위성지도를 받지 못했습니다(HTTP {m.status_code}).")

    return {
        "image": "data:image/jpeg;base64," + base64.b64encode(m.content).decode(),
        "lat": lat, "lng": lng, "address": resolved,
        "zoom": level, "meters_per_pixel": round(_mpp(lat, level, scale), 4),
        "north_up": True, "provider": "naver", "maptype": mtype,
    }


async def _google_map(req: MapReq, key: str) -> dict:
    """Google Maps Platform — Geocoding + Maps Static(위성). 무료 상한 640px."""
    import base64

    import httpx

    lat, lng, resolved = req.lat, req.lng, ""
    zoom = max(15, min(21, int(req.zoom or 19)))
    size = max(256, min(640, int(req.size or 640)))
    scale = 2 if int(req.scale or 2) >= 2 else 1

    async with httpx.AsyncClient(timeout=15) as client:
        if lat is None or lng is None:
            addr = (req.address or "").strip()
            if not addr:
                raise HTTPException(status_code=400, detail="주소 또는 좌표가 필요합니다.")
            g = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": addr, "key": key, "language": "ko"},
            )
            if g.status_code != 200:
                raise HTTPException(status_code=502, detail=f"주소 검색 실패(HTTP {g.status_code})")
            gj = g.json()
            status = gj.get("status")
            if status == "REQUEST_DENIED":
                raise HTTPException(status_code=503, detail=f"주소 검색이 거부됐습니다 — Geocoding API를 켜야 합니다. ({gj.get('error_message', '')})")
            if status != "OK" or not gj.get("results"):
                raise HTTPException(status_code=404, detail=f"주소를 찾지 못했습니다. ({status})")
            top = gj["results"][0]
            loc = top["geometry"]["location"]
            lat, lng = loc["lat"], loc["lng"]
            resolved = top.get("formatted_address", "")

        m = await client.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params={
                "center": f"{lat},{lng}", "zoom": zoom,
                "size": f"{size}x{size}", "scale": scale,
                "maptype": ("roadmap" if (req.maptype or "").lower() == "basic" else "satellite"),
                "format": "jpg", "key": key,
            },
        )
    if m.status_code != 200:
        raise HTTPException(status_code=502, detail=f"위성지도를 받지 못했습니다(HTTP {m.status_code}). Maps Static API가 켜져 있는지 확인하세요.")
    if not m.content or not m.headers.get("content-type", "").startswith("image"):
        raise HTTPException(status_code=502, detail="위성지도 응답이 이미지가 아닙니다. API 키 제한 설정을 확인하세요.")

    return {
        "image": "data:image/jpeg;base64," + base64.b64encode(m.content).decode(),
        "lat": lat, "lng": lng, "address": resolved,
        "zoom": zoom, "meters_per_pixel": round(_mpp(lat, zoom, scale), 4),
        "north_up": True, "provider": "google",
        "maptype": ("basic" if (req.maptype or "").lower() == "basic" else "satellite"),
    }


@router.post("/map/satellite")
async def map_satellite(req: MapReq):
    """주소(또는 좌표)로 위성지도를 받아 온다.

    위성지도는 **항상 위가 정북**이라, 나침반 실측 없이도 건물이 앉은 각도를 볼 수 있다.
    다만 아파트는 동마다 배치각이 달라 이것은 실측의 대체가 아니라 교차검증용이다.

    공급자는 네이버를 먼저 쓴다 — 한국 주소 정확도가 높고 Static Map 무료량(월 300만)이 크며
    최대 1024px까지 받는다. 네이버 키가 없으면 구글로 넘어간다.
    키가 아예 없으면 조용히 넘기지 말고 무엇을 발급·활성화해야 하는지 알린다.
    """
    import os

    nid = os.getenv("NAVER_MAPS_KEY_ID")
    nsec = os.getenv("NAVER_MAPS_KEY")
    if nid and nsec:
        return await _naver_map(req, nid, nsec)

    gkey = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if gkey:
        return await _google_map(req, gkey)

    raise HTTPException(
        status_code=503,
        detail=(
            "지도 API 키가 없습니다. 둘 중 하나를 설정하세요 — "
            "① 네이버(권장): NAVER_MAPS_KEY_ID·NAVER_MAPS_KEY, NCP에서 Maps의 Geocoding·Static Map 이용 신청. "
            "② 구글: GOOGLE_MAPS_API_KEY, Geocoding API·Maps Static API 활성화."
        ),
    )
