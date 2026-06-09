"""
명식(천간지지) → 이미지 생성 프롬프트 변환 모듈 (물상론 + 거리·궁위 배치)
- 일간(日干)을 '나'의 중심으로 삼고, 명식의 거리론·근묘화실에 따라 원근(전경→배경)을 배치한다.
    · 전경·중심: 일주(日柱, 나·배우자) — 일간에 가장 가까움
    · 가까이 곁: 시주(時柱, 미래·자식) — 일간 바로 옆(인접)
    · 중경 왼편: 월주(月柱, 부모·환경) — 일간 왼쪽(인접)
    · 원경 배경: 연주(年柱, 조상·뿌리) — 일간에서 가장 멈
- 천간·지지는 '띠 동물'이 아니라 물상론(物象論)의 자연 물상으로 그리고, 지지는 오행(목화토금수)을 함께 표기한다.
  (예: 甲=거목, 丑=꽁꽁 언 땅(土), 午=한여름 태양(火))
- 컨셉(국문)은 명식에서 결정론적으로 산출(환각 방지)하고, 영문 프롬프트만 AI로 윤색·폴백한다.
"""
import datetime
from typing import Any, Optional

# ai_report의 모델 폴백 체인 + 현재 대운 계산을 재사용한다
from ai_report import _gemini_generate, _openrouter_generate, _current_daeun

# 60갑자 산출용 (세운=올해 연주 간지 자동 계산)
_STEMS = "甲乙丙丁戊己庚辛壬癸"
_BRANCHES = "子丑寅卯辰巳午未申酉戌亥"


def _year_ganzhi(year: int) -> str:
    """연도 → 연주 간지(천간+지지). 예: 2026 → 丙午."""
    i = year - 4
    return _STEMS[i % 10] + _BRANCHES[i % 12]

# 천간(天干) 물상 → (오행한글, 영문 물상, 국문 물상)
STEM_IMAGERY = {
    "甲": ("목", "a towering ancient tree, a great timber tree reaching for the sky", "하늘로 솟은 아름드리 거목"),
    "乙": ("목", "delicate flowers, climbing vines and tender grass", "여린 화초와 넝쿨, 새싹"),
    "丙": ("화", "the blazing sun high in the sky", "하늘 높이 타오르는 태양"),
    "丁": ("화", "a warm lamplight, a candle flame and soft moonlight", "등불과 촛불, 달빛"),
    "戊": ("토", "a vast towering mountain and a great earthen embankment", "우뚝 솟은 큰 산과 제방"),
    "己": ("토", "soft fertile farmland and rich garden soil", "기름진 논밭과 정원의 옥토"),
    "庚": ("금", "rugged raw iron ore and a massive weathered boulder", "무쇠와 원석, 거대한 바위"),
    "辛": ("금", "a polished jewel, refined silver and glinting frost", "세공된 보석과 정제된 금속, 서릿발"),
    "壬": ("수", "a vast ocean and a great surging river", "광활한 바다와 큰 강"),
    "癸": ("수", "gentle rain, morning dew and drifting mist", "이슬비와 안개, 시냇물"),
}

