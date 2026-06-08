"""
AI 사주 리포트 생성 모듈
- 지식베이스 로드/필터, 분석 타입별 헤더·프롬프트 빌더, Gemini 모델 폴백 체인을 담당한다.
- main.py의 /analyze 로직을 분리하여 동기 생성(generate_report)과 스트리밍(stream_report)을 모두 제공한다.
"""
import os
import re
import json
import datetime
import urllib.request
from typing import Any, Optional, Iterator

import google.generativeai as genai
from saju_utils import get_ilun_data, get_seyun_data

# 모델 우선순위 (최신 → 구형 폴백). list_models 검증으로 미존재 모델은 자동 제외된다.
# 각 모델은 무료등급에서 별도 일일 한도(RPD)를 가지므로, 체인이 길수록 하루 가용 횟수가 늘어난다.
PRIORITY_MODELS = [
    'models/gemini-3.5-flash',
    'models/gemini-2.5-flash',
    'models/gemini-2.0-flash',
    'models/gemini-1.5-flash',
    'models/gemini-pro',
]

# 지식베이스 컨텍스트 한도(글자수). 무료등급 TPM(분당 토큰)·비용·속도를 고려해 축소.
# 더 깊은 풀이가 필요하면 환경변수로 키울 수 있다.
KNOWLEDGE_CONTEXT_LIMIT = int(os.getenv("KNOWLEDGE_CONTEXT_LIMIT", "50000"))
KNOWLEDGE_FALLBACK_LIMIT = int(os.getenv("KNOWLEDGE_FALLBACK_LIMIT", "20000"))

# OpenRouter 폴백: Gemini 무료 한도 소진 시 OpenAI 호환 API로 자동 전환.
# OPENROUTER_API_KEY 환경변수가 있으면 활성화. 모델은 무료(:free) 위주로 환경변수로 조절 가능.
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODELS = [
    m.strip() for m in os.getenv(
        "OPENROUTER_MODELS",
        "deepseek/deepseek-chat-v3-0324:free,meta-llama/llama-3.3-70b-instruct:free,google/gemini-2.0-flash-exp:free",
    ).split(",") if m.strip()
]

# 분석 타입별 리포트 헤더 (단일 출처)
HEADERS = {
    "total": "📜 전체 사주 보고서 - 삶의 총체적 흐름",
    "original": "🌿 사주 원국 정밀 해석 - 타고난 천명과 자아",
    "daeun": "🌊 대운 평생 운세 분석 - 거시적 환경의 변화",
    "seyun": "📈 흐르는 세운 분석 - 올해의 가능성과 기회",
    "wolun": "🗓️ 세밀한 월운 가이드 - 이달의 지혜로운 처세",
    "today": "🌅 오늘의 운세 - 하루의 흐름과 처세",
    "compatibility": "💞 인연의 궁합 - 두 사람의 기운 조화",
    "newyear": "🎍 신년 종합 운세 - 한 해의 큰 흐름",
}

# 원국/전체는 매뉴얼 우선, 그 외(시간 운세·오늘·궁합·신년)는 sample_knowledge 우선
MANUAL_TYPES = {"total", "original"}

# 올해(세운) 분야별 운세 — 같은 세운 데이터에 '이 분야에 집중' 지시를 주입한다
CATEGORY_FOCUS = {
    "love": "이 해의 '연애·인연운'에 집중하세요. 세운 천간/지지가 원국의 재성(정재·편재)·관성(정관·편관)과 맺는 관계, 도화·홍염살, 일지의 합·충을 근거로 만남·관계의 흐름을 풀이하세요.",
    "wealth": "이 해의 '금전·재물운'에 집중하세요. 세운과 원국 재성의 왕쇠, 식상생재 구조, 비겁의 재성 극(劫財) 여부를 근거로 수입·지출·투자의 흐름을 풀이하세요.",
    "career": "이 해의 '진로·직업운'에 집중하세요. 관성(직장·조직)·식상(사업·표현)·인성(학업·자격)의 동향과 세운의 작용을 근거로 이직·승진·시험·창업의 흐름을 풀이하세요.",
    "health": "이 해의 '건강운'에 집중하세요. 오행의 과다·고립, 일간의 신강/신약, 세운으로 인한 충·형·합의 자극을 근거로 주의할 신체 영역과 양생법을 풀이하세요.",
}
CATEGORY_HEADERS = {
    "love": "💕 올해의 연애운",
    "wealth": "💰 올해의 금전운",
    "career": "🧭 올해의 진로운",
    "health": "🌿 올해의 건강운",
}

