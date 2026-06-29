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
from pydantic import BaseModel

from sajupy import SajuCalculator, get_saju_details, lunar_to_solar, solar_to_lunar
from saju_utils import get_extended_saju_data
from content_db import ContentDB, CHEONGAN, JIJI
import divination
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


def _jami(det: dict) -> dict:
    P = det["pillars"]
    lun = solar_to_lunar(*det["_solar"])
    ysi = CHEONGAN.index(P["year"]["stem"])
    hbi = JIJI.index(P["hour"]["branch"])
    j = divination.자미_오행국(ysi, lun["lunar_month"], hbi)
    mi = JIJI.index(j["명궁"])
    ju = divination.명궁_주성(j["국수"], lun["lunar_day"], mi)
    sel = content.jami_select(j["명궁"], ju)
    # 12궁 명반: 명궁에서 역행으로 12궁(명궁→형제→부처…) 배치, 각 궁에 14주성
    chart = divination.자미_14주성(j["국수"], lun["lunar_day"])
    board = [{"지지": JIJI[zi], "궁": GUNG12[(mi - zi) % 12],
              "주성": chart.get(zi, []), "is명궁": zi == mi} for zi in range(12)]
    return {**j, "음력": f"{lun.get('lunar_year', '')}.{lun['lunar_month']}.{lun['lunar_day']}",
            "명궁주성": ju, "명반": board, "풀이": content.jami_aspects(sel) if sel else {}}


@router.post("/full")
async def full(req: ClassicReq):
    """명식 + 명리 종합 + 자미두수 (한 번에)."""
    try:
        det = _chart(req)
        return {"명식": {"pillars": det["pillars"], "ten_gods": det.get("ten_gods"),
                        "jiji_ten_gods": det.get("jiji_ten_gods"), "twelve_growth": det.get("twelve_growth"),
                        "five_elements": det.get("five_elements"), "sinsal": det.get("sinsal"),
                        "gongmang": det.get("gongmang"), "strength_analysis": det.get("strength_analysis")},
                "명리": _myungri(det), "자미두수": _jami(det)}
    except Exception as e:
        raise HTTPException(500, str(e))


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
