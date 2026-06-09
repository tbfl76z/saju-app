"""
명식(천간지지) → 이미지 생성 프롬프트 변환 모듈 (물상론 기반)
- 일간(日干)을 중심 물상으로 삼고, 사주 지지(地支)의 물상을 주변 자연 풍경으로,
  월지(月支)의 계절 기운으로 전체 분위기를, 오행 분포의 최강 기운을 색채로 환산한다.
- '띠 동물'이 아니라 명리 물상론(物象論)의 자연 물상으로 표현한다.
  (예: 甲=하늘로 솟은 거목, 丑=꽁꽁 언 땅, 午=한여름 정오의 태양)
- 컨셉(국문)은 명식에서 결정론적으로 산출(환각 방지)하고,
  영문 이미지 프롬프트만 AI로 윤색한다. AI 실패 시 결정론적 프롬프트로 폴백한다.
"""
from typing import Any, Optional

# ai_report의 모델 폴백 체인을 재사용한다
from ai_report import _gemini_generate, _openrouter_generate

# 천간(天干) 물상 → (오행, 영문 물상, 국문 물상)
STEM_IMAGERY = {
    "甲": ("Wood", "a towering ancient tree, a great timber tree reaching for the sky", "하늘로 솟은 아름드리 거목(대들보 재목)"),
    "乙": ("Wood", "delicate flowers, climbing vines and tender grass", "여린 화초와 넝쿨, 새싹"),
    "丙": ("Fire", "the blazing sun high in the sky", "하늘 높이 타오르는 태양"),
    "丁": ("Fire", "a warm lamplight, a candle flame and soft moonlight", "등불과 촛불, 달빛"),
    "戊": ("Earth", "a vast towering mountain and a great earthen embankment", "우뚝 솟은 큰 산과 제방"),
    "己": ("Earth", "soft fertile farmland and rich garden soil", "기름진 논밭과 정원의 옥토"),
    "庚": ("Metal", "rugged raw iron ore and a massive weathered boulder", "무쇠와 원석, 거대한 바위"),
    "辛": ("Metal", "a polished jewel, refined silver and glinting frost", "세공된 보석과 정제된 금속, 서릿발"),
    "壬": ("Water", "a vast ocean and a great surging river", "광활한 바다와 큰 강"),
    "癸": ("Water", "gentle rain, morning dew and drifting mist", "이슬비와 안개, 시냇물"),
}