# 지지(地支) 물상 → (오행한글, 영문 물상, 국문 물상, 계절)
BRANCH_IMAGERY = {
    "子": ("수", "deep still water beneath midwinter ice", "한겨울 얼음장 밑 깊은 물", "winter"),
    "丑": ("토", "frozen icy earth, a field locked in midwinter frost", "꽁꽁 언 땅(동토)", "winter"),
    "寅": ("목", "an early-spring forest awakening from the cold", "이른 봄 깨어나는 숲", "spring"),
    "卯": ("목", "lush spring grass and blossoming wildflowers", "봄의 무성한 화초와 새싹", "spring"),
    "辰": ("토", "moist fertile spring earth teeming with new life", "물 머금은 봄의 옥토", "spring"),
    "巳": ("화", "radiant early-summer sunlight and a glowing furnace", "초여름의 강한 햇빛과 화로", "summer"),
    "午": ("화", "the blazing midsummer noon sun at its peak", "한여름 정오의 뜨거운 태양", "summer"),
    "未": ("토", "dry parched midsummer earth, sun-baked soil", "한여름의 메마른 대지", "summer"),
    "申": ("금", "rugged autumn rock and raw metal ore", "가을의 바위와 원석", "autumn"),
    "酉": ("금", "a refined autumn jewel and crisp morning frost", "가을의 보석과 맑은 서리", "autumn"),
    "戌": ("토", "dry late-autumn earth and warm kiln embers", "늦가을 메마른 땅과 화로의 잔불", "autumn"),
    "亥": ("수", "a vast body of early-winter water, ocean and lake", "초겨울의 큰 물(바다·호수)", "winter"),
}

# 오행 → (영문 팔레트, 국문 팔레트)
ELEMENT_PALETTE = {
    "목": ("lush emerald green and teal", "짙은 초록과 청록"),
    "화": ("crimson red and warm gold", "붉은 진홍과 따뜻한 금빛"),
    "토": ("ochre, amber and earthy brown", "황토빛 호박색과 대지의 갈색"),
    "금": ("silver, ivory white and pale gold", "은빛과 상아빛, 옅은 금색"),
    "수": ("deep indigo and midnight blue", "깊은 쪽빛과 한밤의 푸름"),
}

# 오행 한글 → 영문명 (영문 프롬프트용)
ELEMENT_EN = {"목": "Wood", "화": "Fire", "토": "Earth", "금": "Metal", "수": "Water"}

# 계절 → (영문 분위기, 국문 분위기)
SEASON_MOOD = {
    "spring": ("a fresh awakening spring atmosphere", "생동하는 봄"),
    "summer": ("a vivid radiant summer atmosphere", "찬란한 여름"),
    "autumn": ("a serene golden autumn atmosphere", "고요한 가을"),
    "winter": ("a quiet frozen winter atmosphere", "적막한 겨울"),
}

# 거리·궁위에 따른 원근 배치 — (기둥키, 영문 위치, 국문 위치, 궁위 의미 영문, 궁위 의미 국문)
# 일간을 중심으로 가까운 순서: 일주 → 시주 → 월주 → 연주(가장 멈)
LAYOUT = [
    ("day", "in the bright foreground at the very center", "전경 한가운데", "the self and the spouse", "나 자신과 배우자"),
    ("hour", "close beside the center, slightly to the right", "바로 곁(오른쪽)", "the future and children", "미래와 자녀"),
    ("month", "in the midground to the left", "왼편 중경", "parents and life's environment", "부모와 삶의 환경"),
    ("year", "far away in the distant background", "가장 먼 원경", "ancestral roots and origin", "조상과 뿌리"),
]


def _pillar_imagery(pillars: dict, key: str) -> Optional[dict]:
    """한 기둥(천간+지지)의 물상·오행 정보를 추출한다."""
    p = pillars.get(key) or {}
    stem = (p.get("stem") or "").strip()
    branch = (p.get("branch") or "").strip()
    s = STEM_IMAGERY.get(stem)
    b = BRANCH_IMAGERY.get(branch)
    if not s and not b:
        return None
    return {
        "stem": stem,
        "stem_el": s[0] if s else "",
        "stem_img_en": s[1] if s else "",
        "stem_img_ko": s[2] if s else "",
        "branch": branch,
        "branch_el": b[0] if b else "",
        "branch_img_en": b[1] if b else "",
        "branch_img_ko": b[2] if b else "",
        "season": b[3] if b else "spring",
    }


