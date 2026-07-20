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
from saju_utils import get_ilun_data, get_seyun_data, analyze_strength

# 모델 우선순위 (최신 → 구형 폴백). list_models 검증으로 미존재 모델은 자동 제외된다.
# 각 모델은 무료등급에서 별도 일일 한도(RPD)를 가지므로, 체인이 길수록 하루 가용 횟수가 늘어난다.
# 죽은 모델(gemini-1.5-flash, gemini-pro: 404) 제거. flash + lite(별도 한도)로 가용 횟수 확보.
PRIORITY_MODELS = [
    'models/gemini-3.5-flash',
    'models/gemini-2.5-flash',
    'models/gemini-2.5-flash-lite',
    'models/gemini-2.0-flash',
    'models/gemini-2.0-flash-lite',
]

# 지식베이스 컨텍스트 한도(글자수). 무료등급 TPM(분당 토큰)·비용·속도를 고려해 축소.
# 더 깊은 풀이가 필요하면 환경변수로 키울 수 있다.
KNOWLEDGE_CONTEXT_LIMIT = int(os.getenv("KNOWLEDGE_CONTEXT_LIMIT", "50000"))
KNOWLEDGE_FALLBACK_LIMIT = int(os.getenv("KNOWLEDGE_FALLBACK_LIMIT", "20000"))