# 분석 타입별 '범위 지시' — 풀이마다 자기 주제에만 집중하고 일반론 반복을 막는다(전체/대운/올해 중복 방지)
SCOPE_FOCUS = {
    "total": "이 리포트는 '타고난 사주 원국 전체'를 다룹니다. 성격·기질·강약점·인생 전반의 큰 그림을 충분히 깊게 풀이하세요(이것이 기준 리포트입니다).",
    "original": "이 리포트는 '사주 원국(타고난 자아)'을 다룹니다. 성격·기질·재능 분석을 충분히 깊게 풀이하세요.",
    "daeun": "이 리포트는 '현재 대운(10년 시기)'에 초점을 둡니다. 타고난 성격 총론은 핵심만 간단히 짚고, 이 대운 10년의 환경 변화·기회·과제·시기 흐름을 네 섹션 모두 풍부하고 구체적으로 풀이하세요.",
    "seyun": "이 리포트는 해당 '세운(그 해)'에 초점을 둡니다. 원국·대운 총론은 핵심만 간단히 하고, 그 해의 구체적 흐름·사건·시기를 네 섹션 모두 풍부하게 풀이하세요.",
    "wolun": "이 리포트는 '이번 달(월운)'에 초점을 둡니다. 상위 운(원국·세운) 총론은 간단히, 이 달의 흐름·처세를 네 섹션 모두 구체적으로 풀이하세요.",
    "today": "이 리포트는 '오늘 하루(일진)'에 초점을 둡니다. 원국·대운 총론은 간단히, 오늘의 기운·할 일·주의점을 네 섹션 모두 구체적으로 풀이하세요.",
    "newyear": "이 리포트는 '올해 한 해(세운)'에 초점을 둡니다. 타고난 성격 총론은 핵심만 간단히 언급하고, 올해의 구체적 흐름·시기별 변화·올해 해야 할 일을 네 섹션 모두 풍부하고 구체적으로 풀이하세요.",
    "compatibility": "이 리포트는 '두 사람의 궁합'에 초점을 둡니다. 두 명식의 상호작용·관계 역학을 네 섹션 모두 충분히 풀이하세요.",
}

SYSTEM_INSTRUCTION = (
    "당신은 사주 명리학의 깊이 있는 통찰을 전하는 인격 고매한 대가입니다.\n"
    "지식 참조 원칙:\n"
    "1. 제공된 전문 지식을 자연스럽게 녹여 깊이 있는 해석의 근거로 삼으세요.\n"
    "2. 십성, 12운성, 신살 등 개별 항목은 그 의미를 풀어 설명하되, 자연스러운 상담 문장으로 녹여내세요.\n"
    "3. 대운/세운/월운/오늘/신년 분석 시에는 제공된 시간 운세 기준 정보를 토대로 해석의 일관성을 유지하세요.\n"
    "4. [매우 중요] 참고 자료의 파일명·출처·'.pdf'·'.md'·'SOURCE' 같은 표현이나 '~자료에 따르면', '~매뉴얼에 의하면' 같은 출처 언급을 절대 하지 마세요. 지식은 당신의 통찰인 것처럼 자연스럽게 전하세요.\n\n"
    "출력 형식 (매우 중요):\n"
    "- 반드시 다음 네 개의 마크다운 헤딩만 사용하여 구조화하세요: '## 총평', '## 정밀 분석', '## 개운법', '## 대가의 한마디'.\n"
    "- 위 네 개의 '## 헤딩' 외에 다른 헤딩(#, ###)이나 기울임(*), 코드블록(`)은 사용하지 마세요.\n"
    "- 본문에서 핵심 키워드·꼭 기억할 조언·중요한 시기는 **굵게**(별표 두 개로 감싸기)로 강조하세요. 한 섹션에 1~3곳 정도만, 남발하지 마세요.\n"
    "- 각 섹션 본문은 정중한 평서문 위주의 격식체로, 따뜻하고 지혜로운 상담 문체로 작성하세요.\n"
    "- 문학적 비유를 곁들이되 근거 있는 분석을 유지하세요."
)