# 지지(地支) 물상 → (영문 물상, 국문 물상, 계절)
BRANCH_IMAGERY = {
    "子": ("deep still water beneath midwinter ice", "한겨울 얼음장 밑 깊은 물", "winter"),
    "丑": ("frozen icy earth, a field locked in midwinter frost", "꽁꽁 언 땅(동토)", "winter"),
    "寅": ("an early-spring forest awakening from the cold", "이른 봄 깨어나는 숲", "spring"),
    "卯": ("lush spring grass and blossoming wildflowers", "봄의 무성한 화초와 새싹", "spring"),
    "辰": ("moist fertile spring earth teeming with new life", "물 머금은 봄의 옥토", "spring"),
    "巳": ("radiant early-summer sunlight and a glowing furnace", "초여름의 강한 햇빛과 화로", "summer"),
    "午": ("the blazing midsummer noon sun at its peak", "한여름 정오의 뜨거운 태양", "summer"),
    "未": ("dry parched midsummer earth, sun-baked soil", "한여름의 메마른 대지", "summer"),
    "申": ("rugged autumn rock and raw metal ore", "가을의 바위와 원석", "autumn"),
    "酉": ("a refined autumn jewel and crisp morning frost", "가을의 보석과 맑은 서리", "autumn"),
    "戌": ("dry late-autumn earth and warm kiln embers", "늦가을 메마른 땅과 화로의 잔불", "autumn"),
    "亥": ("a vast body of early-winter water, ocean and lake", "초겨울의 큰 물(바다·호수)", "winter"),
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


def _extract_symbols(data: dict) -> dict:
    """명식에서 물상 요소를 결정론적으로 추출한다."""
    pillars = data.get("pillars") or {}
    day = pillars.get("day") or {}
    day_stem = (day.get("stem") or "").strip()

    core_el, core_img_en, core_img_ko = STEM_IMAGERY.get(
        day_stem, ("Spirit", "a luminous mysterious form of light", "신비로운 빛의 형상")
    )

    # 네 기둥(연·월·일·시)의 지지 물상 수집 (중복 제거, 순서 보존)
    scene_en: list[str] = []
    scene_ko: list[str] = []
    for k in ("year", "month", "day", "hour"):
        branch = ((pillars.get(k) or {}).get("branch") or "").strip()
        if branch in BRANCH_IMAGERY:
            en, ko, _ = BRANCH_IMAGERY[branch]
            if ko not in scene_ko:
                scene_en.append(en)
                scene_ko.append(ko)

    # 월지(月支)로 전체 계절 분위기를 잡는다 (없으면 일지로 대체)
    month_branch = ((pillars.get("month") or {}).get("branch") or "").strip()
    if month_branch not in BRANCH_IMAGERY:
        month_branch = ((pillars.get("day") or {}).get("branch") or "").strip()
    season = BRANCH_IMAGERY.get(month_branch, ("", "", "spring"))[2]
    season_en, season_ko = SEASON_MOOD.get(season, ("a timeless mystical atmosphere", "신비로운"))

    # 오행 최강 기운 → 색채
    five = data.get("five_elements") or {}
    dom = max(five, key=lambda k: five.get(k, 0)) if five else "토"
    palette_en, palette_ko = ELEMENT_PALETTE.get(dom, ("radiant gold", "황금빛"))

    return {
        "day_stem": day_stem,
        "core_el": core_el,
        "core_img_en": core_img_en,
        "core_img_ko": core_img_ko,
        "scene_en": scene_en,
        "scene_ko": scene_ko,
        "season_en": season_en,
        "season_ko": season_ko,
        "dom_element": dom,
        "palette_en": palette_en,
        "palette_ko": palette_ko,
    }


def _concept_ko(sym: dict, name: Optional[str]) -> str:
    """명식 기반 국문 컨셉 설명 (물상론, 결정론적·환각 없음)."""
    who = f"{name}님의 " if name else ""
    scene = ", ".join(sym["scene_ko"]) or "사방의 자연"
    return (
        f"{who}일간 {sym['day_stem']}({sym['core_el']}) — "
        f"중심에는 {sym['core_img_ko']}, 그 둘레로 {scene}이(가) 어우러진 {sym['season_ko']} 풍경. "
        f"화면 전체에 {sym['palette_ko']} 기운({sym['dom_element']})이 흐르는 동양 산수화풍의 그림."
    )


def _base_prompt_en(sym: dict) -> str:
    """결정론적 영문 이미지 프롬프트 (물상론, AI 폴백용 기본형)."""
    scene = "; ".join(sym["scene_en"]) or "surrounding wild nature"
    return (
        f"A symbolic mystical landscape visualizing a person's destiny from Korean Saju (Four Pillars) astrology, "
        f"painted in the spirit of 物象 elemental imagery. "
        f"Centerpiece: {sym['core_img_en']}, embodying the {sym['core_el']} essence of the day-master. "
        f"The surrounding scenery weaves together natural elemental imagery — {scene}. "
        f"Set in {sym['season_en']}. "
        f"Dominant color palette of {sym['palette_en']}, glowing with the energy of the {ELEMENT_EN.get(sym['dom_element'], 'Gold')} element. "
        f"Oriental ink-and-gold landscape painting style, soft volumetric light, cinematic composition, "
        f"highly detailed, dreamlike and serene, 8k, no text, no letters, no watermark."
    )


IMAGE_SYSTEM = (
    "You are a master art director who turns Korean Saju (four-pillar) ELEMENTAL IMAGERY (物象) into a single, "
    "vivid image-generation prompt for tools like DALL-E or Midjourney. "
    "Write ONE flowing English paragraph (60-110 words). "
    "Treat every anchor as a NATURAL ELEMENT/LANDSCAPE motif (a tree, the sun, frozen earth, an ocean, etc.) — "
    "NEVER depict zodiac animals. "
    "Keep ALL the given anchors: the central subject, the surrounding scenery elements, the season, and the color palette. "
    "Compose them into a cohesive oriental landscape painting, cinematic and ethereal. "
    "End the prompt with: no text, no letters, no watermark. "
    "Output ONLY the prompt paragraph — no preamble, no quotes, no markdown."
)


def _enrich_prompt_en(sym: dict) -> str:
    """AI로 영문 프롬프트를 윤색한다. 실패 시 결정론적 기본형 반환."""
    scene = "; ".join(sym["scene_en"]) or "surrounding wild nature"
    anchors = (
        f"- Central subject (day-master, {sym['core_el']}): {sym['core_img_en']}\n"
        f"- Surrounding scenery (elemental imagery of the branches): {scene}\n"
        f"- Season / overall mood: {sym['season_en']}\n"
        f"- Color palette: {sym['palette_en']} ({ELEMENT_EN.get(sym['dom_element'], 'Gold')}-element dominant)\n"
        "Craft the final landscape image prompt keeping every anchor above. These are natural elements, not animals."
    )
    try:
        text = _gemini_generate(anchors, IMAGE_SYSTEM)
        if not text:
            text = _openrouter_generate(anchors, IMAGE_SYSTEM)
        if text:
            # 따옴표/마크다운 잔여 정리
            return text.strip().strip('"').strip("`").strip()
    except Exception as e:
        print(f"image prompt enrich 실패: {e}")
    return _base_prompt_en(sym)


def generate_image_prompt(data: dict) -> dict:
    """명식 → {concept_ko, prompt_en} 반환. ChatGPT/DALL-E에 바로 넣을 수 있다."""
    sym = _extract_symbols(data)
    name = data.get("name")
    return {
        "concept_ko": _concept_ko(sym, name),
        "prompt_en": _enrich_prompt_en(sym),
    }