def _build_sky(data: dict, scope: str, period_ganzhi: Optional[str], period_label: Optional[str]) -> Optional[dict]:
    """대운/세운을 '하늘에 흐르는 시기의 기운'으로 환산한다.
    명리: 원국=체질, 대운=기후(climate), 세운=날씨(weather)로 원국 위에 덮여 작용한다."""
    if scope not in ("daeun", "seyun"):
        return None

    gz, label = period_ganzhi, period_label
    if scope == "daeun":
        if not gz:
            cur = _current_daeun(data) or {}
            gz = cur.get("ganzhi")
            label = label or (f"{cur.get('age')}세 대운" if cur.get("age") else "현재 대운")
        scope_ko = "10년의 큰 흐름(대운)"
        scope_en = "the current 10-year great-luck cycle (大運), like the overarching climate of this era of life"
    else:  # seyun
        if not gz:
            year = datetime.date.today().year
            gz = _year_ganzhi(year)
            label = label or f"{year}년 세운"
        scope_ko = "올해의 흐름(세운)"
        scope_en = "this year's fortune (歲運), like the passing weather of the year"

    if not gz or len(gz) < 2:
        return None
    stem, branch = gz[0], gz[1]
    s = STEM_IMAGERY.get(stem)
    b = BRANCH_IMAGERY.get(branch)
    return {
        "scope": scope, "ganzhi": gz, "label": label or scope_ko,
        "scope_ko": scope_ko, "scope_en": scope_en,
        "stem": stem, "stem_el": s[0] if s else "", "stem_img_en": s[1] if s else "", "stem_img_ko": s[2] if s else "",
        "branch": branch, "branch_el": b[0] if b else "", "branch_img_en": b[1] if b else "", "branch_img_ko": b[2] if b else "",
    }


def _extract_symbols(data: dict, scope: str = "natal",
                     period_ganzhi: Optional[str] = None, period_label: Optional[str] = None) -> dict:
    """명식에서 물상·배치 요소를 결정론적으로 추출한다. scope로 대운/세운 기운을 더한다."""
    pillars = data.get("pillars") or {}
    unknown_time = bool(data.get("unknown_time"))

    # 일간 = '나'의 중심
    day = _pillar_imagery(pillars, "day") or {}
    day_stem = day.get("stem", "")
    core_el = day.get("stem_el", "")

    # 월지로 전체 계절 분위기를 잡는다 (없으면 일지)
    month_branch = ((pillars.get("month") or {}).get("branch") or "").strip()
    season = BRANCH_IMAGERY.get(month_branch, ("", "", "", ""))[3] if month_branch in BRANCH_IMAGERY else day.get("season", "spring")
    season_en, season_ko = SEASON_MOOD.get(season, ("a timeless mystical atmosphere", "신비로운"))

    # 오행 최강 기운 → 색채
    five = data.get("five_elements") or {}
    dom = max(five, key=lambda k: five.get(k, 0)) if five else "토"
    palette_en, palette_ko = ELEMENT_PALETTE.get(dom, ("radiant gold", "황금빛"))

    # 원근 배치 구성 (LAYOUT 순서대로)
    placements = []
    for key, pos_en, pos_ko, role_en, role_ko in LAYOUT:
        pi = _pillar_imagery(pillars, key)
        if not pi:
            continue
        faint = unknown_time and key == "hour"  # 시간 미상이면 시주는 흐릿하게
        placements.append({
            "key": key, "pos_en": pos_en, "pos_ko": pos_ko,
            "role_en": role_en, "role_ko": role_ko, "faint": faint, **pi,
        })

    sky = _build_sky(data, scope, period_ganzhi, period_label)

    return {
        "day_stem": day_stem,
        "core_el": core_el,
        "season_en": season_en,
        "season_ko": season_ko,
        "dom_element": dom,
        "palette_en": palette_en,
        "palette_ko": palette_ko,
        "placements": placements,
        "scope": scope,
        "sky": sky,
    }