# 쉬운 설명 모드: 사주를 모르는 사람을 위해 용어를 거의 쓰지 않고 이야기처럼 풀이
SYSTEM_INSTRUCTION_EASY = (
    "당신은 사주를 전혀 모르는 사람에게도 따뜻하게 이야기를 들려주는 다정한 상담가입니다.\n"
    "작성 원칙:\n"
    "1. 십성·십이운성·신살·오행·천간·지지 같은 전문 용어와 한자를 가능한 한 쓰지 마세요. 꼭 필요하면 '마음속 에너지', '관계의 기운'처럼 쉬운 말로 바꿔 설명하세요.\n"
    "2. 점치는 듯한 단정 대신, 친구에게 이야기를 들려주듯 부드럽고 구체적인 일상 언어로 풀어 주세요.\n"
    "3. 비유와 짧은 이야기를 곁들여 읽는 사람이 자기 삶에 바로 대입할 수 있게 하세요.\n\n"
    "출력 형식 (매우 중요):\n"
    "- 반드시 다음 네 개의 마크다운 헤딩만 사용하세요: '## 한눈에 보기', '## 요즘 나의 흐름', '## 이렇게 해보세요', '## 따뜻한 한마디'.\n"
    "- 위 네 개의 '## 헤딩' 외에 다른 헤딩(#, ###)이나 기울임(*), 코드블록(`)은 쓰지 마세요.\n"
    "- 꼭 기억하면 좋은 핵심 한두 마디는 **굵게**(별표 두 개로 감싸기)로 강조하세요. 한 섹션에 1~2곳만.\n"
    "- 어려운 한자어·전문 용어 없이, 쉽고 다정한 문장으로 작성하세요."
)

# 지식베이스 캐시 (서버 부팅 후 1회 로드)
_knowledge_cache: Optional[str] = None
# 검증된 사용 가능 모델 캐시
_available_models_cache: Optional[list] = None


def _load_knowledge_raw() -> str:
    """knowledge_base.txt 원본을 1회 로드하여 캐시한다."""
    global _knowledge_cache
    if _knowledge_cache is not None:
        return _knowledge_cache
    knowledge_path = os.path.join(os.path.dirname(__file__), 'knowledge_base.txt')
    if os.path.exists(knowledge_path):
        try:
            with open(knowledge_path, 'r', encoding='utf-8') as f:
                _knowledge_cache = f.read()
        except Exception as e:
            print(f"Knowledge load error: {e}")
            _knowledge_cache = ""
    else:
        _knowledge_cache = ""
    return _knowledge_cache


def build_knowledge_context(analysis_type: str) -> str:
    """분석 타입에 맞춰 지식베이스 소스를 우선순위 조합한다."""
    full_content = _load_knowledge_raw()
    if not full_content:
        return ""

    parts = full_content.split("### SOURCE: ")

    def is_reference_source(part: str) -> bool:
        return any(ext in part.lower() for ext in [".pdf", ".md", ".txt"])

    def body(part: str) -> str:
        # 각 파트 첫 줄은 파일경로이므로 제거(파일명이 해석에 노출되지 않게)
        return part.split("\n", 1)[1] if "\n" in part else part

    manual_source = "명리학 핵심 이론과 실전 분석 매뉴얼"
    learning_parts = [body(p) for p in parts if is_reference_source(p) and "학습자료/" in p]
    relevant_parts: list[str] = []

    if analysis_type in MANUAL_TYPES:
        # 핵심 매뉴얼을 최상단(대원칙)에 배치
        manual_part = next((p for p in parts if manual_source in p), "")
        if manual_part:
            relevant_parts.append(f"### [분석 대원칙 및 방향성 가이드]\n{body(manual_part)}")
        relevant_parts.extend(learning_parts)
        for p in parts:
            if is_reference_source(p) and manual_source not in p and "학습자료/" not in p:
                relevant_parts.append(body(p))
    else:
        # 대운/세운/월운/오늘/궁합/신년: sample_knowledge 우선
        sample_part = next((p for p in parts if "sample_knowledge.txt" in p), "")
        if sample_part:
            relevant_parts.append(f"### [시간 운세 분석 핵심 기준]\n{body(sample_part)}")
        relevant_parts.extend(learning_parts)
        for p in parts:
            if is_reference_source(p) and "sample_knowledge.txt" not in p and "학습자료/" not in p:
                relevant_parts.append(body(p))

    result = "\n".join(relevant_parts) if relevant_parts else full_content[:KNOWLEDGE_FALLBACK_LIMIT]
    result = _scrub_sources(result)
    return result[:KNOWLEDGE_CONTEXT_LIMIT]


