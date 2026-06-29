# -*- coding: utf-8 -*-
"""Saju4 통합 콘텐츠 DB 조회 헬퍼.
saju_app의 계산엔진 출력(일간/일지/십신/오행/지지 등)을 받아
레거시 해석 텍스트(saju4_content.db)를 조회한다.

사용 예:
    db = ContentDB("saju4_content.db")
    db.ilju_text("甲", "子")            # 일주 해석
    db.gunghap_by_sipsin("劫財")        # 궁합(배우자) 해석
    db.search("도화살")                  # 전체 본문 키워드 검색
"""
import sqlite3
from typing import Optional

# saju_app 천간/지지 순서 ↔ Saju4 숫자코드(1-base)
CHEONGAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]   # 1~10
JIJI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]  # 1~12


class ContentDB:
    def __init__(self, path: str = "saju4_content.db"):
        self.con = sqlite3.connect(path)
        self.con.row_factory = sqlite3.Row

    def _q(self, sql: str, *params):
        return self.con.execute(sql, params).fetchall()

    # --- 도메인별 조회 ---------------------------------------------------
    def ilju_text(self, day_gan: str, day_branch: str, segment: int = 1, aspect: int = 1) -> Optional[str]:
        """일주(日柱) 해석. DayJoo token1=일간(천간)은 확정, token2~4(일지/운/측면)는 정밀 해독 대기.
        현재는 일간 기준 대표 풀이를 반환(후속 2군 작업에서 일주별 정밀화)."""
        g = CHEONGAN.index(day_gan) + 1
        rows = self._q("SELECT text FROM content WHERE source_table='DayJoo' AND idx_code LIKE ? "
                       "ORDER BY id LIMIT 1", f"{g}-%")
        return rows[0]["text"] if rows else None

    def gunghap_by_sipsin(self, sipsin: str, table: str = "GungHap_Couple") -> Optional[str]:
        """궁합 해석. 키가 십신명(劫財/比肩/傷官/食神/印綬/正官 …) 직접."""
        rows = self._q("SELECT text FROM content WHERE source_table=? AND idx_code=?", table, sipsin)
        return rows[0]["text"] if rows else None

    def daeun_flow(self, gender_code: int, sipsin: str, age_band: int, ver: int = 1) -> Optional[str]:
        """대운 흐름 해석. Myung_DaeUnExp 키=성별-십신-나이대-버전."""
        rows = self._q("SELECT text FROM content WHERE source_table='Myung_DaeUnExp' AND idx_code=?",
                       f"{gender_code}-{sipsin}-{age_band}-{ver}")
        return rows[0]["text"] if rows else None

    def name_samwon(self, ohaeng3: str) -> Optional[str]:
        """작명 삼원오행 해석. 키=오행3조합(예 '木木火')."""
        rows = self._q("SELECT text FROM content WHERE source_table='Name_Samwon' AND idx_code=?", ohaeng3)
        return rows[0]["text"] if rows else None

    def charm(self, major: int, minor: int = 1, seq: int = 1) -> list:
        """부적 본문. Charm_Contents 키=대분류_소분류_순번."""
        return [r["text"] for r in
                self._q("SELECT text FROM content WHERE source_table='Charm_Contents' AND idx_code=?",
                        f"{major}_{minor}_{seq}")]

    _HAN_JIJI = {'자': '子', '축': '丑', '인': '寅', '묘': '卯', '진': '辰', '사': '巳',
                 '오': '午', '미': '未', '신': '申', '유': '酉', '술': '戌', '해': '亥'}
    _JI_HAN = {v: k for k, v in _HAN_JIJI.items()}

    def jami_by_myeonggung(self, myeong_branch: str) -> list:
        """명궁 지지(한자)로 자미두수 성격풀이 후보 행 조회. SENTENCE1이 한글표기(해궁=亥)."""
        han = self._JI_HAN.get(myeong_branch)
        if not han:
            return []
        rows = self._q(
            "SELECT idx_code, MAX(CASE WHEN field='SENTENCE2' THEN text END) ju, "
            "MAX(CASE WHEN field='SENTENCE1' THEN text END) s1, "
            "MAX(CASE WHEN field='LOOK' THEN text END) look, "
            "MAX(CASE WHEN field='CHAR' THEN text END) ch "
            "FROM content WHERE source_table='Jami_Char' GROUP BY idx_code")
        out = []
        for r in rows:
            if (r["s1"] or "").count(han + "궁") and (f"명{han}궁" in (r["s1"] or "") or f"{han}궁" in (r["s1"] or "")):
                out.append(dict(r))
        return out

    # 자미 11영역 테이블
    JAMI_TABLES = {"Jami_Char": "성격", "Jami_Money": "재물", "Jami_Health": "건강",
                   "Jami_Couple": "배우자", "Jami_Child": "자녀", "Jami_Brother": "형제",
                   "Jami_Parent": "부모", "Jami_Friend": "교우", "Jami_House": "부동산",
                   "Jami_Location": "직위", "Jami_Fortune": "운세"}

    def jami_select(self, myeong_branch: str, juseong: list) -> Optional[str]:
        """명궁 지지 + 명궁 주성으로 Jami idx 유일선택. (E1316/E1415 2/2 검증)"""
        han = self._JI_HAN.get(myeong_branch)
        if not han:
            return None
        best, best_score = None, -1
        for r in self._q(
                "SELECT idx_code, MAX(CASE WHEN field='SENTENCE1' THEN text END) s1, "
                "MAX(CASE WHEN field='SENTENCE2' THEN text END) s2 "
                "FROM content WHERE source_table='Jami_Char' GROUP BY idx_code"):
            if han + "궁" not in (r["s1"] or ""):
                continue
            score = sum(1 for j in juseong if j in (r["s2"] or ""))
            if score > best_score:
                best, best_score = r["idx_code"], score
        return best

    def jami_aspects(self, idx: str) -> dict:
        """선택된 자미 idx로 11개 영역 풀이 전부 조회."""
        out = {}
        for tbl, label in self.JAMI_TABLES.items():
            fields = {r["field"]: r["text"] for r in
                      self._q("SELECT field,text FROM content WHERE source_table=? AND idx_code=? AND text!=''",
                              tbl, idx)}
            if fields:
                out[label] = fields
        return out

    def wonmyung(self, idx: str) -> str:
        """wonmyung 원국 풀이 — 키(또는 키 하위 항목들) 본문 결합."""
        rows = self._q(
            "SELECT text FROM content WHERE source_table='wonmyung' AND (idx_code=? OR idx_code LIKE ?) "
            "AND text!='' ORDER BY id", idx, idx + "-%")
        return " ".join(r["text"] for r in rows)

    # --- 주역(周易) 64괘 ---------------------------------------------
    _NAT = {"천": 0b111, "택": 0b011, "화": 0b101, "뢰": 0b001, "뇌": 0b001,
            "풍": 0b110, "수": 0b010, "산": 0b100, "지": 0b000}

    def juyeok_map(self) -> dict:
        """JumGwae 괘명 파싱 → (상괘bin, 하괘bin) → {idx, name, text}. 1회 캐시."""
        if hasattr(self, "_jymap"):
            return self._jymap
        import re
        m = {}
        for r in self._q("SELECT idx_code, text FROM content WHERE source_table='JumGwae'"):
            mt = re.search(r"점괘는\s*([가-힣]+)\s*점괘", r["text"])
            if not mt:
                continue
            nm = mt.group(1)
            if "위" in nm:                       # 重卦: X위Y → 자연=마지막글자
                up = lo = self._NAT.get(nm[-1])
            else:
                up, lo = self._NAT.get(nm[0]), self._NAT.get(nm[1])
            if up is None or lo is None:
                continue
            m[(up, lo)] = {"idx": r["idx_code"], "name": nm, "text": r["text"]}
        self._jymap = m
        return m

    def juyeok_lookup(self, upper_bin: int, lower_bin: int) -> Optional[dict]:
        return self.juyeok_map().get((upper_bin, lower_bin))

    # --- 궁합(宮合) ---------------------------------------------------
    OHAENG_NO = {"金": 1, "木": 2, "水": 3, "火": 4, "土": 5}  # Gung_NapEum 번호

    def gunghap_napeum(self, oh_m: str, oh_f: str) -> Optional[dict]:
        """납음오행 궁합. oh_m/oh_f = 남/여 일주 납음오행(金木水火土)."""
        key = f"{self.OHAENG_NO.get(oh_m)}-{self.OHAENG_NO.get(oh_f)}"
        d = self.by_code("Gung_NapEum", key)
        return d or None

    def gunghap_unseong(self, un_m: str, un_f: str) -> Optional[str]:
        """12운성 궁합. un_m/un_f = 남/여 일주 12운성."""
        r = self._q("SELECT text FROM content WHERE source_table='GungHap_TwelveUnSunGung' AND idx_code=?",
                    f"남{un_m}여{un_f}")
        return r[0]["text"] if r else None

    def gunghap_char(self, gan_m: str, gan_f: str) -> Optional[str]:
        """성격 궁합. 남/여 일간(천간) 쌍."""
        r = self._q("SELECT text FROM content WHERE source_table='GungHap_Char' AND idx_code=?",
                    f"{gan_m}{gan_f}")
        return r[0]["text"] if r else None

    # --- 즉석점(卽席占) -----------------------------------------------
    def jeukseok_categories(self) -> list:
        rows = self._q("SELECT DISTINCT idx_code FROM content WHERE source_table='JumData' AND text!=''")
        import re
        cats = sorted({re.match(r"([A-Za-z]+)", r["idx_code"]).group(1)
                       for r in rows if re.match(r"[A-Za-z]+", r["idx_code"])})
        return cats

    def jeukseok_draw(self, category: str, n: int) -> Optional[str]:
        idx = f"{category}{n:02d}"
        rows = self._q("SELECT text FROM content WHERE source_table='JumData' AND idx_code=?", idx)
        return rows[0]["text"] if rows else None

    def by_code(self, table: str, idx_code: str) -> dict:
        """임의 테이블+키 → {field: text} 전체."""
        return {r["field"]: r["text"] for r in
                self._q("SELECT field,text FROM content WHERE source_table=? AND idx_code=?", table, idx_code)}

    # --- 범용 -----------------------------------------------------------
    def search(self, keyword: str, domain: Optional[str] = None, limit: int = 20) -> list:
        """본문 키워드 검색."""
        if domain:
            return self._q("SELECT domain,source_table,idx_code,substr(text,1,80) t FROM content "
                           "WHERE text LIKE ? AND domain=? LIMIT ?", f"%{keyword}%", domain, limit)
        return self._q("SELECT domain,source_table,idx_code,substr(text,1,80) t FROM content "
                       "WHERE text LIKE ? LIMIT ?", f"%{keyword}%", limit)

    def domains(self) -> list:
        return self._q("SELECT domain,conversion_role,COUNT(*) tbls,SUM(content_cells) cells,"
                       "SUM(text_chars) chars FROM content_meta GROUP BY domain ORDER BY chars DESC")

    def close(self):
        self.con.close()


if __name__ == "__main__":
    import os
    db = ContentDB(os.path.join(os.path.dirname(__file__), "saju4_content.db"))
    print("일주 甲子:", (db.ilju_text("甲", "子") or "")[:50], "…")
    print("궁합 劫財:", (db.gunghap_by_sipsin("劫財") or "")[:50], "…")
    print("삼원 木木火:", (db.name_samwon("木木火") or "")[:50], "…")
    print("키워드 '도화살' 검색:", len(db.search("도화살")), "건")
    db.close()
