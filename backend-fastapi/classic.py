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
from saju_utils import get_extended_saju_data
from content_db import ContentDB, CHEONGAN, JIJI
import divination
import ai_report
import myungri_engine
import sinsal_engine
import yearun_engine
import gimun_engine

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
    age = _dt.date.today().year - det["_solar"][0] + 1  # 세는나이
    return {**j, "음력": f"{lun.get('lunar_year', '')}.{lun['lunar_month']}.{lun['lunar_day']}",
            "명궁주성": ju, "명주": myeongju, "신주": sinju, "신궁": JIJI[sin_idx],
            "현재나이": age, "명반": board}


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