def _scrub_sources(text: str) -> str:
    """지식 컨텍스트에서 파일명·출처 흔적 제거(해석에 노출 방지)."""
    if not text:
        return text
    # 따옴표로 인용된 파일명 → 중립어
    text = re.sub(r"['\"‘’][^'\"‘’\n]{0,60}\.(?:pdf|md|txt)['\"‘’]", "이 이론", text, flags=re.IGNORECASE)
    # 남은 확장자 토큰 제거 (11.지지심화.pdf → 11.지지심화)
    text = re.sub(r"\.(?:pdf|md|txt)\b", "", text, flags=re.IGNORECASE)
    # SOURCE 토큰 잔재 제거
    text = re.sub(r"#{0,3}\s*SOURCE\s*:?", "", text, flags=re.IGNORECASE)
    return text


def sanitize(text: Any) -> str:
    """프롬프트 인젝션 방어: 사용자 입력에서 헤딩기호/백틱/SOURCE 토큰 제거."""
    if not text:
        return ""
    s = str(text)
    s = s.replace("`", "").replace("#", "").replace("*", "")
    s = re.sub(r"(?i)###?\s*SOURCE", "", s)
    return s.strip()[:1000]


def _pillar(pillars: dict, key: str) -> str:
    """pillars[key]['pillar'] 안전 추출."""
    try:
        return pillars.get(key, {}).get("pillar", "-")
    except Exception:
        return "-"


def _current_daeun(data: dict) -> Optional[dict]:
    """생년+현재연도로 현재 나이에 해당하는 대운을 고른다(없으면 첫 대운)."""
    fortune = data.get("fortune") or {}
    lst = fortune.get("list") or []
    if not lst:
        return None
    try:
        birth_year = int(str(data.get("birth_date", "")).split("-")[0])
        age = datetime.date.today().year - birth_year + 1
    except Exception:
        return lst[0]
    for x in lst:
        a = x.get("age", 0)
        if a <= age < a + 10:
            return x
    # 범위를 벗어나면 가장 가까운 쪽
    return lst[-1] if age >= lst[-1].get("age", 0) else lst[0]


def query_date(req: Any) -> str:
    """오늘의 운세 기준 날짜를 반환한다(target_date 미지정 시 서버 오늘)."""
    td = getattr(req, "target_date", None)
    return td or datetime.date.today().isoformat()


def build_query(req: Any) -> str:
    """프론트가 빈 query를 보내도 분석 타입+컨텍스트로 질의를 자동 생성한다."""
    user_query = sanitize(getattr(req, "query", "") or "")
    if user_query:
        return user_query
    atype = getattr(req, "analysis_type", "total") or "total"
    target_year = getattr(req, "target_year", None)
    defaults = {
        "total": "제공된 지식 베이스의 원칙과 상세 이론을 조화롭게 엮어, 한 사람의 인생을 깊이 있게 통찰하는 상담 리포트를 작성해 주세요.",
        "original": "타고난 사주 원국의 본질과 자아, 강점과 약점을 정밀하게 풀이해 주세요.",
        "daeun": "현재 대운의 거시적 흐름과 그 시기를 지혜롭게 보내는 방법을 안내해 주세요.",
        "seyun": "해당 세운의 가능성과 기회, 주의할 점을 분석해 주세요.",
        "wolun": "이 달의 흐름과 지혜로운 처세를 안내해 주세요.",
        "today": "오늘 하루의 기운과 흐름, 마음가짐과 처세를 따뜻하게 조언해 주세요.",
        "compatibility": "두 사람의 명식이 빚어내는 기운의 조화와 갈등, 관계를 가꾸는 지혜를 풀이해 주세요.",
        "newyear": f"{target_year if target_year else '다가오는 해'}의 큰 흐름과 분야별 운세, 한 해를 여는 마음가짐을 종합적으로 안내해 주세요.",
    }
    return defaults.get(atype, defaults["total"])