def _sky_phrase_ko(sky: dict) -> str:
    bits = []
    if sky.get("stem_img_ko"):
        bits.append(f"{sky['stem_img_ko']}({sky['stem']}·{sky['stem_el']})")
    if sky.get("branch_img_ko"):
        bits.append(f"{sky['branch_img_ko']}({sky['branch']}·{sky['branch_el']})")
    return " · ".join(bits) if bits else "시기의 기운"


def _sky_phrase_en(sky: dict) -> str:
    bits = [b for b in (sky.get("stem_img_en"), sky.get("branch_img_en")) if b]
    return " together with ".join(bits) if bits else "the incoming seasonal energy"


def _pillar_phrase_ko(pl: dict) -> str:
    """한 기둥의 국문 물상 구절: '거목(甲·목)과 한겨울 물(子·수)'."""
    bits = []
    if pl.get("stem_img_ko"):
        bits.append(f"{pl['stem_img_ko']}({pl['stem']}·{pl['stem_el']})")
    if pl.get("branch_img_ko"):
        bits.append(f"{pl['branch_img_ko']}({pl['branch']}·{pl['branch_el']})")
    return " · ".join(bits) if bits else "기운"


def _pillar_phrase_en(pl: dict) -> str:
    """한 기둥의 영문 물상 구절."""
    bits = [b for b in (pl.get("stem_img_en"), pl.get("branch_img_en")) if b]
    return " together with ".join(bits) if bits else "elemental energy"


def _concept_ko(sym: dict, name: Optional[str]) -> str:
    """명식 기반 국문 컨셉 설명 (물상론 + 원근 배치, 결정론적·환각 없음)."""
    who = f"{name}님의 " if name else ""
    lines = [f"{who}동양 산수화풍 운명도 — 일간 {sym['day_stem']}({ELEMENT_EN.get(sym['core_el'], '')})을 '나'의 중심으로:"]
    for pl in sym["placements"]:
        faint = " (시간 미상이라 안개처럼 흐릿하게)" if pl["faint"] else ""
        lines.append(f"· {pl['pos_ko']} — {pl['role_ko']}: {_pillar_phrase_ko(pl)}{faint}")
    sky = sym.get("sky")
    if sky:
        lines.append(f"☁ 하늘에 흐르는 {sky['scope_ko']} — {sky['label']}({sky['ganzhi']}): {_sky_phrase_ko(sky)}, 원국 전체를 감싼다.")
    lines.append(f"화면 전체에 {sym['palette_ko']} 기운({sym['dom_element']})이 흐르는 {sym['season_ko']} 풍경.")
    return "\n".join(lines)


def _scene_lines_en(sym: dict) -> str:
    """영문 원근 배치 구절 모음."""
    out = []
    for pl in sym["placements"]:
        faint = ", rendered faint and half-veiled in mist (uncertain birth hour)" if pl["faint"] else ""
        phrase = f"{pl['pos_en']}, symbolizing {pl['role_en']}: {_pillar_phrase_en(pl)}{faint}"
        out.append(phrase[0].upper() + phrase[1:] if phrase else phrase)
    return ". ".join(out)


def _base_prompt_en(sym: dict) -> str:
    """결정론적 영문 이미지 프롬프트 (물상론 + 원근 배치, AI 폴백용 기본형)."""
    sky = sym.get("sky")
    sky_line = ""
    if sky:
        sky_line = (
            f"Across the sky above, {sky['scope_en']} flows over the whole scene as {sky['label']} ({sky['ganzhi']}): "
            f"{_sky_phrase_en(sky)}, tinting the entire landscape with its energy. "
        )
    return (
        f"A symbolic oriental landscape painting visualizing a person's destiny from Korean Saju (Four Pillars) "
        f"astrology, composed in the spirit of 物象 elemental imagery, with deliberate spatial depth. "
        f"The day-master ({ELEMENT_EN.get(sym['core_el'], 'Spirit')} element) anchors the self at the center. "
        f"{_scene_lines_en(sym)}. "
        f"{sky_line}"
        f"Overall mood: {sym['season_en']}. "
        f"Dominant color palette of {sym['palette_en']}, glowing with the energy of the {ELEMENT_EN.get(sym['dom_element'], 'Gold')} element. "
        f"Ink-and-gold landscape style, layered foreground-to-background depth, soft volumetric light, "
        f"cinematic composition, highly detailed, dreamlike and serene, 8k, no text, no letters, no watermark."
    )


