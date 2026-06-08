"""
AI 사주 리포트 생성 모듈
- 지식베이스 로드/필터, 분석 타입별 헤더·프롬프트 빌더, Gemini 모델 폴백 체인을 담당한다.
- main.py의 /analyze 로직을 분리하여 동기 생성(generate_report)과 스트리밍(stream_report)을 모두 제공한다.
"""
import os
import re
import json
import datetime
from typing import Any, Optional, Iterator

import google.generativeai as genai
from saju_utils import get_ilun_data, get_seyun_data

# 모델 우선순위 (최신 → 구형 폴백). list_models 검증으로 미존재 모델은 자동 제외된다.
PRIORITY_MODELS = [
    'models/gemini-2.5-flash',
    'models/gemini-2.0-flash',
    'models/gemini-1.5-flash',
    'models/gemini-pro',
]

KNOWLEDGE_CONTEXT_LIMIT = int(os.getenv("KNOWLEDGE_CONTEXT_LIMIT", "240000"))
KNOWLEDGE_FALLBACK_LIMIT = int(os.getenv("KNOWLEDGE_FALLBACK_LIMIT", "60000"))

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

SYSTEM_INSTRUCTION = (
    "당신은 사주 명리학의 깊이 있는 통찰을 전하는 인격 고매한 대가입니다.\n"
    "지식 참조 원칙:\n"
    "1. 전체사주 및 원국 해석 시, 반드시 '[분석 대원칙 및 방향성 가이드]'로 명시된 '명리학 핵심 이론과 실전 분석 매뉴얼.pdf'의 해석 방향을 '최우선 대원칙'으로 삼으세요.\n"
    "2. 십성, 12운성, 신살 등 개별 항목의 구체적인 풀이는 해당 주제와 관련된 개별 PDF 소스(예: 12신살.pdf, 12운성.pdf 등)의 상세 내용을 적극 인용하여 분석의 깊이를 더하세요.\n"
    "3. 대운/세운/월운/오늘/신년 분석 시에는 '[시간 운세 분석 핵심 기준]'으로 명시된 정보를 절대적 기준으로 삼아 해석의 일관성을 유지하세요.\n\n"
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

    manual_source = "명리학 핵심 이론과 실전 분석 매뉴얼"
    learning_parts = [p for p in parts if is_reference_source(p) and "학습자료/" in p]
    relevant_parts: list[str] = []

    if analysis_type in MANUAL_TYPES:
        # 핵심 매뉴얼을 최상단(대원칙)에 배치
        manual_part = next((p for p in parts if manual_source in p), "")
        if manual_part:
            relevant_parts.append(f"### [분석 대원칙 및 방향성 가이드]\n{manual_part}")
        relevant_parts.extend(learning_parts)
        for p in parts:
            if is_reference_source(p) and manual_source not in p and "학습자료/" not in p:
                relevant_parts.append(p)
    else:
        # 대운/세운/월운/오늘/궁합/신년: sample_knowledge 우선
        sample_part = next((p for p in parts if "sample_knowledge.txt" in p), "")
        if sample_part:
            relevant_parts.append(f"### [시간 운세 분석 핵심 기준]\n{sample_part}")
        relevant_parts.extend(learning_parts)
        for p in parts:
            if is_reference_source(p) and "sample_knowledge.txt" not in p and "학습자료/" not in p:
                relevant_parts.append(p)

    if relevant_parts:
        return "\n".join(relevant_parts)[:KNOWLEDGE_CONTEXT_LIMIT]
    return full_content[:KNOWLEDGE_FALLBACK_LIMIT]


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
    fortune = data.get("fortune")
    if fortune and fortune.get("list"):
        fortune_line = f"- 현재 대운 정보: {fortune.get('num')}대운 / {fortune['list'][0].get('ganzhi', '-')}"

    # 태어난 시간 미상이면 시주에 의존한 단정을 피하도록 명시
    unknown_time_note = ""
    if data.get("unknown_time"):
        unknown_time_note = "\n        - ※ 태어난 시간 미상: 시주(時柱)는 불확실하므로 시주에 근거한 단정적 해석은 피하고, 년·월·일주 중심으로 풀이하세요."

    partner_block = ""
    if atype == "compatibility":
        partner_block = _compat_summary(getattr(req, "partner_saju_data", None))

    # 시점 운세(오늘/신년)는 해당 시점의 간지를 직접 산출해 프롬프트에 주입한다
    time_block = ""
    try:
        if atype in ("today", "newyear") and pillars:
            day_gan = pillars.get("day", {}).get("stem")
            year_branch = pillars.get("year", {}).get("branch")
            day_branch = pillars.get("day", {}).get("branch")
            target_year = getattr(req, "target_year", None)
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

    # 올해 분야별 운세: 집중 분석 지시 주입
    category_block = ""
    if atype == "newyear" and category in CATEGORY_FOCUS:
        category_block = f"\n        [집중 분석 지시]\n        - {CATEGORY_FOCUS[category]}"

    prompt = f"""
        {report_header}

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
        1. 지식 베이스에서 명시된 '분석 대원칙'에 따라 전체적인 해석의 톤을 잡으세요.
        2. 개별 데이터(신살, 운성 등)에 대해서는 관련 PDF의 상세 설명을 인용하여 '근거 있는 분석'을 제시하세요.
        3. '## 총평 / ## 정밀 분석 / ## 개운법 / ## 대가의 한마디' 네 개의 헤딩으로만 구조화하여 품격 있는 결과물을 도출하세요.
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


def generate_report(req: Any) -> str:
    """동기 방식 AI 리포트 생성. 평문(마크다운 헤딩 포함) 문자열을 반환한다."""
    prompt = build_prompt(req)
    system_instruction = _system_for(req)
    models_to_try = _get_models_to_try()
    response = None
    error_msg = ""

    for model_name in models_to_try:
        try:
            print(f"Attempting analysis with: {model_name}")
            model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            response = model.generate_content(prompt)
            if response and response.text:
                break
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower():
                print(f"Model {model_name} quota exceeded, trying next...")
                continue
            raise e

    if not response or not response.text:
        return f"죄송합니다. 현재 모든 AI 모델의 할당량이 초과되었습니다. 잠시 후 다시 시도해 주세요. (에러: {error_msg})"
    return _clean(response.text)


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
            if not produced and ("429" in error_msg or "quota" in error_msg.lower()):
                # 첫 청크 전 할당량 초과 → 다음 모델로 폴백
                continue
            # 스트리밍 도중 오류 → 에러 플래그와 함께 종료
            yield _sse({"done": True, "error": str(e)})
            return

    if not produced:
        yield _sse({
            "delta": f"죄송합니다. 현재 모든 AI 모델의 할당량이 초과되었습니다. 잠시 후 다시 시도해 주세요. (에러: {error_msg})"
        })
        yield _sse({"done": True, "error": error_msg or "no_model"})