def _compat_summary(partner: Optional[dict]) -> str:
    """궁합 분석용 상대 명식 요약."""
    if not partner or "pillars" not in partner:
        return ""
    p = partner["pillars"]
    name = sanitize(partner.get("name", "상대방"))
    return (
        f"\n        [상대방({name}) 명식]\n"
        f"        - 명식: 년({_pillar(p,'year')}), 월({_pillar(p,'month')}), 일({_pillar(p,'day')}), 시({_pillar(p,'hour')})\n"
        f"        - 오행 분포: {partner.get('five_elements', {})}\n"
        f"        - 상호 관계 요약: {partner.get('relations', '특이사항 없음')}"
    )


def build_prompt(req: Any) -> str:
    """analysis_type에 맞춰 최종 프롬프트를 구성한다."""
    data = req.saju_data
    pillars = data.get("pillars", {})
    atype = getattr(req, "analysis_type", "total") or "total"
    category = getattr(req, "category", None)
    # 분야별 운세(newyear+category)는 전용 헤더로 톤을 분야에 수렴
    if atype == "newyear" and category in CATEGORY_HEADERS:
        report_header = CATEGORY_HEADERS[category]
    else:
        report_header = HEADERS.get(atype, HEADERS["total"])
    knowledge_context = build_knowledge_context(atype)
    query = build_query(req)
    name = sanitize(data.get("name", "사용자")) or "사용자"

    fortune_line = ""
    cur_daeun = _current_daeun(data)
    if cur_daeun:
        b = cur_daeun.get("jiji_ten_god") or cur_daeun.get("branch_ten_god") or "-"
        fortune_line = (
            f"- 현재 대운: {cur_daeun.get('age')}세 대운 / {cur_daeun.get('ganzhi')} "
            f"(십성 {cur_daeun.get('stem_ten_god', '-')}·{b}, 십이운성 {cur_daeun.get('twelve_growth', '-')})"
        )

    # 태어난 시간 미상이면 시주에 의존한 단정을 피하도록 명시
    unknown_time_note = ""
    if data.get("unknown_time"):
        unknown_time_note = "\n        - ※ 태어난 시간 미상: 시주(時柱)는 불확실하므로 시주에 근거한 단정적 해석은 피하고, 년·월·일주 중심으로 풀이하세요."

    partner_block = ""
    if atype == "compatibility":
        partner_block = _compat_summary(getattr(req, "partner_saju_data", None))
        if not partner_block:
            # 상대 명식이 없으면 AI가 상대를 지어내지 않도록 명시
            partner_block = "\n        [주의] 상대방 명식 데이터가 제공되지 않았습니다. 상대방의 사주를 임의로 지어내지 말고, 궁합을 보려면 상대 정보가 필요하다고 안내하세요."

    # 시점 운세(오늘/신년)는 해당 시점의 간지를 직접 산출해 프롬프트에 주입한다
    time_block = ""
    try:
        if atype in ("today", "newyear") and pillars:
            day_gan = pillars.get("day", {}).get("stem")
            year_branch = pillars.get("year", {}).get("branch")
            day_branch = pillars.get("day", {}).get("branch")
            # newyear인데 연도 미지정이면 올해로 기본(세운 간지 누락→환각 방지)
            target_year = getattr(req, "target_year", None) or datetime.date.today().year
            if atype == "today":
                tinfo = get_ilun_data(day_gan, year_branch, query_date(req), pillars=pillars, day_branch=day_branch)
                if tinfo:
                    time_block = (
                        f"\n        [오늘({tinfo.get('date')})의 일진]\n"
                        f"        - 일진 간지: {tinfo.get('ganzhi')} / 십성: {tinfo.get('stem_ten_god')}·{tinfo.get('branch_ten_god')} / 십이운성: {tinfo.get('twelve_growth')} / 신살: {tinfo.get('sinsal')} / 원국과의 관계: {tinfo.get('relations')}"
                    )
            elif atype == "newyear" and target_year:
                yinfo = get_seyun_data(day_gan, year_branch, int(target_year), pillars=pillars, day_branch=day_branch)
                if yinfo:
                    time_block = (
                        f"\n        [{target_year}년 세운]\n"
                        f"        - 세운 간지: {yinfo.get('ganzhi')} / 십성: {yinfo.get('stem_ten_god')}·{yinfo.get('branch_ten_god')} / 십이운성: {yinfo.get('twelve_growth')} / 신살: {yinfo.get('sinsal')} / 원국과의 관계: {yinfo.get('relations')}"
                    )
    except Exception as e:
        print(f"time_block 산출 오류: {e}")

    # 대운/세운/월운: 프론트가 선택한 시기의 실제 간지/라벨을 명시(없으면 query만 사용 → 환각 방지)
    period_ganzhi = getattr(req, "period_ganzhi", None)
    period_label = getattr(req, "period_label", None)
    if not time_block and period_ganzhi and atype in ("daeun", "seyun", "wolun"):
        label = period_label or {"daeun": "대운", "seyun": "세운", "wolun": "월운"}.get(atype, "해당 시기")
        time_block = (
            f"\n        [분석 대상 시기]\n"
            f"        - {label}: 간지 {period_ganzhi}\n"
            f"        - 반드시 이 시기({label}, {period_ganzhi})에 대해서만 풀이하고, 다른 달/해/시기를 임의로 지어내지 마세요."
        )

    # 올해 분야별 운세: 집중 분석 지시 주입
    category_block = ""
    if atype == "newyear" and category in CATEGORY_FOCUS:
        category_block = f"\n        [집중 분석 지시]\n        - {CATEGORY_FOCUS[category]}"

    scope_focus = SCOPE_FOCUS.get(atype, "")
    scope_block = f"\n        [이 풀이의 범위]\n        - {scope_focus}" if scope_focus else ""

    prompt = f"""
        {report_header}
        {scope_block}

        [제공된 전문 지식 베이스]
        {knowledge_context}

        [분석 대상자 데이터]
        - 성함: {name}님
        - 명식: 년({_pillar(pillars,'year')}), 월({_pillar(pillars,'month')}), 일({_pillar(pillars,'day')}), 시({_pillar(pillars,'hour')})
        - 오행 분포: {data.get('five_elements', {})}
        - 십성 구성: 년({data.get('ten_gods', {}).get('year', '-')}/{data.get('jiji_ten_gods', {}).get('year', '-')}), 일(본인/{data.get('jiji_ten_gods', {}).get('day', '-')})
        - 십이운성: {data.get('twelve_growth', {})}
        - 신살 및 상호관계: {data.get('sinsal', '없음')}, {data.get('relations', '특이사항 없음')}
        {fortune_line}{partner_block}{time_block}{category_block}

        [분석 요청 사항]
        {query}

        [대가의 리포트 작성 가이드]
        1. 위 '[이 풀이의 범위]'를 엄격히 지키세요. 이 리포트 고유의 주제에 집중하고, 다른 운세 풀이(전체운·대운·올해 등)와 겹치는 타고난 성격·원국 일반론의 반복을 피하세요.
        2. 개별 데이터(신살, 운성 등)는 전문 지식의 상세 설명을 토대로 '근거 있는 분석'을 제시하되, 자료 출처·파일명은 언급하지 마세요.
        3. '## 총평 / ## 정밀 분석 / ## 개운법 / ## 대가의 한마디' 네 개의 헤딩으로만 구조화하여 품격 있는 결과물을 도출하세요.
        4. 각 섹션은 충분한 분량(섹션당 3~6문장 이상)으로 알차게 작성하고, 너무 짧게 끝내지 마세요.
        """
    return prompt