IMAGE_SYSTEM = (
    "You are a master art director who turns Korean Saju (four-pillar) ELEMENTAL IMAGERY (物象) into a single, "
    "vivid image-generation prompt for tools like DALL-E or Midjourney. "
    "Write ONE flowing English paragraph (90-150 words). "
    "Treat every anchor as a NATURAL ELEMENT/LANDSCAPE motif (a tree, the sun, frozen earth, an ocean, etc.) — "
    "NEVER depict zodiac animals. "
    "CRUCIAL: respect the given SPATIAL COMPOSITION exactly — what is in the foreground/center, what is close beside it, "
    "what is in the midground, and what is far in the background. This depth ordering carries meaning and must be preserved. "
    "Keep ALL anchors: the central self, each placed pillar, the season mood, and the color palette. "
    "Compose them into one cohesive oriental landscape painting, cinematic and ethereal. "
    "End the prompt with: no text, no letters, no watermark. "
    "Output ONLY the prompt paragraph — no preamble, no quotes, no markdown."
)


def _enrich_prompt_en(sym: dict) -> str:
    """AI로 영문 프롬프트를 윤색한다. 실패 시 결정론적 기본형 반환."""
    anchor_lines = [f"- Center (the self, {ELEMENT_EN.get(sym['core_el'], 'Spirit')} day-master)."]
    for pl in sym["placements"]:
        faint = " [keep faint/misty — uncertain birth hour]" if pl["faint"] else ""
        anchor_lines.append(f"- {pl['pos_en']} = {pl['role_en']}: {_pillar_phrase_en(pl)}{faint}")
    sky = sym.get("sky")
    if sky:
        anchor_lines.append(
            f"- ACROSS THE SKY ABOVE (overlaying the whole scene) = {sky['scope_en']}, {sky['label']} ({sky['ganzhi']}): "
            f"{_sky_phrase_en(sky)}"
        )
    anchors = (
        "Build one cohesive oriental landscape, preserving this exact spatial depth ordering "
        "(these are natural elements, not animals):\n"
        + "\n".join(anchor_lines)
        + f"\n- Season mood: {sym['season_en']}\n"
        + f"- Color palette: {sym['palette_en']} ({ELEMENT_EN.get(sym['dom_element'], 'Gold')}-element dominant)"
    )
    try:
        text = _gemini_generate(anchors, IMAGE_SYSTEM)
        if not text:
            text = _openrouter_generate(anchors, IMAGE_SYSTEM)
        if text:
            return text.strip().strip('"').strip("`").strip()
    except Exception as e:
        print(f"image prompt enrich 실패: {e}")
    return _base_prompt_en(sym)


def generate_image_prompt(data: dict, scope: str = "natal",
                          period_ganzhi: Optional[str] = None, period_label: Optional[str] = None) -> dict:
    """명식 → {concept_ko, prompt_en, scope, period_label, ganzhi} 반환.
    scope: 'natal'(원국) | 'daeun'(명식+대운) | 'seyun'(명식+세운)."""
    sym = _extract_symbols(data, scope, period_ganzhi, period_label)
    name = data.get("name")
    sky = sym.get("sky") or {}
    return {
        "concept_ko": _concept_ko(sym, name),
        "prompt_en": _enrich_prompt_en(sym),
        "scope": sym.get("scope", "natal"),
        "period_label": sky.get("label"),
        "ganzhi": sky.get("ganzhi"),
    }