# OpenRouter 폴백: Gemini 무료 한도 소진 시 OpenAI 호환 API로 자동 전환.
# OPENROUTER_API_KEY 환경변수가 있으면 활성화. 모델은 무료(:free) 위주로 환경변수로 조절 가능.
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
# 2026-06 기준 가용 무료 모델로 갱신(기존 deepseek:free/gemini-flash-exp:free는 종료됨).
# openrouter/free = OpenRouter 자동 무료 라우팅(한 모델이 죽어도 알아서 대체) → 가장 안정적.
OPENROUTER_MODELS = [
    m.strip() for m in os.getenv(
        "OPENROUTER_MODELS",
        "openrouter/free,openai/gpt-oss-120b:free,qwen/qwen3-next-80b-a3b-instruct:free,meta-llama/llama-3.3-70b-instruct:free",
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

# 분석 타입별 정형 분석 항목 — 원국/대운/세운/월운/오늘/궁합 각각 순서와 관점을 고정한다.
# (원국↔대운↔세운↔월운의 상호작용을 명시해 상위·하위 운이 맞물리게 해석)
_ORIGINAL_Q = [
    "일간과 일주를 중심으로 타고난 본연의 기질과 중심 성격을 설명해 주세요.",
    "월지의 기운과 전체 십성의 흐름을 바탕으로, 이 사주가 사회에서 어떤 환경에 놓이기 쉽고 어떤 방식으로 역량을 발휘하는지 분석해 주세요.",
    "십성 구성에서 나타나는 특징적 장단점과 그에 따른 인생 흐름의 특성을 분석해 주세요.",
    "오행 분포를 근거로 부족하거나 과한 기운을 조절할 실생활 보완책(색상·방향·습관 등)을 제안해 주세요.",
    "재물운·연애/결혼운·직업 적성·건강운 등 주요 영역을 데이터 근거로 종합 해석해 주세요.",
    "사주 구성의 균형을 위해 지향해야 할 삶의 태도와 핵심 조언을 들려주세요.",
]
QUESTION_SETS = {
    "total": _ORIGINAL_Q,
    "original": _ORIGINAL_Q,
    "daeun": [
        "현재 대운의 간지·십성을 바탕으로, 이 시기가 사주 원국에 가져오는 전반적 운의 흐름과 환경 변화를 분석해 주세요.",
        "대운의 십성(천간/지지)과 십이운성을 근거로, 이 시기에 나타날 사회적 성취 가능성과 심리적 변화를 심층 설명해 주세요.",
        "이 대운 동안의 직업·재물운, 그리고 건강과 대인관계를 포함한 개인적 삶의 변화를 분석해 주세요.",
        "이 시기에 반드시 잡아야 할 기회와, 특별히 주의·보완해야 할 점을 구체적으로 조언해 주세요.",
        "다음 대운으로 넘어가는 과정에서 가져야 할 마음가짐과 현실적 행동 지침을 들려주세요.",
    ],
    "seyun": [
        "올해(세운)가 사주 원국 및 현재 대운과 상호작용하여 만들어내는 핵심 운의 흐름을 분석해 주세요.",
        "세운의 십성과 십이운성을 근거로 직업·재물·대인관계·건강 등 실생활 영역의 변화를 설명해 주세요.",
        "올해 가장 주목할 긍정적 기회와, 전문가적 관점에서 주의가 필요한 리스크를 짚어 주세요.",
        "올해의 기운을 가장 현명하게 활용하기 위한 구체적 태도와 행동 지침을 조언해 주세요.",
    ],
    "wolun": [
        "월운 간지·십성·십이운성을 바탕으로, 이번 달이 세운 흐름 속에서 어떤 구체적 변곡점이 되는지 분석해 주세요.",
        "월운의 십성을 근거로 이번 달의 직업적 성과·재물 흐름·대인관계 변화를 실질적으로 설명해 주세요.",
        "이번 달 집중할 긍정적 기회와, 예기치 않게 발생할 부정적 변수를 관리할 현실적 조언을 제시해 주세요.",
        "이번 달 십이운성이 시사하는 심리 상태를 고려해, 한 달을 후회 없이 보낼 핵심 행동 지침을 들려주세요.",
    ],
    "today": [
        "오늘 일진의 간지·십성·십이운성을 바탕으로, 오늘이 원국·세운 흐름 속에서 어떤 하루가 되는지 분석해 주세요.",
        "오늘의 십성 기운을 근거로 일·재물·관계·건강 면에서 유의할 점을 실질적으로 설명해 주세요.",
        "오늘 특히 살릴 기회와 조심할 부분을 짚어 주세요.",
        "오늘의 기운을 가장 잘 쓰는 마음가짐과 구체적 행동 지침을 들려주세요.",
    ],
    "newyear": [
        "올해(세운)가 사주 원국 및 현재 대운과 상호작용하여 만들어내는 한 해의 핵심 운의 흐름을 분석해 주세요.",
        "세운의 십성과 십이운성을 근거로 직업·재물·대인관계·건강 등 실생활 영역의 변화를 설명해 주세요.",
        "올해 가장 주목할 긍정적 기회와 주의가 필요한 리스크, 시기별 흐름을 짚어 주세요.",
        "한 해를 여는 마음가짐과 올해 반드시 실천할 구체적 행동 지침을 조언해 주세요.",
    ],
    "compatibility": [
        "두 사람의 일간·일주 기질이 어떻게 만나고 부딪히는지 분석해 주세요.",
        "두 명식의 십성·오행 상호작용을 근거로 관계의 강점과 갈등 요인을 설명해 주세요.",
        "재물·애정·소통·생활 등 영역별 궁합과, 관계를 가꾸는 지혜를 풀이해 주세요.",
        "이 인연이 오래가기 위해 서로가 가져야 할 태도와 핵심 조언을 들려주세요.",
    ],
}

SYSTEM_INSTRUCTION = (
    "당신은 사주 명리학의 깊이 있는 통찰을 전하는 인격 고매한 대가입니다.\n"
    "지식 참조 원칙:\n"
    "1. [데이터 기준] 제공된 명식·십성·십이운성·신살·오행분포·대운/세운/월운/일진 값은 검증된 정밀 계산 데이터입니다. 절대 다시 계산하지 말고 이 데이터를 절대적 기준으로 삼되, 해석의 이론과 근거는 아래 제공된 전문 지식(학습 데이터)에 두세요. 특정 외부 앱·서비스·프로그램 이름(예: 만세력 앱 등)은 절대 언급하지 마세요.\n"
    "2. 제공된 전문 지식을 자연스럽게 녹여 깊이 있는 해석의 근거로 삼으세요.\n"
    "3. 십성, 12운성, 신살 등 개별 항목은 그 의미를 풀어 설명하되, 자연스러운 상담 문장으로 녹여내세요.\n"
    "3-1. [필수] 지지의 土(辰·戌·丑·未)는 여러 기운을 품은 잡기(雜氣)이므로 겉의 '土'로만 보지 말고, 반드시 지장간(속 천간)으로 세분해 해석하세요(辰=乙·癸·戊, 戌=辛·丁·戊, 丑=癸·辛·己, 未=丁·乙·己). 土 지지의 십성·용신 판단도 지장간 기준으로 하세요.\n"
    "4. [균형] 용신·희신·기신은 개운과 오행 균형 조언의 근거로만 쓰고, 인물 해석 전반(성격·재능·직업·재물·대인)은 십성·격국·궁위·십이운성·신살을 고르게 활용해 한쪽으로 치우치지 마세요. 용신 위주의 단조로운 풀이를 경계하세요.\n"
    "5. 대운/세운/월운/오늘 분석 시에는 제공된 시간 운세 데이터를 토대로, 원국 → 대운 → 세운 → 월운으로 이어지는 상위·하위 운의 상호작용을 살려 일관되게 해석하세요(세운은 원국·대운과의 상호작용, 월운은 세운 흐름 속 변곡점으로).\n"
    "6. [매우 중요] 참고 자료의 파일명·출처·'.pdf'·'.md'·'SOURCE' 같은 표현이나 '~자료에 따르면', '~매뉴얼에 의하면' 같은 출처 언급을 절대 하지 마세요. 지식은 당신의 통찰인 것처럼 자연스럽게 전하세요.\n\n"
    "출력 형식 (매우 중요):\n"
    "- 맨 처음에 '## 핵심 요약'을 두고, 위 분석 요청 항목별 결론을 각각 한 줄 불릿(- )으로 3~6개 제시하세요(바쁠 때 요약만 봐도 되도록 간결하게). 이어서 '## 총평', '## 정밀 분석', '## 개운법', '## 대가의 한마디' 네 헤딩으로 상세 서술하세요.\n"
    "- 위 다섯 개의 '## 헤딩'만 사용하고, 그 외 다른 헤딩(#, ###)이나 기울임(*), 코드블록(`)은 쓰지 마세요.\n"
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
    "3. 비유와 짧은 이야기를 곁들여 읽는 사람이 자기 삶에 바로 대입할 수 있게 하세요.\n"
    "4. [데이터 기준] 제공된 사주 정보와 운세 값은 이미 검증된 것이니 절대 다시 계산하지 말고 그대로 기준으로 삼으세요. 해석의 근거는 아래 제공된 지식(학습 데이터)에 두고, 특정 외부 앱·서비스·프로그램 이름은 절대 언급하지 마세요.\n"
    "5. 아래 '분석 요청 사항'의 항목들을 하나도 빠뜨리지 말고 모두 다루되, 어려운 용어 대신 일상 언어와 비유로 풀어 네 섹션에 자연스럽게 녹이세요. 시간 운세(이 시기·올해·이달·오늘)라면 타고난 바탕과 지금 흐름이 어떻게 맞물리는지 쉽게 짚어 주세요.\n\n"
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
    """프론트가 빈 query를 보내면 분석 타입별 정형 분석 항목(번호 목록)을 자동 생성한다."""
    user_query = sanitize(getattr(req, "query", "") or "")
    if user_query:
        return user_query
    atype = getattr(req, "analysis_type", "total") or "total"
    qs = QUESTION_SETS.get(atype) or QUESTION_SETS["total"]
    lines = "\n".join(f"        {i}. {q}" for i, q in enumerate(qs, 1))
    return ("아래 항목을 명리학 전문가의 관점에서 순서대로 빠짐없이 분석해 주세요.\n" + lines)


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

    # 지장간(여기·중기·정기) + 통근·투출 사실값 주입 (규칙은 지식베이스, 판정은 코드)
    jijang_block = ""
    jj = data.get("jijanggan") or {}
    if jj:
        parts = []
        for p, ko in (("year", "년"), ("month", "월"), ("day", "일"), ("hour", "시")):
            gans = jj.get(p) or []
            if gans:
                parts.append(f"{ko}지({pillars.get(p, {}).get('branch', '')}) {''.join(gans)}")
        tugan = data.get("tugan") or []
        tonggeun = data.get("tonggeun") or []
        jijang_block = (
            f"\n        - 지장간(지지 속 숨은 천간): {', '.join(parts)}"
            f"\n        - 투출(천간에 드러난 지장간): {', '.join(tugan) or '없음'}"
            f"\n        - 일간 통근(일간이 뿌리내린 지지): {', '.join(tonggeun) or '없음(무근·뿌리 약함)'}"
        )

    # 십성 4기둥 전체 (천간·지지) — 기존엔 년·일만 넘겨 월주(직업·사회궁)·시주가 누락됐다
    tg = data.get('ten_gods', {})
    jtg = data.get('jiji_ten_gods', {})
    sipsung_line = (
        f"        - 십성 구성(천간/지지): "
        f"년({tg.get('year', '-')}/{jtg.get('year', '-')}), "
        f"월({tg.get('month', '-')}/{jtg.get('month', '-')}), "
        f"일(일간 본인/{jtg.get('day', '-')}), "
        f"시({tg.get('hour', '-')}/{jtg.get('hour', '-')})"
    )

    # 신강신약·용신(희기신)·격국 — 해석의 척추. 저장된 구 명식엔 없을 수 있으므로 즉석 계산으로 보강
    sa = data.get('strength_analysis') or analyze_strength(data)
    strength_block = ""
    if sa:
        excess = ', '.join(sa.get('element_excess', [])) or '없음'
        lack = ', '.join(sa.get('element_lack', [])) or '없음'
        strength_block = (
            f"\n        [신강신약·격국·용신 — 구조 판정 (해석의 여러 축 중 하나)]"
            f"\n        - 일간 오행: {sa.get('day_element', '-')} / 신강신약: {sa.get('strength', '-')} ({sa.get('strength_basis', '')})"
            f"\n        - 격국(그릇·사회적 성향의 큰 틀): {sa.get('gyeokguk', '-')}"
            f"\n        - 용신·희신(개운·균형 조언의 근거 오행): {', '.join(sa.get('yongsin', [])) or '판단 보류'} / 기신(부담 오행): {', '.join(sa.get('gisin', [])) or '없음'} [{sa.get('yongsin_method', '')}]"
            f"\n        - 오행 과다(3+): {excess} / 오행 부재(0): {lack}"
        )

    prompt = f"""
        {report_header}
        {scope_block}

        [제공된 전문 지식 베이스]
        {knowledge_context}

        [분석 대상자 데이터]
        - 성함: {name}님
        - 명식: 년({_pillar(pillars,'year')}), 월({_pillar(pillars,'month')}), 일({_pillar(pillars,'day')}), 시({_pillar(pillars,'hour')})
        - 오행 분포: {data.get('five_elements', {})}
{sipsung_line}
        - 십이운성(년/월/일/시): {data.get('twelve_growth', {})}
        - 신살 및 상호관계: {data.get('sinsal', '없음')}, {data.get('relations', '특이사항 없음')}{jijang_block}{strength_block}
        {fortune_line}{partner_block}{time_block}{category_block}

        [분석 요청 사항]
        {query}

        [대가의 리포트 작성 가이드]
        1. 위 '[이 풀이의 범위]'를 엄격히 지키세요. 이 리포트 고유의 주제에 집중하고, 다른 운세 풀이(전체운·대운·올해 등)와 겹치는 타고난 성격·원국 일반론의 반복을 피하세요.
        2. 개별 데이터(신살, 운성, 지장간·통근·투출 등)는 전문 지식의 상세 설명을 토대로 '근거 있는 분석'을 제시하되, 자료 출처·파일명은 언급하지 마세요. 특히 지장간·통근·투출은 천간이 지지에 뿌리내린 세력의 강약을 판단하는 핵심 근거로 활용하세요. ★특히 지지의 土(辰·戌·丑·未)는 여러 기운을 품은 잡기(雜氣)이므로, 겉의 '土'로만 보지 말고 반드시 지장간(속 천간)까지 열어 그 안에 든 기운(예: 辰=乙·癸·戊, 戌=辛·丁·戊, 丑=癸·辛·己, 未=丁·乙·己)으로 세분해 해석하세요.
        3. [다관점 균형 해석 — 가장 중요] 한 가지 틀에 치우치지 말고 아래 관점을 고루 엮어 입체적으로 풀이하세요. 특히 십성을 인물 해석의 주된 언어로 삼고, 용신은 개운·균형 조언에 한정하세요.
           - 십성(十星): 재성=재물·실리·현실감, 관성=직업·명예·조직·책임, 인성=학문·문서·자격·조력, 식상=표현·재능·창의·자식, 비겁=경쟁·독립·동료·자존. 원국에 강한 십성과 부재·과다한 십성으로 그 사람의 재능·욕구·결핍·인간관계를 구체적으로 풀이하세요.
           - 격국(格局): 그 사람의 그릇과 사회적 성향의 큰 틀로 활용하세요.
           - 궁위·십이운성·신살·지장간: 영역별 운과 기질의 색채·강약으로 활용하세요.
           - 신강신약·용신·희신·기신: 주로 '개운법'과 오행 균형 조언의 근거로 쓰세요(개운의 색·방향·시기·직업환경은 용신·희신 오행에 근거하고, 기신 보강은 권하지 마세요). 단 용신은 여러 해석 축의 하나일 뿐이니, 성격·재능·직업·재물·대인 풀이 전체를 용신·기신으로 환원하거나 "용신이 ~라 좋다/나쁘다"는 식의 단순 도식에 가두지 마세요.
        4. [궁(宮)별 해석] 명식의 네 기둥을 인생 영역으로 나누어 구체적으로 풀이하세요 — 년주=조상·초년·뿌리, 월주=부모·직업·사회궁(가장 중요), 일지=배우자·가정궁, 시주=자식·말년·결실. 각 궁의 십성과 십이운성을 그 영역의 운으로 연결하세요.
        5. [근거 명시] 모든 단정에는 그 근거가 된 글자나 판정을 괄호로 짧게 덧붙이세요(예: "추진력이 강합니다(편관 투출·신강)"). 근거 없는 막연한 덕담·일반론을 금합니다.
        6. 리포트는 위 시스템 지시에 명시된 네 개의 '## 헤딩'으로만 구조화하세요(헤딩 문구는 시스템 지시를 그대로 따르고 임의로 바꾸지 마세요).
        7. 각 섹션은 충분한 분량(섹션당 4~7문장 이상)으로 알차게 작성하고, 너무 짧게 끝내지 마세요. 특히 핵심 분석 섹션(두 번째 섹션)은 근거를 들어 가장 깊이 있게 작성하세요.
        8. [분석 항목 커버] 위 '[분석 요청 사항]'의 번호 항목을 하나도 빠뜨리지 말고 모두 다루되, 답을 번호로 나열하지 말고 네 섹션(특히 '정밀 분석')에 자연스럽게 녹여 서술하세요. 시간 운세(대운·세운·월운·오늘)라면 원국 → 상위운 → 해당 시기로 이어지는 상호작용을 반드시 짚으세요.
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
        return models or ['models/gemini-2.0-flash']
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
            response = model.generate_content(prompt, generation_config={"max_output_tokens": 8192})
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
        "max_tokens": 4096,  # 정형 항목 리포트가 잘리지 않도록 충분히 확보
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
            # 무료 모델이 과부하로 응답을 끌면 한 모델에 너무 오래 매이지 않도록 타임아웃 단축
            with urllib.request.urlopen(req, timeout=45) as resp:
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


def _stream_models(prompt: str, system_instruction: str) -> Iterator[str]:
    """모델 폴백 스트림(SSE). stream_report·stream_jami 공용."""
    produced = False
    error_msg = ""
    for model_name in _get_models_to_try():
        try:
            model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            # 첫 청크 전 무한 행 방지: 타임아웃 초과 시 예외 → 다음 모델로 폴백
            stream = model.generate_content(prompt, stream=True, generation_config={"max_output_tokens": 8192}, request_options={"timeout": 40})
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
                continue
            yield _sse({"done": True, "error": str(e)})
            return
    # Gemini 전 모델 실패 시 OpenRouter로 폴백(비스트리밍 → 한 번에)
    if not produced:
        fb = _openrouter_generate(prompt, system_instruction)
        if fb:
            yield _sse({"delta": fb})
            yield _sse({"done": True})
            return
        yield _sse({"delta": "죄송합니다. 현재 AI 모델 사용량이 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."})
        yield _sse({"done": True, "error": error_msg or "no_model"})


def stream_report(req: Any) -> Iterator[str]:
    """스트리밍 방식 AI 리포트 생성. SSE 청크(delta)와 종료(done) 이벤트를 흘린다."""
    yield from _stream_models(build_prompt(req), _system_for(req))


# ---------------------------------------------------------------------------
# 자미두수(紫微斗數) 명반 해석 — 명반 데이터를 절대 기준으로 자미두수 체계로 풀이
# ---------------------------------------------------------------------------
JAMI_SYSTEM = (
    "당신은 자미두수(紫微斗數)에 정통한 대가입니다.\n"
    "해석 원칙:\n"
    "1. [데이터 기준] 제공된 명반(명궁·삼방사정·12궁 성요·사화·대한·묘왕)은 검증된 정밀 데이터입니다. 절대 다시 계산하지 말고, 이 명반을 절대적 기준으로 삼아 해석하세요. 특정 외부 앱·서비스·프로그램 이름은 언급하지 마세요.\n"
    "2. 자미두수 원리로 풀이하세요 — 14주성 각각의 성질, 묘왕리함(廟·旺·得地·利·平·不得地·陷)에 따른 강약, 삼방사정(명궁+재백+관록+천이)이 이루는 격국, 사화(化祿·化權·化科·化忌)가 든 궁의 강조·주의, 대한(大限)의 시기 흐름을 근거로 삼으세요.\n"
    "3. 사주(명리)가 아니라 자미두수 체계로 해석하세요. 성요는 한자로 언급하되 그 의미를 풀어 자연스러운 상담 문장으로 녹여내세요.\n"
    "4. 단정 대신 통찰로, 전문가의 품격에 맞는 존댓말로 따뜻하게 서술하세요.\n\n"
    "출력 형식(매우 중요):\n"
    "- 맨 처음에 '## 핵심 요약'을 두고, 위 분석 요청 항목별 결론을 각각 한 줄 불릿(- )으로 3~6개 제시하세요(요약만 봐도 되도록 간결하게). 이어서 '## 총평', '## 명반 정밀 해석', '## 삶의 영역별 조언', '## 대가의 한마디' 네 헤딩으로 상세 서술하세요.\n"
    "- 위 다섯 개의 '## 헤딩'만 사용하고, 그 외 헤딩(#, ###)·기울임(*)·코드블록(`)은 쓰지 마세요.\n"
    "- 핵심 키워드·조언은 **굵게**(별표 두 개)로 강조하되 한 섹션에 1~3곳만.\n"
    "- 각 섹션은 충분한 분량(4~7문장 이상)으로 알차게 작성하세요."
)

_JAMI_GUNG_ORDER = ["명궁", "형제", "부처", "자녀", "재백", "질액", "천이", "노복", "관록", "전택", "복덕", "부모"]
# 12궁 클릭 시 그 궁 집중 해석용 의미
_GUNG_MEANING = {
    "명궁": "자아·기본 성격·평생 기조", "형제": "형제·동료·경쟁·협력", "부처": "배우자·배우자 인연·부부관계",
    "자녀": "자녀·아랫사람·창의력", "재백": "재물·현금 흐름·금전관", "질액": "건강·질병·체질",
    "천이": "대외활동·이동·사회적 처세", "노복": "친구·부하·인맥", "관록": "직업·명예·사회적 지위",
    "전택": "부동산·가정 환경·안정 자산", "복덕": "복록·정신세계·취향·말년", "부모": "부모·윗사람·문서·학업",
}

# 자미 해석 세분화 초점 — scope(집중 영역) + q(정형 질문)
JAMI_FOCUS = {
    "종합": {"scope": "명반 전반 종합", "q": [
        "명궁의 주성과 묘왕을 중심으로 타고난 성격·기질·재능을 설명해 주세요.",
        "삼방사정(명궁·재백·관록·천이)의 성요 구조로 본 인생의 큰 틀과 사회적 성향을 분석해 주세요.",
        "부처·재백·관록·질액·천이 등 주요 궁을 성요 근거로 영역별 해석해 주세요.",
        "사화(化祿·化權·化科·化忌)가 든 궁으로 이 명반이 강조하는 지점과 주의할 지점을 짚어 주세요.",
        "현재 대한(大限)의 궁·성요로 지금 시기의 흐름과 조언을 들려주세요.",
        "명반 전체의 균형을 위해 지향할 삶의 태도와 핵심 조언을 들려주세요.",
    ]},
    "성격": {"scope": "타고난 성격·기질·재능 (명궁·복덕궁·삼방사정 중심)", "q": [
        "명궁 주성·묘왕으로 본 핵심 성격과 기질을 설명해 주세요.",
        "복덕궁의 성요로 본 정신세계·취향·복록의 성향을 분석해 주세요.",
        "삼방사정 구조가 성격에 더하는 사회적 성향을 설명해 주세요.",
        "명궁·삼방의 길성(문창문곡·좌보우필 등)과 살성(경양타라·화령 등)이 성격에 주는 강점과 그늘을 짚어 주세요.",
        "타고난 재능을 어떻게 살리면 좋을지 성격 활용 조언을 들려주세요.",
    ]},
    "재물": {"scope": "재물운 (재백궁·전택궁·재성 중심)", "q": [
        "재백궁의 성요·묘왕으로 본 재물 성향과 돈을 다루는 방식을 설명해 주세요.",
        "전택궁으로 본 부동산·축적·안정 자산의 흐름을 분석해 주세요.",
        "무곡·천부·탐랑 등 재성과 사화(化祿/化忌)가 재물에 주는 기회와 리스크를 짚어 주세요.",
        "재물을 늘리기 위한 현실적 태도와 시기적 조언을 들려주세요.",
    ]},
    "애정": {"scope": "애정·결혼운 (부처궁 중심)", "q": [
        "부처궁의 성요·묘왕으로 본 배우자상과 배우자 인연의 특징을 설명해 주세요.",
        "홍란·천희 등 도화·인연성과 삼방에서 본 관계 방식을 분석해 주세요.",
        "사화·살성이 부처궁에 주는 영향과 관계에서 주의할 점을 짚어 주세요.",
        "좋은 인연을 만나고 관계를 가꾸기 위한 조언과 시기를 들려주세요.",
    ]},
    "직업": {"scope": "직업·사회운 (관록궁·명궁 삼방 중심)", "q": [
        "관록궁의 성요·묘왕으로 본 직업 적성과 사회적 성취 방식을 설명해 주세요.",
        "명궁·재백·관록 삼방 구조로 본 진로의 큰 틀을 분석해 주세요.",
        "길성·살성·사화가 직업운에 주는 기회와 변수를 짚어 주세요.",
        "적성을 살린 진로 방향과 현실적 조언을 들려주세요.",
    ]},
    "건강": {"scope": "건강운 (질액궁 중심)", "q": [
        "질액궁의 성요·묘왕으로 본 건강의 강약과 체질 경향을 설명해 주세요.",
        "질액궁·명궁의 살성(경양·타라·화성·영성)이 건강에 주는 자극과 주의할 신체 부위를 짚어 주세요.",
        "오행·성요 균형으로 본 취약 시기와 양생 방향을 분석해 주세요.",
        "건강을 지키기 위한 생활 습관과 조언을 들려주세요.",
    ]},
    "대한": {"scope": "현재 대한(大限) 10년 흐름", "q": [
        "현재 나이가 속한 대한궁의 위치·성요·묘왕으로 이 10년의 성격을 설명해 주세요.",
        "대한궁의 사화·길성·살성으로 이 시기의 기회와 과제를 분석해 주세요.",
        "대한궁이 본명 삼방·명궁과 맺는 관계로 이 시기의 변화를 짚어 주세요.",
        "이 대한을 지혜롭게 보내기 위한 구체적 조언을 들려주세요.",
    ]},
    "유년": {"scope": "올해 유년(流年) 흐름", "q": [
        "올해 나이가 속한 유년궁의 성요·묘왕으로 올해의 전반적 흐름을 설명해 주세요.",
        "유년궁이 현재 대한·본명 명궁과 맺는 관계로 올해의 변화를 분석해 주세요.",
        "올해 주목할 기회와 주의할 리스크를 성요 근거로 짚어 주세요.",
        "올해를 잘 보내기 위한 구체적 행동 지침을 들려주세요.",
    ]},
}


def build_jami_prompt(jami: dict, focus: str = "종합") -> str:
    """자미두수 명반 데이터 → 해석 프롬프트(focus별 세분화)."""
    board = jami.get("명반", []) or []
    byg = {c.get("궁"): c for c in board}

    def cell_desc(c: dict) -> str:
        mw = c.get("묘왕", {}) or {}

        def _st(s: str, h: str) -> str:
            g = mw.get(h, "")
            return f"{s}({g})" if g else s
        stars = "·".join(_st(s, h) for s, h in zip(c.get("주성", []), c.get("주성한글", []))) or "무주성"
        aux = "·".join((c.get("보좌", []) or []) + (c.get("잡성", []) or []))
        hwa = "·".join(f"{x['화']}({x['성']})" for x in (c.get("사화", []) or []))
        parts = [f"{c.get('궁한자', c.get('궁'))}({c.get('지지')}): 주성 {stars}"]
        if aux:
            parts.append(f"보조·잡성 {aux}")
        if hwa:
            parts.append(f"사화 {hwa}")
        parts.append(f"박사 {c.get('박사신', '-')}·장생 {c.get('장생신', '-')}·대한 {c.get('대한', '-')}")
        return " | ".join(parts)

    lines = "\n".join(f"        - {cell_desc(byg[g])}" for g in _JAMI_GUNG_ORDER if g in byg)
    sam = [byg.get(g) for g in ("명궁", "재백", "관록", "천이")]
    samdesc = " / ".join(
        f"{c.get('궁한자')} {'·'.join(c.get('주성', [])) or '무주성'}" for c in sam if c
    )
    if focus in _GUNG_MEANING:  # 12궁 직접 클릭 → 그 궁 집중 해석
        fc = {"scope": f"{focus}궁 집중 — {_GUNG_MEANING[focus]}", "q": [
            f"{focus}궁에 든 성요와 묘왕으로 이 영역({_GUNG_MEANING[focus]})의 특징을 설명해 주세요.",
            f"{focus}궁의 사화·길성·살성이 이 영역에 주는 기회와 주의점을 짚어 주세요.",
            f"{focus}궁이 명궁·삼방사정과 맺는 관계로 본 흐름을 분석해 주세요.",
            f"{focus} 영역을 위해 지향할 태도와 구체적 조언을 들려주세요.",
        ]}
    else:
        fc = JAMI_FOCUS.get(focus) or JAMI_FOCUS["종합"]
    # 대한/유년 초점이면 현재 나이가 든 궁을 찾아 명시
    age = jami.get("현재나이")
    age_line = ""
    if age:
        daehan = next((c["궁한자"] for c in board if _in_range(c.get("대한", ""), age)), "")
        yun = next((c["궁한자"] for c in board if age in (c.get("유년") or [])), "")
        age_line = (f"        - 현재 나이(만 나이) {age}세 → 현재 대한궁 {daehan or '?'} · 올해 유년궁 {yun or '?'}"
                    f" (자미두수는 만 나이 기준. 반드시 이 나이로 해석하고 다시 계산하지 마세요)\n")
    q = "\n".join(f"        {i}. {x}" for i, x in enumerate(fc["q"], 1))
    return (
        f"\n        [자미두수 명반 — {fc['scope']}]\n"
        f"        - 五行局: {jami.get('五行局')} / 명궁: {jami.get('명궁')}궁 (주성: {'·'.join(jami.get('명궁주성', [])) or '무주성'}) / 음력 {jami.get('음력', '')}\n"
        f"        - 命主 {jami.get('명주', '')} · 身主 {jami.get('신주', '')} · 身宮 {jami.get('신궁', '')}\n"
        f"        - 삼방사정: {samdesc}\n"
        f"{age_line}"
        f"        - 12궁 배치:\n{lines}\n\n"
        f"        [분석 요청 — 아래 항목을 순서대로 빠짐없이 다루되 네 섹션에 자연스럽게 녹이세요]\n{q}\n"
    )


def _in_range(rng: str, age: int) -> bool:
    """'4-13' 형식 대한 범위에 age 포함 여부."""
    try:
        a, b = rng.split("-")
        return int(a) <= age <= int(b)
    except Exception:
        return False


def stream_jami(jami: dict, focus: str = "종합") -> Iterator[str]:
    """자미두수 명반 해석 스트림(focus별 세분화)."""
    yield from _stream_models(build_jami_prompt(jami, focus), JAMI_SYSTEM)


# ---------------------------------------------------------------------------
# 학습 모드: AI 튜터 (질의응답형 — 리포트 4섹션 형식을 강제하지 않는다)
# ---------------------------------------------------------------------------
TUTOR_SYSTEM_INSTRUCTION = (
    "당신은 명리학을 처음 배우는 학생을 가르치는 친절한 과외 선생님입니다.\n"
    "수업 원칙:\n"
    "1. 학생의 질문에 핵심부터 간결하게 답하고, 필요한 만큼만 배경을 보충하세요. 전체 답변은 짧은 문단 2~4개를 넘기지 마세요.\n"
    "2. 전문 용어가 나오면 반드시 한 줄로 뜻을 풀어 주세요. 예시(글자·간단한 명식)를 들어 설명하면 더 좋습니다.\n"
    "3. 제공된 전문 지식을 근거로 답하되, 파일명·출처·'SOURCE' 같은 표현은 절대 언급하지 마세요.\n"
    "4. 운세 풀이나 단정적 예언을 하지 말고, '개념을 이해시키는 것'에 집중하세요.\n"
    "5. 마크다운 헤딩(#) 없이 평문으로 답하고, 핵심 용어 1~3곳만 **굵게** 표시하세요.\n"
    "6. 답 끝에 학생이 이어서 생각해 볼 만한 질문이나 연습거리를 한 줄 제안하세요."
)

# 튜터는 짧은 문답이므로 풀이 리포트보다 컨텍스트를 작게 잡아 속도·한도를 아낀다
TUTOR_KNOWLEDGE_LIMIT = int(os.getenv("TUTOR_KNOWLEDGE_LIMIT", "30000"))


def build_tutor_prompt(question: str, chapter_title: str = "", context_hint: str = "") -> str:
    """학습 질문 + 챕터 맥락 + 지식베이스로 튜터 프롬프트를 구성한다."""
    knowledge = build_knowledge_context("original")[:TUTOR_KNOWLEDGE_LIMIT]
    parts = ["[전문 지식 (수업 근거 자료)]", knowledge, ""]
    if chapter_title:
        parts.append(f"[현재 학습 중인 단원] {sanitize(chapter_title)}")
    if context_hint:
        # 틀린 문제 정보 등 — 오답 해설 요청에 활용
        parts.append(f"[학생의 학습 상황] {sanitize(context_hint)}")
    parts.append(f"[학생의 질문] {sanitize(question)}")
    return "\n".join(parts)


def stream_tutor(question: str, chapter_title: str = "", context_hint: str = "") -> Iterator[str]:
    """AI 튜터 스트리밍 답변. Gemini 체인 → OpenRouter 폴백 (stream_report와 동일한 전략)."""
    prompt = build_tutor_prompt(question, chapter_title, context_hint)
    produced = False
    error_msg = ""

    for model_name in _get_models_to_try():
        try:
            model = genai.GenerativeModel(model_name, system_instruction=TUTOR_SYSTEM_INSTRUCTION)
            # 첫 청크 전 무한 행 방지: 타임아웃 초과 시 예외 → 다음 모델로 폴백
            stream = model.generate_content(prompt, stream=True, generation_config={"max_output_tokens": 8192}, request_options={"timeout": 40})
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
                continue
            yield _sse({"done": True, "error": str(e)})
            return

    if not produced:
        fb = _openrouter_generate(prompt, TUTOR_SYSTEM_INSTRUCTION)
        if fb:
            yield _sse({"delta": fb})
            yield _sse({"done": True})
            return
        yield _sse({"delta": "죄송합니다. 지금은 선생님이 자리를 비웠어요. 잠시 후 다시 질문해 주세요."})
        yield _sse({"done": True, "error": error_msg or "no_model"})


# ---------------------------------------------------------------------------
# 학습 모드: 통변 훈련 채점 (학생의 명식 해석 서술을 AI가 평가)
# ---------------------------------------------------------------------------
GRADER_SYSTEM_INSTRUCTION = (
    "당신은 명리학 통변(명식 해석) 수업의 채점 선생님입니다. 학생이 제출한 명식 해석 답안을 평가하세요.\n"
    "채점 기준 (100점 만점):\n"
    "1. 일간·오행 분포 파악의 정확성 (30점)\n"
    "2. 십성·12운성·합충 등 근거 사용의 정확성 (30점) — 명리적으로 틀린 주장(예: 잘못된 십성)은 반드시 짚어 감점\n"
    "3. 해석의 논리성과 균형 (25점) — 근거 없는 단정·점술식 표현은 감점\n"
    "4. 표현력 (15점)\n"
    "출력 형식 (매우 중요): 반드시 아래 네 개의 마크다운 헤딩만 사용하세요.\n"
    "'## 채점 결과' — 첫 줄에 '총점: NN점 / 100점'을 쓰고 기준별 점수를 한 줄씩.\n"
    "'## 잘 짚은 부분' — 학생이 정확히 본 포인트 2~3가지.\n"
    "'## 놓친 부분' — 틀렸거나 빠뜨린 포인트와 그 이유. 명식의 실제 데이터를 근거로 교정.\n"
    "'## 한 걸음 더' — 다음 연습 방향 한두 문장.\n"
    "격려하되 정확하게. 출처·파일명 언급 금지. 핵심 용어 1~3곳만 **굵게**."
)


def grade_interpretation(saju_summary: str, user_answer: str) -> str:
    """통변 답안 채점 (동기). Gemini → OpenRouter 폴백."""
    knowledge = build_knowledge_context("original")[:TUTOR_KNOWLEDGE_LIMIT]
    prompt = "\n".join([
        "[채점 근거 지식]", knowledge, "",
        "[학생에게 주어진 명식 (정답 데이터)]", saju_summary[:2000], "",
        "[학생의 해석 답안]", user_answer.replace("#", "").replace("`", "")[:4000], "",
        "위 명식 데이터를 정답 기준으로 삼아 학생 답안을 채점하세요.",
    ])
    text = _gemini_generate(prompt, GRADER_SYSTEM_INSTRUCTION)
    if text:
        return text
    text = _openrouter_generate(prompt, GRADER_SYSTEM_INSTRUCTION)
    if text:
        return text
    return "죄송합니다. 지금은 채점 선생님이 자리를 비웠어요. 잠시 후 다시 제출해 주세요."