def _get_models_to_try() -> list:
    """list_models로 사용 가능 모델을 검증하여 폴백 순서를 결정(캐시)."""
    global _available_models_cache
    if _available_models_cache is None:
        try:
            _available_models_cache = [
                m.name for m in genai.list_models()
                if 'generateContent' in m.supported_generation_methods
            ]
        except Exception:
            _available_models_cache = []
    if _available_models_cache:
        models = [pm for pm in PRIORITY_MODELS if pm in _available_models_cache]
        return models or ['models/gemini-pro']
    return PRIORITY_MODELS


def _clean(text: str) -> str:
    """후처리. 굵게(**) 강조는 프론트(ReportRenderer)가 렌더하므로 보존한다."""
    return text or ""


def _system_for(req: Any) -> str:
    """분석 수준(level)에 맞는 시스템 인스트럭션을 선택한다."""
    level = (getattr(req, "level", "advanced") or "advanced").lower()
    return SYSTEM_INSTRUCTION_EASY if level == "easy" else SYSTEM_INSTRUCTION


def _gemini_generate(prompt: str, system_instruction: str) -> Optional[str]:
    """Gemini 모델 체인으로 생성 시도. 모두 실패하면 None."""
    for model_name in _get_models_to_try():
        try:
            print(f"Attempting analysis with: {model_name}")
            model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            response = model.generate_content(prompt)
            if response and response.text:
                return _clean(response.text)
        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower():
                print(f"Model {model_name} quota exceeded, trying next...")
                continue
            # 429 외 오류도 OpenRouter 폴백을 위해 멈추지 않고 다음으로
            print(f"Model {model_name} error: {msg}")
            continue
    return None


def _openrouter_generate(prompt: str, system_instruction: str) -> Optional[str]:
    """OpenRouter(OpenAI 호환) 폴백 생성. API 키 없으면 None."""
    if not OPENROUTER_API_KEY:
        return None
    body = {
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 2500,  # 무료 모델이 너무 짧게 끊지 않도록 충분히 확보
        "temperature": 0.8,
    }
    for model in OPENROUTER_MODELS:
        try:
            payload = json.dumps({**body, "model": model}).encode("utf-8")
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=payload,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://saju-app-coral.vercel.app",
                    "X-Title": "Destiny Code",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if text:
                print(f"OpenRouter fallback success: {model}")
                return _clean(text)
        except Exception as e:
            print(f"OpenRouter {model} 실패: {e}")
            continue
    return None


def generate_report(req: Any) -> str:
    """동기 방식 AI 리포트 생성. Gemini → OpenRouter 순으로 폴백."""
    prompt = build_prompt(req)
    system_instruction = _system_for(req)

    text = _gemini_generate(prompt, system_instruction)
    if text:
        return text
    # Gemini 전 모델 실패 시 OpenRouter로 폴백
    text = _openrouter_generate(prompt, system_instruction)
    if text:
        return text
    return "죄송합니다. 현재 AI 모델 사용량이 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."


def _sse(payload: dict) -> str:
    """SSE 이벤트 포맷."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def stream_report(req: Any) -> Iterator[str]:
    """스트리밍 방식 AI 리포트 생성. SSE 청크(delta)와 종료(done) 이벤트를 흘린다."""
    prompt = build_prompt(req)
    system_instruction = _system_for(req)
    models_to_try = _get_models_to_try()
    produced = False
    error_msg = ""

    for model_name in models_to_try:
        try:
            model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            stream = model.generate_content(prompt, stream=True)
            for chunk in stream:
                text = getattr(chunk, "text", "") or ""
                if text:
                    produced = True
                    yield _sse({"delta": _clean(text)})
            if produced:
                yield _sse({"done": True})
                return
        except Exception as e:
            error_msg = str(e)
            if not produced:
                # 첫 청크 전 오류(할당량 등) → 다음 모델로 폴백
                continue
            # 스트리밍 도중 오류 → 에러 플래그와 함께 종료
            yield _sse({"done": True, "error": str(e)})
            return

    # Gemini 전 모델이 아무것도 못 내면 OpenRouter로 폴백(비스트리밍 → 한 번에 전달)
    if not produced:
        fb = _openrouter_generate(prompt, system_instruction)
        if fb:
            yield _sse({"delta": fb})
            yield _sse({"done": True})
            return
        yield _sse({
            "delta": "죄송합니다. 현재 AI 모델 사용량이 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
        })
        yield _sse({"done": True, "error": error_msg or "no_model"})
