"""
🔮 사주 명리학 텔레그램 봇
- python-telegram-bot 라이브러리 기반
- 기존 백엔드 로직(sajupy, saju_utils, saju_data) 재사용
- Gemini AI 분석 기능 포함
"""

import os
import logging
import datetime
import asyncio
import glob
from dotenv import load_dotenv

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    ContextTypes,
    filters,
)
from telegram.constants import ParseMode

from google import genai

# Import Saju logic
from sajupy import SajuCalculator, get_saju_details, lunar_to_solar
from saju_utils import get_extended_saju_data, get_seyun_list, get_seyun_data, get_wolun_data
from saju_data import SAJU_TERMS

# ─── 설정 ───────────────────────────────────────────────
load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://sajumaster1234.streamlit.app/")  # 프론트엔드 URL 설정 (HTTPS 필수)
KNOWLEDGE_CONTEXT_LIMIT = int(os.getenv("KNOWLEDGE_CONTEXT_LIMIT", "240000"))
KNOWLEDGE_FALLBACK_LIMIT = int(os.getenv("KNOWLEDGE_FALLBACK_LIMIT", "60000"))

# Gemini 클라이언트 초기화
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

calc = SajuCalculator()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.DEBUG,
)
logger = logging.getLogger(__name__)

# httpx 로깅은 너무 많으므로 INFO로 제한
logging.getLogger("httpx").setLevel(logging.WARNING)

# ─── 대화 상태 정의 ─────────────────────────────────────
NAME, GENDER, CALENDAR, YEAR, MONTH, DAY, HOUR, MINUTE = range(8)
# 궁합용 대화 상태
GH_GENDER, GH_CALENDAR, GH_YEAR, GH_MONTH, GH_DAY, GH_HOUR, GH_MINUTE = range(8, 15)

# ─── 이모지 & 포매팅 헬퍼 ─────────────────────────────
ELEMENT_EMOJI = {
    "목": "🌿", "화": "🔥", "토": "🏔️", "금": "⚔️", "수": "💧",
}

def format_pillar(label: str, pillar_data: dict) -> str:
    """단일 기둥 정보를 포매팅"""
    p = pillar_data.get("pillar", "??")
    gan = p[0] if len(p) >= 1 else "?"
    ji = p[1] if len(p) >= 2 else "?"
    ten_god = pillar_data.get("ten_god", "")
    twelve = pillar_data.get("twelve_growth", "")
    return f"  {label}주: {gan} {ji}  ({ten_god} | {twelve})"


def format_saju_result(data: dict) -> str:
    """사주 결과 전체를 텔레그램 메시지로 포매팅"""
    pillars = data.get("pillars", {})
    name = data.get("name", "사용자")

    # 오행 분포
    five_el = data.get("five_elements", {})
    el_str = "  ".join([f"{ELEMENT_EMOJI.get(k, '')} {k}: {v}" for k, v in five_el.items()])

    # 사주 기둥
    lines = [
        f"🔮  {name}님의 사주 명식",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "📋 사주 사주 (四柱)",
        f"  시주: {pillars.get('hour', {}).get('pillar', '??')}",
        f"  일주: {pillars.get('day', {}).get('pillar', '??')}",
        f"  월주: {pillars.get('month', {}).get('pillar', '??')}",
        f"  년주: {pillars.get('year', {}).get('pillar', '??')}",
        "",
        "🎯 오행 분포",
        f"  {el_str}",
        "",
    ]

    # 십성
    ten_gods = data.get("ten_gods", {})
    jiji_ten = data.get("jiji_ten_gods", {})
    if ten_gods:
        lines.append("⭐ 십성 (천간)")
        for pos_name, pos_key in [("년", "year"), ("월", "month"), ("일", "day"), ("시", "hour")]:
            tg = ten_gods.get(pos_key, "")
            jtg = jiji_ten.get(pos_key, "")
            lines.append(f"  {pos_name}: {tg} / {jtg}")
        lines.append("")

    # 12운성
    twelve = data.get("twelve_growth", {})
    if twelve:
        lines.append("🔄 12운성")
        for pos_name, pos_key in [("년", "year"), ("월", "month"), ("일", "day"), ("시", "hour")]:
            lines.append(f"  {pos_name}: {twelve.get(pos_key, '')}")
        lines.append("")

    # 신살
    sinsal = data.get("sinsal", {})
    if sinsal:
        lines.append("🛡️ 신살")
        for pos_name, pos_key in [("년", "year"), ("월", "month"), ("일", "day"), ("시", "hour")]:
            s_list = sinsal.get(pos_key, [])
            if s_list:
                lines.append(f"  {pos_name}: {', '.join(s_list)}")
        lines.append("")

    # 현재 나이 계산
    birth_year = data.get("birth_year", 0)
    now = datetime.datetime.now()
    current_age = now.year - birth_year if birth_year else 0

    # 사주 기둥 정보 추출
    pillars_data = data.get("pillars", {})
    day_gan = pillars_data.get('day', {}).get('pillar', '??')[0] if pillars_data.get('day', {}).get('pillar') else ''
    year_branch = pillars_data.get('year', {}).get('pillar', '??')[1] if len(pillars_data.get('year', {}).get('pillar', '')) > 1 else ''
    day_branch = pillars_data.get('day', {}).get('pillar', '??')[1] if len(pillars_data.get('day', {}).get('pillar', '')) > 1 else ''
    year_pillar = pillars_data.get('year', {}).get('pillar', '')
    all_pillars = pillars_data  # saju_utils는 dict('stem', 'branch') 구조를 기대함


    # 대운 정보
    fortune = data.get("fortune", {})
    if fortune:
        f_list = fortune.get("list", [])
        direction = fortune.get("direction", "순행")
        lines.append(f"🌊 대운 ({fortune.get('num', '?')}세 시작 / {direction})")
        for f_item in f_list[:5]:
            age = f_item.get('age', '?')
            ganzhi = f_item.get('ganzhi', '?')
            ten_god = f_item.get('stem_ten_god', '')
            growth = f_item.get('twelve_growth', '')
            marker = " ★" if isinstance(age, int) and isinstance(current_age, int) and current_age >= age and (f_list.index(f_item) == len(f_list) - 1 or current_age < f_list[f_list.index(f_item) + 1].get('age', 999)) else ""
            lines.append(f"  {age}세~ : {ganzhi} ({ten_god} / {growth}){marker}")
        if len(f_list) > 5:
            lines.append(f"  ... 외 {len(f_list) - 5}개 대운")
        lines.append("")

    # 세운 (올해 전후 2년)
    if day_gan and year_branch:
        lines.append(f"📈 세운 (올해 {now.year}년)")
        for y in range(now.year - 1, now.year + 2):
            try:
                seyun = get_seyun_data(day_gan, year_branch, y, pillars=all_pillars, day_branch=day_branch)
                marker = " ★" if y == now.year else ""
                lines.append(f"  {y}년: {seyun.get('ganzhi', '?')} ({seyun.get('stem_ten_god', '')} / {seyun.get('twelve_growth', '')}){marker}")
            except Exception:
                pass
        lines.append("")

    # 월운 (이번달 전후 2달)
    if day_gan and year_branch and year_pillar:
        lines.append(f"🗓️ 월운 ({now.year}년 {now.month}월)")
        for m in range(max(1, now.month - 1), min(13, now.month + 2)):
            try:
                wolun = get_wolun_data(day_gan, year_branch, year_pillar, m, pillars=all_pillars, day_branch=day_branch)
                marker = " ★" if m == now.month else ""
                lines.append(f"  {m}월: {wolun.get('ganzhi', '?')} ({wolun.get('stem_ten_god', '')} / {wolun.get('twelve_growth', '')}){marker}")
            except Exception:
                pass
        lines.append("")

    # 공망
    gongmang = data.get("gongmang", "")
    if gongmang:
        lines.append(f"🕳️ 공망: {gongmang}")
        lines.append("")

    # 현재 나이
    if current_age:
        lines.append(f"👤 현재 나이: 만 {current_age}세")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append("아래 버튼으로 AI 분석을 받아보세요! ⬇️")
    lines.append("💬 텍스트로 자유 질문도 가능합니다!")
    lines.append("(예: 궁합, 이직 시기, 재물운 등)")

    return "\n".join(lines)


# ─── 지식 베이스 로드 ────────────────────────────────────
def load_knowledge_base(analysis_type: str = "total") -> str:
    """knowledge_base.txt에서 분석 타입에 맞는 지식 로드"""
    knowledge_path = os.path.join(os.path.dirname(__file__), 'knowledge_base.txt')
    if not os.path.exists(knowledge_path):
        return ""
    try:
        with open(knowledge_path, 'r', encoding='utf-8') as f:
            full_content = f.read()

        parts = full_content.split("### SOURCE: ")
        relevant_parts = []
        manual_source = "명리학 핵심 이론과 실전 분석 매뉴얼"

        def is_reference_source(part: str) -> bool:
            return any(ext in part.lower() for ext in [".pdf", ".md", ".txt"])

        learning_parts = [
            p for p in parts if is_reference_source(p) and "학습자료/" in p
        ]

        if analysis_type in ["total", "original"]:
            manual_part = next((p for p in parts if manual_source in p), "")
            if manual_part:
                relevant_parts.append(f"### [분석 대원칙 및 방향성 가이드]\n{manual_part}")
            relevant_parts.extend(learning_parts)
            for p in parts:
                if (
                    is_reference_source(p)
                    and manual_source not in p
                    and "학습자료/" not in p
                ):
                    relevant_parts.append(p)
        else:
            sample_part = next((p for p in parts if "sample_knowledge.txt" in p), "")
            if sample_part:
                relevant_parts.append(f"### [시간 운세 분석 핵심 기준]\n{sample_part}")
            relevant_parts.extend(learning_parts)
            for p in parts:
                if (
                    is_reference_source(p)
                    and "sample_knowledge.txt" not in p
                    and "학습자료/" not in p
                ):
                    relevant_parts.append(p)

        if relevant_parts:
            return "\n".join(relevant_parts)[:KNOWLEDGE_CONTEXT_LIMIT]
        else:
            return full_content[:KNOWLEDGE_FALLBACK_LIMIT]
    except Exception as e:
        logger.error(f"Knowledge load error: {e}")
        return ""


# ─── AI 분석 수행 ────────────────────────────────────────
def _get_current_age(birth_year: int) -> int:
    """현재 나이 (만 나이) 계산"""
    now = datetime.datetime.now()
    return now.year - birth_year


def _get_current_daeun(fortune_list: list, current_age: int) -> dict:
    """현재 나이에 해당하는 대운 찾기"""
    if not fortune_list:
        return {}
    current = fortune_list[0]
    for f in fortune_list:
        if f.get('age', 0) <= current_age:
            current = f
        else:
            break
    return current


def _build_type_specific_data(data: dict, analysis_type: str) -> str:
    """분석 유형에 따라 추가 데이터 생성"""
    birth_year = data.get('birth_year', 0)
    current_age = _get_current_age(birth_year) if birth_year else 0
    now = datetime.datetime.now()
    
    pillars = data['pillars']
    day_gan = pillars['day']['pillar'][0] if pillars['day']['pillar'] else ''
    year_branch = pillars['year']['pillar'][1] if len(pillars['year']['pillar']) > 1 else ''
    day_branch = pillars['day']['pillar'][1] if len(pillars['day']['pillar']) > 1 else ''
    
    all_pillars = pillars  # saju_utils.py는 dict('stem', 'branch') 구조를 기대하므로 원본을 그대로 전달

    
    extra = ""
    
    if analysis_type == "total":
        # 전체 분석: 기본 데이터 + 현재 대운 + 올해 세운 + 이번달 월운
        fortune = data.get('fortune', {})
        f_list = fortune.get('list', [])
        current_daeun = _get_current_daeun(f_list, current_age)
        
        try:
            seyun = get_seyun_data(day_gan, year_branch, now.year, pillars=all_pillars, day_branch=day_branch)
        except Exception:
            seyun = {}
        try:
            wolun = get_wolun_data(day_gan, year_branch, pillars['year']['pillar'], now.month, pillars=all_pillars, day_branch=day_branch)
        except Exception:
            wolun = {}
        
        extra = f"""
    - 현재 나이: {current_age}세 (만 나이)
    - 현재 대운: {current_daeun.get('ganzhi', '?')} ({current_daeun.get('stem_ten_god', '')} / {current_daeun.get('twelve_growth', '')})
    - {now.year}년 세운: {seyun.get('ganzhi', '?')} ({seyun.get('stem_ten_god', '')} / {seyun.get('twelve_growth', '')})
    - {now.year}년 {now.month}월 월운: {wolun.get('ganzhi', '?')} ({wolun.get('stem_ten_god', '')} / {wolun.get('twelve_growth', '')})
    - 전체 대운 흐름: {', '.join([f"{f.get('age','?')}세({f.get('ganzhi','')})" for f in f_list])}"""

    elif analysis_type == "original":
        # 원국 분석: 사주 원국 데이터만 상세히
        extra = f"""
    - 현재 나이: {current_age}세
    [원국 집중 분석 요청]
    - 일간(일주 천간) {pillars['day']['pillar'][0]}의 강약과 특성을 중심으로 분석
    - 사주 구성: 년({pillars['year']['pillar']}), 월({pillars['month']['pillar']}), 일({pillars['day']['pillar']}), 시({pillars['hour']['pillar']})
    - 오행 분포 균형과 용신/희신 분석
    - 십성 배치를 통한 성격, 적성, 관계 패턴 분석
    - 12운성과 신살의 원국 내 작용 분석"""

    elif analysis_type == "daeun":
        # 대운 분석: 전체 대운 + 현재 대운 강조
        fortune = data.get('fortune', {})
        f_list = fortune.get('list', [])
        current_daeun = _get_current_daeun(f_list, current_age)
        
        daeun_detail = "\n".join([
            f"    - {f.get('age','?')}세~ : {f.get('ganzhi','?')} ({f.get('stem_ten_god','')}/{f.get('twelve_growth','')})"
            for f in f_list
        ])
        
        extra = f"""
    - 현재 나이: {current_age}세
    - 대운 시작: {fortune.get('num', '?')}세 / {fortune.get('direction', '순행')}
    - 현재 대운 (★): {current_daeun.get('ganzhi', '?')} ({current_daeun.get('stem_ten_god', '')} / {current_daeun.get('twelve_growth', '')})
    [전체 대운 목록]
{daeun_detail}
    
    [분석 요청]
    현재 {current_age}세에 해당하는 대운 '{current_daeun.get('ganzhi', '')}' 대운을 중심으로, 이전 대운과의 변화, 현재 대운의 특성, 향후 대운의 흐름을 상세히 분석해 주세요."""

    elif analysis_type == "seyun":
        # 세운 분석: 올해 세운 데이터 상세
        fortune = data.get('fortune', {})
        f_list = fortune.get('list', [])
        current_daeun = _get_current_daeun(f_list, current_age)
        
        try:
            seyun = get_seyun_data(day_gan, year_branch, now.year, pillars=all_pillars, day_branch=day_branch)
        except Exception:
            seyun = {}
        
        # 전후 2년 세운도 포함
        try:
            seyun_list = get_seyun_list(day_gan, year_branch, now.year - 1, count=3, pillars=all_pillars, day_branch=day_branch)
        except Exception:
            seyun_list = []
        
        seyun_context = "\n".join([
            f"    - {s.get('year','?')}년: {s.get('ganzhi','?')} ({s.get('stem_ten_god','')}/{s.get('twelve_growth','')})"
            for s in seyun_list
        ])
        
        extra = f"""
    - 현재 나이: {current_age}세
    - 현재 대운: {current_daeun.get('ganzhi', '?')} ({current_daeun.get('stem_ten_god', '')} / {current_daeun.get('twelve_growth', '')})
    - ★ {now.year}년 세운: {seyun.get('ganzhi', '?')} ({seyun.get('stem_ten_god', '')} / {seyun.get('twelve_growth', '')} / 신살: {seyun.get('sinsal', '-')})
    [전후 세운 비교]
{seyun_context}
    
    [분석 요청]
    {now.year}년({seyun.get('ganzhi', '')}) 세운을 중심으로 올해의 운세를 상세 분석해 주세요.
    현재 대운({current_daeun.get('ganzhi', '')})과 세운의 상호작용, 원국과의 합충형파해 관계를 분석하고,
    올해 직업운, 재물운, 건강운, 인간관계를 구체적으로 풀어주세요."""

    elif analysis_type == "wolun":
        # 월운 분석: 이번 달 월운 데이터 상세
        fortune = data.get('fortune', {})
        f_list = fortune.get('list', [])
        current_daeun = _get_current_daeun(f_list, current_age)
        
        try:
            seyun = get_seyun_data(day_gan, year_branch, now.year, pillars=all_pillars, day_branch=day_branch)
        except Exception:
            seyun = {}
        try:
            wolun = get_wolun_data(day_gan, year_branch, pillars['year']['pillar'], now.month, pillars=all_pillars, day_branch=day_branch)
        except Exception:
            wolun = {}
        
        # 전후 월운도 포함
        wolun_context = ""
        for m in range(max(1, now.month - 1), min(13, now.month + 2)):
            try:
                wdata = get_wolun_data(day_gan, year_branch, pillars['year']['pillar'], m, pillars=all_pillars, day_branch=day_branch)
                marker = " ★" if m == now.month else ""
                wolun_context += f"    - {now.year}년 {m}월{marker}: {wdata.get('ganzhi','?')} ({wdata.get('stem_ten_god','')}/{wdata.get('twelve_growth','')}){chr(10)}"
            except Exception:
                pass
        
        extra = f"""
    - 현재 나이: {current_age}세
    - 현재 대운: {current_daeun.get('ganzhi', '?')} ({current_daeun.get('stem_ten_god', '')} / {current_daeun.get('twelve_growth', '')})
    - {now.year}년 세운: {seyun.get('ganzhi', '?')} ({seyun.get('stem_ten_god', '')} / {seyun.get('twelve_growth', '')})
    - ★ {now.year}년 {now.month}월 월운: {wolun.get('ganzhi', '?')} ({wolun.get('stem_ten_god', '')} / {wolun.get('twelve_growth', '')} / 신살: {wolun.get('sinsal', '-')})
    [전후 월운 비교]
{wolun_context}
    [분석 요청]
    {now.year}년 {now.month}월({wolun.get('ganzhi', '')}) 월운을 중심으로 이번 달의 운세를 상세 분석해 주세요.
    대운({current_daeun.get('ganzhi', '')}), 세운({seyun.get('ganzhi', '')}), 월운 3중 구조의 상호작용을 분석하고,
    이번 달에 특히 주의해야 할 점과 기회를 구체적으로 알려주세요."""
    
    return extra


async def run_ai_analysis(data: dict, analysis_type: str = "total", query: str = "", mode: str = "expert") -> str:
    """Gemini AI를 사용하여 사주 분석 수행"""
    if not GEMINI_API_KEY:
        return "⚠️ AI 분석 기능을 사용하려면 GOOGLE_API_KEY가 설정되어야 합니다."

    pillars = data['pillars']
    knowledge_context = load_knowledge_base(analysis_type)

    # 모드별 시스템 인스트럭션
    if mode == "simple":
        sys_instr = (
            "당신은 사주 명리학을 쉽고 친근하게 설명해주는 전문가입니다.\n\n"
            "작성 원칙:\n"
            "1. 명리학 전문 용어(십성, 12운성, 신살 등)를 사용하지 말고, 누구나 이해할 수 있는 일상적인 말로 바꿀어 설명하세요.\n"
            "2. '당신은 ~한 성격입니다', '올해는 ~한 해입니다' 처럼 구체적인 결과를 중심으로 설명하세요.\n"
            "3. '~하는 경향이 있다' 같은 모호한 표현 대신, 디테일하고 생생하게 설명해주세요.\n"
            "4. 예시를 들어 설명하면 더 좋습니다. (예: '창의적인 일이 잘 맞습니다' → '디자이너, 작가, 프리랜서 같은 일이 잘 맞습니다')\n"
            "5. 따뜻하고 친근한 반말체(해요체)를 사용하세요.\n"
            "6. 과도한 마크다운 강조(**)를 절대 사용하지 마세요.\n"
            "7. '한줄 요약 - 성격과 재능 - 직업과 돈 - 인간관계와 연애 - 건강 - 실천 팀' 구조로 작성하세요.\n"
            "8. 텔레그램에서 가독성이 좋도록 적절한 줄바꿈과 이모지를 사용하세요."
        )
    else:
        sys_instr = (
            "당신은 사주 명리학의 깊이 있는 통찰을 전하는 인격 고매한 대가입니다.\n"
            "지식 참조 원칙:\n"
            "1. 전체사주 및 원국 해석 시, 반드시 '[분석 대원칙 및 방향성 가이드]'로 명시된 '명리학 핵심 이론과 실전 분석 매뉴얼.pdf'의 해석 방향을 '최우선 대원칙'으로 삼으세요.\n"
            "2. 십성, 12운성, 신살 등 개별 항목의 구체적인 풀이는 해당 주제와 관련된 개별 PDF 소스의 상세 내용을 적극 인용하여 분석의 깊이를 더하세요.\n"
            "3. 대운/세운/월운 분석 시에는 '[시간 운세 분석 핵심 기준]'으로 명시된 정보를 절대적 기준으로 삼아 해석의 일관성을 유지하세요.\n\n"
            "스타일 및 구조:\n"
            "- 정중한 평서문 위주의 격식체를 사용하고, 과도한 마크다운 강조(**)를 절대 사용하지 마세요.\n"
            "- 반드시 '총평 - 데이터 기반 정밀 분석 - 실천적 개운법 - 대가의 한마디' 구조를 유지하세요.\n"
            "- 상담을 받는 듯한 따뜻하고 지혜로운 문체로 작성하세요.\n"
            "- 텔레그램에서 가독성이 좋도록 적절한 줄바꿈과 이모지를 사용하세요."
        )

    headers = {
        "total": "📜 전체 사주 보고서 - 삶의 총체적 흐름",
        "original": "🌿 사주 원국 정밀 해석 - 타고난 천명과 자아",
        "daeun": "🌊 대운 평생 운세 분석 - 거시적 환경의 변화",
        "seyun": f"📈 {datetime.datetime.now().year}년 세운 분석 - 올해의 가능성과 기회",
        "wolun": f"🗓️ {datetime.datetime.now().year}년 {datetime.datetime.now().month}월 월운 분석 - 이달의 지혜로운 처세",
    }
    report_header = headers.get(analysis_type, headers["total"])

    # 분석 유형별 추가 데이터
    type_specific = _build_type_specific_data(data, analysis_type)

    # 자유 질문 모드 vs 정식 분석 모드로 프롬프트 분기
    if query:
        # 자유 질문: 질문에만 집중, 원국 해석 반복 금지
        prompt = f"""
    [사용자의 사주 데이터 (참고용)]
    - 성함: {data.get('name', '사용자')}님
    - 명식: 년({pillars['year']['pillar']}), 월({pillars['month']['pillar']}), 일({pillars['day']['pillar']}), 시({pillars['hour']['pillar']})
    - 오행 분포: {data['five_elements']}
    - 십성 구성: 년({data['ten_gods']['year']}/{data['jiji_ten_gods']['year']}), 일(본인/{data['jiji_ten_gods']['day']})
    - 십이운성: {data['twelve_growth']}
    - 신살 및 상호관계: {data.get('sinsal', '없음')}, {data.get('relations', '특이사항 없음')}
    {type_specific}

    [제공된 전문 지식 베이스]
    {knowledge_context}

    [사용자 질문]
    "{query}"

    [답변 규칙]
    1. 사용자의 질문에만 집중하여 답변하세요. 원국(사주 기본 해석)은 이미 제공되었으니 절대 반복하지 마세요.
    2. 질문에 직접 관련된 내용만 구체적으로 풀어주세요.
    3. 궁합 질문인 경우:
       - 사용자가 상대방의 생년월일시를 알려주면, 상대방의 사주를 간략히 알려주고(간지, 오행 분포 등) 두 사람의 궁합을 풀이해주세요.
       - 사용자가 상대방 정보를 주지 않으면, "상대방의 생년월일시를 알려주시면 더 정확한 궁합 분석이 가능합니다"라고 안내하되, 사용자의 사주 특성상 잘 맞는 유형과 주의할 유형을 일반적으로 설명해주세요.
    4. 텔레그램에서 가독성이 좋도록 적절한 줄바꿈과 이모지를 사용하세요.
    """
    else:
        # 정식 분석: 기존 리포트 형식
        prompt = f"""
    {report_header}
    
    [제공된 전문 지식 베이스]
    {knowledge_context}
    
    [분석 대상자 기본 데이터]
    - 성함: {data.get('name', '사용자')}님
    - 명식: 년({pillars['year']['pillar']}), 월({pillars['month']['pillar']}), 일({pillars['day']['pillar']}), 시({pillars['hour']['pillar']})
    - 오행 분포: {data['five_elements']}
    - 십성 구성: 년({data['ten_gods']['year']}/{data['jiji_ten_gods']['year']}), 일(본인/{data['jiji_ten_gods']['day']})
    - 십이운성: {data['twelve_growth']}
    - 신살 및 상호관계: {data.get('sinsal', '없음')}, {data.get('relations', '특이사항 없음')}
    {type_specific}

    [대가의 리포트 작성 가이드]
    1. 지식 베이스에서 명시된 '분석 대원칙'에 따라 전체적인 해석의 톤을 잡으세요.
    2. 개별 데이터(신살, 운성 등)에 대해서는 관련 PDF의 상세 설명을 인용하여 '근거 있는 분석'을 제시하세요.
    3. 문학적 비유를 곁들여 읽는 이의 마음을 어루만지는 품격 있는 결과물을 도출하세요.
    """

    # 모델 우선순위
    priority_models = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash']

    if not client:
        return "⚠️ AI 분석 기능을 사용하려면 GOOGLE_API_KEY가 설정되어야 합니다."

    response = None
    error_msg = ""

    for model_name in priority_models:
        try:
            logger.info(f"AI 분석 시도: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    system_instruction=sys_instr,
                ),
            )
            if response and response.text:
                break
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"모델 {model_name} 실패: {error_msg}")
            if "429" in error_msg or "quota" in error_msg.lower():
                logger.info(f"429 에러 - 40초 대기 후 재시도...")
                await asyncio.sleep(40)
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=genai.types.GenerateContentConfig(
                            system_instruction=sys_instr,
                        ),
                    )
                    if response and response.text:
                        break
                except Exception as e2:
                    error_msg = str(e2)
                    logger.warning(f"재시도 실패: {error_msg}")
                    continue
            else:
                continue

    if not response or not response.text:
        return f"⚠️ AI 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.\n(에러: {error_msg})"

    result_text = response.text.replace('**', '')
    return result_text


# ─── 명령 핸들러 ─────────────────────────────────────────
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """환영 메시지"""
    welcome = (
        "🔮 사주 명리학 AI 봇에 오신 것을 환영합니다!\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "이 봇은 당신의 생년월일시를 바탕으로\n"
        "사주(四柱)를 분석하고 AI가 깊이 있는\n"
        "명리학적 통찰을 제공합니다.\n\n"
        "📌 사용법\n"
        "  /saju  — 사주 분석 시작\n"
        "  /term [용어]  — 사주 용어 조회\n"
        "  /help  — 도움말 보기\n\n"
        "지금 바로 /saju 를 입력해보세요! ✨"
    )
    await update.message.reply_text(welcome)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """도움말"""
    help_text = (
        "📖 도움말\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "🔮 /saju\n"
        "  사주 분석을 시작합니다.\n"
        "  이름, 성별, 생년월일시를 순서대로 입력하면\n"
        "  사주를 계산하고 AI 분석을 받을 수 있습니다.\n\n"
        "📚 /term [용어]\n"
        "  사주 용어 설명을 조회합니다.\n"
        "  예: /term 비견, /term 정관, /term 식신\n\n"
        "❌ /cancel\n"
        "  진행 중인 대화를 취소합니다.\n\n"
        "💡 Tip: 사주 분석 후 나타나는 버튼으로\n"
        "  다양한 AI 분석(원국/대운/세운/월운)을\n"
        "  받아볼 수 있어요!"
    )
    await update.message.reply_text(help_text)


async def term_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """용어 조회"""
    if not context.args:
        await update.message.reply_text(
            "📚 사용법: /term [용어]\n"
            "예: /term 비견, /term 정관, /term 목욕\n\n"
            "조회 가능한 주요 용어:\n"
            "십성: 비견, 겁재, 식신, 상관, 편재, 정재, 편관, 정관, 편인, 정인\n"
            "12운성: 장생, 목욕, 관대, 건록, 제왕, 쇠, 병, 사, 묘, 절, 태, 양\n"
            "천간: 갑, 을, 병, 정, 무, 기, 경, 신, 임, 계\n"
            "지지: 자, 축, 인, 묘, 진, 사, 오, 미, 신, 유, 술, 해"
        )
        return

    term = " ".join(context.args)
    desc = SAJU_TERMS.get(term)
    if desc:
        await update.message.reply_text(f"📚 {term}\n\n{desc}")
    else:
        # 부분 매칭 시도
        matches = [k for k in SAJU_TERMS if term in k]
        if matches:
            result = f"📚 '{term}' 관련 용어:\n\n"
            for m in matches[:5]:
                result += f"• {m}: {SAJU_TERMS[m]}\n\n"
            await update.message.reply_text(result)
        else:
            await update.message.reply_text(f"❓ '{term}'에 대한 설명을 찾을 수 없습니다.\n/term 으로 조회 가능한 용어 목록을 확인해보세요.")


# ─── 사주 대화 핸들러 (ConversationHandler) ──────────────
async def saju_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """사주 대화 시작 - 이름 입력"""
    await update.message.reply_text(
        "🔮 사주 분석을 시작합니다!\n\n"
        "먼저, 이름을 입력해주세요.\n"
        "(예: 홍길동)",
        reply_markup=ReplyKeyboardRemove(),
    )
    return NAME


async def name_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """이름 수신 → 성별 선택"""
    context.user_data["name"] = update.message.text.strip()
    keyboard = [["남", "여"]]
    await update.message.reply_text(
        f"안녕하세요, {context.user_data['name']}님!\n\n"
        "성별을 선택해주세요.",
        reply_markup=ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True),
    )
    return GENDER


async def gender_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """성별 수신 → 역법 선택"""
    gender = update.message.text.strip()
    if gender not in ("남", "여"):
        await update.message.reply_text("남 또는 여 중에서 선택해주세요.")
        return GENDER
    context.user_data["gender"] = gender
    keyboard = [["양력", "음력"]]
    await update.message.reply_text(
        "양력 / 음력을 선택해주세요.",
        reply_markup=ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True),
    )
    return CALENDAR


async def calendar_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """역법 수신 → 생년 입력"""
    cal = update.message.text.strip()
    if cal not in ("양력", "음력"):
        await update.message.reply_text("양력 또는 음력 중에서 선택해주세요.")
        return CALENDAR
    context.user_data["calendar_type"] = cal
    await update.message.reply_text(
        "태어난 연도를 4자리로 입력해주세요.\n"
        "(예: 1990)",
        reply_markup=ReplyKeyboardRemove(),
    )
    return YEAR


async def year_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """생년 수신 → 월 입력"""
    try:
        year = int(update.message.text.strip())
        if year < 1900 or year > 2100:
            await update.message.reply_text("1900~2100 사이의 연도를 입력해주세요.")
            return YEAR
        context.user_data["year"] = year
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요.\n(예: 1990)")
        return YEAR

    await update.message.reply_text("태어난 월을 입력해주세요.\n(예: 3)")
    return MONTH


async def month_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """월 수신 → 일 입력"""
    try:
        month = int(update.message.text.strip())
        if month < 1 or month > 12:
            await update.message.reply_text("1~12 사이의 월을 입력해주세요.")
            return MONTH
        context.user_data["month"] = month
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요.\n(예: 3)")
        return MONTH

    await update.message.reply_text("태어난 일을 입력해주세요.\n(예: 15)")
    return DAY


async def day_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """일 수신 → 시 입력"""
    try:
        day = int(update.message.text.strip())
        if day < 1 or day > 31:
            await update.message.reply_text("1~31 사이의 일을 입력해주세요.")
            return DAY
        context.user_data["day"] = day
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요.\n(예: 15)")
        return DAY

    await update.message.reply_text(
        "태어난 시(시간)를 입력해주세요.\n"
        "(예: 14 → 오후 2시)\n"
        "모르시면 0을 입력해주세요."
    )
    return HOUR


async def hour_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """시 수신 → 분 입력"""
    try:
        hour = int(update.message.text.strip())
        if hour < 0 or hour > 23:
            await update.message.reply_text("0~23 사이의 시간을 입력해주세요.")
            return HOUR
        context.user_data["hour"] = hour
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요.\n(예: 14)")
        return HOUR

    await update.message.reply_text(
        "태어난 분을 입력해주세요.\n"
        "(예: 30)\n"
        "모르시면 0을 입력해주세요."
    )
    return MINUTE


async def minute_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """분 수신 → 사주 계산 실행"""
    try:
        minute = int(update.message.text.strip())
        if minute < 0 or minute > 59:
            await update.message.reply_text("0~59 사이의 분을 입력해주세요.")
            return MINUTE
        context.user_data["minute"] = minute
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요.\n(예: 30)")
        return MINUTE

    # 계산 시작 알림
    await update.message.reply_text("🔮 사주를 계산하고 있습니다... 잠시만 기다려주세요.")

    try:
        ud = context.user_data
        b_year, b_month, b_day = ud["year"], ud["month"], ud["day"]
        b_hour, b_minute = ud["hour"], ud["minute"]

        # 사주 계산
        saju_res = calc.calculate_saju(
            b_year, b_month, b_day,
            b_hour, b_minute,
            use_solar_time=True,
            longitude=127.5,
            early_zi_time=False,
        )

        # 음력 보정
        if ud["calendar_type"] == "음력":
            solar_res = lunar_to_solar(b_year, b_month, b_day, is_leap_month=False)
            y = solar_res['solar_year']
            m = solar_res['solar_month']
            d = solar_res['solar_day']
            saju_res = calc.calculate_saju(
                y, m, d, b_hour, b_minute,
                use_solar_time=True, longitude=127.5, early_zi_time=False,
            )

        details = get_saju_details(saju_res)
        details = get_extended_saju_data(details, gender=ud["gender"])
        details["name"] = ud["name"]
        details["birth_year"] = b_year  # 나이 계산용 생년 저장

        # 사주 데이터 저장 (AI 분석용)
        context.user_data["saju_data"] = details

        # 결과 포매팅 및 전송
        result_msg = format_saju_result(details)
        await update.message.reply_text(result_msg)

        # AI 분석 버튼 제공 (전문가/일반 모드)
        keyboard = [
            [
                InlineKeyboardButton("📜 전체 분석", callback_data="analysis_expert_total"),
                InlineKeyboardButton("🌿 원국 분석", callback_data="analysis_expert_original"),
            ],
            [
                InlineKeyboardButton("🌊 대운 분석", callback_data="analysis_expert_daeun"),
                InlineKeyboardButton("📈 세운 분석", callback_data="analysis_expert_seyun"),
            ],
            [
                InlineKeyboardButton("🗓️ 월운 분석", callback_data="analysis_expert_wolun"),
            ],
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "🧑‍🏫 전문가 해석 (명리학 전문 용어 포함)",
            reply_markup=reply_markup,
        )

        # 일반 모드 버튼
        keyboard_simple = [
            [
                InlineKeyboardButton("📜 전체 분석", callback_data="analysis_simple_total"),
                InlineKeyboardButton("🌿 원국 분석", callback_data="analysis_simple_original"),
            ],
            [
                InlineKeyboardButton("🌊 대운 분석", callback_data="analysis_simple_daeun"),
                InlineKeyboardButton("📈 세운 분석", callback_data="analysis_simple_seyun"),
            ],
            [
                InlineKeyboardButton("🗓️ 월운 분석", callback_data="analysis_simple_wolun"),
            ],
        ]
        reply_markup_simple = InlineKeyboardMarkup(keyboard_simple)
        await update.message.reply_text(
            "😊 일반 해석 (쉬운 말로 설명)",
            reply_markup=reply_markup_simple,
        )

        # 궁합 버튼
        keyboard_gunghap = [[
            InlineKeyboardButton("💕 궁합 분석", callback_data="start_gunghap"),
        ]]
        await update.message.reply_text(
            "💑 상대방과의 궁합을 보고 싶다면?",
            reply_markup=InlineKeyboardMarkup(keyboard_gunghap),
        )

        # 미니 앱 (Web App) 버튼 (HTTPS 프로토콜 필수)
        if WEBAPP_URL:
            # 추후 WEBAPP_URL에 유저 생년월일시 파라미터를 넘기도록 연동할 수 있음
            keyboard_webapp = [[
                InlineKeyboardButton("📱 웹에서 전체 사주표 보기", web_app=WebAppInfo(url=WEBAPP_URL)),
            ]]
            await update.message.reply_text(
                "더욱 상세하고 보기 좋은 사주/운세 그래프를 미니 앱으로 확인해보세요! ✨",
                reply_markup=InlineKeyboardMarkup(keyboard_webapp),
            )

    except Exception as e:
        logger.error(f"사주 계산 오류: {e}", exc_info=True)
        await update.message.reply_text(
            f"⚠️ 사주 계산 중 오류가 발생했습니다.\n"
            f"입력 정보를 확인 후 다시 시도해주세요.\n\n"
            f"오류: {str(e)}"
        )

    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """대화 취소"""
    await update.message.reply_text(
        "❌ 사주 분석이 취소되었습니다.\n"
        "다시 시작하려면 /saju 를 입력해주세요.",
        reply_markup=ReplyKeyboardRemove(),
    )
    return ConversationHandler.END


# ─── AI 분석 버튼 생성 헬퍼 ───────────────────────
def _make_analysis_buttons(mode: str) -> list:
    """분석 유형 버튼 생성"""
    return [
        [
            InlineKeyboardButton("📜 전체 분석", callback_data=f"analysis_{mode}_total"),
            InlineKeyboardButton("🌿 원국 분석", callback_data=f"analysis_{mode}_original"),
        ],
        [
            InlineKeyboardButton("🌊 대운 분석", callback_data=f"analysis_{mode}_daeun"),
            InlineKeyboardButton("📈 세운 분석", callback_data=f"analysis_{mode}_seyun"),
        ],
        [
            InlineKeyboardButton("🗓️ 월운 분석", callback_data=f"analysis_{mode}_wolun"),
        ],
    ]


# ─── AI 분석 콜백 핸들러 ─────────────────────
async def analysis_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """인라인 버튼 클릭 시 AI 분석 수행"""
    query = update.callback_query
    await query.answer()

    saju_data = context.user_data.get("saju_data")
    if not saju_data:
        await query.edit_message_text("⚠️ 사주 데이터가 없습니다. /saju 로 먼저 사주를 계산해주세요.")
        return

    # 분석 타입 및 모드 파싱 (e.g., "analysis_expert_total" → mode="expert", type="total")
    callback_data = query.data
    parts = callback_data.replace("analysis_", "").split("_", 1)
    if len(parts) == 2:
        mode, analysis_type = parts[0], parts[1]
    else:
        mode, analysis_type = "expert", parts[0]

    type_names = {
        "total": "전체 사주",
        "original": "원국",
        "daeun": "대운",
        "seyun": "세운",
        "wolun": "월운",
    }
    mode_name = "🧑‍🏫 전문가" if mode == "expert" else "😊 일반"
    type_name = type_names.get(analysis_type, "전체 사주")

    await query.edit_message_text(f"🤖 [{mode_name}] {type_name} AI 분석을 진행하고 있습니다...\n⏳ 약 30초~1분 정도 소요됩니다.")

    # 마지막 사용 모드 저장 (자유 질문 시 유지)
    context.user_data["last_mode"] = mode

    try:
        result = await run_ai_analysis(saju_data, analysis_type=analysis_type, mode=mode)

        # 텔레그램 메시지 길이 제한 (4096자) 대응
        if len(result) <= 4096:
            await query.message.reply_text(result)
        else:
            # 긴 메시지를 분할 전송
            chunks = [result[i:i + 4000] for i in range(0, len(result), 4000)]
            for i, chunk in enumerate(chunks):
                prefix = f"📜 ({i + 1}/{len(chunks)})\n\n" if len(chunks) > 1 else ""
                await query.message.reply_text(prefix + chunk)

        # 다시 분석 버튼 제공 (같은 모드 유지)
        reply_markup = InlineKeyboardMarkup(_make_analysis_buttons(mode))
        other_mode = "simple" if mode == "expert" else "expert"
        other_label = "😊 일반 해석으로 보기" if mode == "expert" else "🧑‍🏫 전문가 해석으로 보기"
        other_markup = InlineKeyboardMarkup(_make_analysis_buttons(other_mode))
        
        await query.message.reply_text(
            f"🔮 다른 분석도 받아보세요! ({mode_name} 모드)",
            reply_markup=reply_markup,
        )
        await query.message.reply_text(
            f"🔄 {other_label}",
            reply_markup=other_markup,
        )

    except Exception as e:
        logger.error(f"AI 분석 오류: {e}", exc_info=True)
        await query.message.reply_text(
            f"⚠️ AI 분석 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.\n\n오류: {str(e)}"
        )


# ─── 생년월일시 파싱 헬퍼 ─────────────────────────────────
import re

def _parse_birth_info(text: str) -> dict:
    """텍스트에서 생년월일시를 추출 (다양한 형식 지원)"""
    result = {}
    
    # 년도 추출: 1900~2099
    year_match = re.search(r'(19\d{2}|20\d{2})\s*년', text)
    if year_match:
        result['year'] = int(year_match.group(1))
    
    # 월 추출
    month_match = re.search(r'(\d{1,2})\s*월', text)
    if month_match:
        m = int(month_match.group(1))
        if 1 <= m <= 12:
            result['month'] = m
    
    # 일 추출
    day_match = re.search(r'(\d{1,2})\s*일', text)
    if day_match:
        d = int(day_match.group(1))
        if 1 <= d <= 31:
            result['day'] = d
    
    # 시간 추출: "20시", "오후 8시", "오전 10시", "8시"
    hour = None
    pm_match = re.search(r'오후\s*(\d{1,2})\s*시', text)
    am_match = re.search(r'오전\s*(\d{1,2})\s*시', text)
    plain_hour = re.search(r'(\d{1,2})\s*시', text)
    
    if pm_match:
        h = int(pm_match.group(1))
        hour = h + 12 if h < 12 else h
    elif am_match:
        h = int(am_match.group(1))
        hour = 0 if h == 12 else h
    elif plain_hour:
        hour = int(plain_hour.group(1))
    
    if hour is not None and 0 <= hour <= 23:
        result['hour'] = hour
    
    # 성별 추출
    if '여' in text or '여자' in text or '여성' in text:
        result['gender'] = '여'
    elif '남' in text or '남자' in text or '남성' in text:
        result['gender'] = '남'
    
    return result


def _calculate_partner_saju(birth_info: dict) -> dict:
    """파싱된 생년월일시로 상대방 사주를 계산"""
    try:
        year = birth_info.get('year')
        month = birth_info.get('month')
        day = birth_info.get('day')
        hour = birth_info.get('hour', 12)  # 모르면 정오 기본
        gender = birth_info.get('gender', '')
        
        if not all([year, month, day]):
            return {}
        
        saju_res = calc.calculate_saju(
            year, month, day, hour, 0,
            use_solar_time=True, longitude=127.5, early_zi_time=False,
        )
        
        details = get_saju_details(saju_res)
        details = get_extended_saju_data(details, gender=gender)
        details['birth_year'] = year
        
        return details
    except Exception as e:
        logger.warning(f"상대방 사주 계산 실패: {e}")
        return {}


def _format_partner_saju_summary(details: dict, birth_info: dict) -> str:
    """상대방 사주 요약 포매팅"""
    if not details:
        return ""
    
    pillars = details.get('pillars', {})
    five_el = details.get('five_elements', {})
    
    gender_str = birth_info.get('gender', '미상')
    year = birth_info.get('year', '?')
    month = birth_info.get('month', '?')
    day = birth_info.get('day', '?')
    hour = birth_info.get('hour', '미상')
    
    el_str = ", ".join([f"{k}:{v}" for k, v in five_el.items()])
    
    return f"""
    [상대방 사주 데이터 (sajupy 계산기로 정확히 산출)]
    - 생년월일시: {year}년 {month}월 {day}일 {hour}시 / 성별: {gender_str}
    - 명식: 년({pillars.get('year', {}).get('pillar', '?')}), 월({pillars.get('month', {}).get('pillar', '?')}), 일({pillars.get('day', {}).get('pillar', '?')}), 시({pillars.get('hour', {}).get('pillar', '?')})
    - 오행 분포: {el_str}
    - 십성: 년({details.get('ten_gods', {}).get('year', '')}), 일(본인)
    - 십이운성: {details.get('twelve_growth', {})}
    - 신살: {details.get('sinsal', '없음')}
    """


# ─── 자유 텍스트 질문 핸들러 ─────────────────────────────
async def free_question_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """사주 데이터가 있을 때 자유 텍스트 질문 처리 (궁합, 직업운 등)"""
    saju_data = context.user_data.get("saju_data")
    if not saju_data:
        await update.message.reply_text(
            "🔮 아직 사주 데이터가 없습니다!\n"
            "/saju 를 입력하여 먼저 사주를 계산해주세요.\n\n"
            "사주 계산 후 자유롭게 질문하실 수 있습니다.\n"
            "(예: 궁합, 이직 시기, 재물운 등)"
        )
        return
    
    user_text = update.message.text.strip()
    if not user_text or len(user_text) < 2:
        return
    
    # 자유 질문은 일반(simple) 모드를 기본으로 사용
    mode = context.user_data.get("last_mode", "simple")
    mode_name = "🧑‍🏫 전문가" if mode == "expert" else "😊 일반"
    
    # 생년월일시 파싱 시도 (상대방 사주 계산용)
    birth_info = _parse_birth_info(user_text)
    partner_saju_text = ""
    
    if birth_info.get('year') and birth_info.get('month') and birth_info.get('day'):
        await update.message.reply_text(
            f"🔍 상대방 생년월일 감지! 사주를 계산하고 있습니다...\n"
            f"   {birth_info.get('year')}년 {birth_info.get('month')}월 {birth_info.get('day')}일 {birth_info.get('hour', '미상')}시"
        )
        partner_details = _calculate_partner_saju(birth_info)
        if partner_details:
            partner_saju_text = _format_partner_saju_summary(partner_details, birth_info)
    
    await update.message.reply_text(
        f"🤖 [{mode_name}] '{user_text}'에 대해 AI 분석을 진행합니다...\n⏳ 약 30초~1분 정도 소요됩니다."
    )
    
    # 상대방 사주가 있으면 query에 추가
    enriched_query = user_text
    if partner_saju_text:
        enriched_query = f"{user_text}\n\n{partner_saju_text}\n\n[중요] 위 상대방 사주 데이터는 sajupy 계산기로 정확히 산출한 것입니다. AI가 사주를 추측하지 말고 이 데이터를 그대로 사용하여 분석하세요."
    
    try:
        result = await run_ai_analysis(
            saju_data,
            analysis_type="total",
            query=enriched_query,
            mode=mode,
        )
        
        if len(result) <= 4096:
            await update.message.reply_text(result)
        else:
            chunks = [result[i:i + 4000] for i in range(0, len(result), 4000)]
            for i, chunk in enumerate(chunks):
                prefix = f"📜 ({i + 1}/{len(chunks)})\n\n" if len(chunks) > 1 else ""
                await update.message.reply_text(prefix + chunk)
        
        # 분석 버튼 다시 제공
        reply_markup_expert = InlineKeyboardMarkup(_make_analysis_buttons("expert"))
        reply_markup_simple = InlineKeyboardMarkup(_make_analysis_buttons("simple"))
        await update.message.reply_text(
            "🧑‍🏫 전문가 해석으로 분석 받기",
            reply_markup=reply_markup_expert,
        )
        await update.message.reply_text(
            "😊 일반 해석으로 분석 받기",
            reply_markup=reply_markup_simple,
        )

    except Exception as e:
        logger.error(f"자유 질문 분석 오류: {e}", exc_info=True)
        await update.message.reply_text(
            f"⚠️ AI 분석 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.\n\n오류: {str(e)}"
        )


# ─── 궁합 대화 핸들러 ───────────────────────────────
async def gunghap_start_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """궁합 버튼 클릭 시 궁합 대화 시작"""
    query = update.callback_query
    await query.answer()

    saju_data = context.user_data.get("saju_data")
    if not saju_data:
        await query.edit_message_text("⚠️ 사주 데이터가 없습니다. /saju 로 먼저 사주를 계산해주세요.")
        return

    await query.edit_message_text(
        "💕 궁합 분석을 시작합니다!\n"
        "상대방의 정보를 입력해주세요.\n\n"
        "💬 /gunghap 을 입력해주세요."
    )


async def gunghap_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """궁합 대화 시작"""
    saju_data = context.user_data.get("saju_data")
    if not saju_data:
        await update.message.reply_text(
            "⚠️ 먼저 /saju 로 본인의 사주를 계산해주세요.\n"
            "사주 계산 후 궁합 분석이 가능합니다."
        )
        return ConversationHandler.END

    keyboard = [["남자", "여자"]]
    await update.message.reply_text(
        "💕 궁합 분석을 시작합니다!\n\n"
        "상대방의 성별을 선택해주세요.",
        reply_markup=ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True),
    )
    return GH_GENDER


async def gh_gender_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """상대방 성별 수신"""
    gender = update.message.text.strip()
    if gender not in ("남자", "여자"):
        await update.message.reply_text("남자 또는 여자 중에서 선택해주세요.")
        return GH_GENDER
    context.user_data["gh_gender"] = "남" if gender == "남자" else "여"

    keyboard = [["양력", "음력"]]
    await update.message.reply_text(
        "상대방의 역법을 선택해주세요.",
        reply_markup=ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True),
    )
    return GH_CALENDAR


async def gh_calendar_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """상대방 역법 수신"""
    cal = update.message.text.strip()
    if cal not in ("양력", "음력"):
        await update.message.reply_text("양력 또는 음력 중에서 선택해주세요.")
        return GH_CALENDAR
    context.user_data["gh_calendar"] = cal
    await update.message.reply_text(
        "상대방의 태어난 연도를 4자리로 입력해주세요.\n(예: 1990)",
        reply_markup=ReplyKeyboardRemove(),
    )
    return GH_YEAR


async def gh_year_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        year = int(update.message.text.strip())
        if year < 1900 or year > 2100:
            await update.message.reply_text("1900~2100 사이의 연도를 입력해주세요.")
            return GH_YEAR
        context.user_data["gh_year"] = year
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요. (예: 1990)")
        return GH_YEAR
    await update.message.reply_text("상대방의 태어난 월을 입력해주세요.\n(예: 3)")
    return GH_MONTH


async def gh_month_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        month = int(update.message.text.strip())
        if month < 1 or month > 12:
            await update.message.reply_text("1~12 사이의 월을 입력해주세요.")
            return GH_MONTH
        context.user_data["gh_month"] = month
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요. (예: 3)")
        return GH_MONTH
    await update.message.reply_text("상대방의 태어난 일을 입력해주세요.\n(예: 15)")
    return GH_DAY


async def gh_day_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        day = int(update.message.text.strip())
        if day < 1 or day > 31:
            await update.message.reply_text("1~31 사이의 일을 입력해주세요.")
            return GH_DAY
        context.user_data["gh_day"] = day
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요. (예: 15)")
        return GH_DAY
    await update.message.reply_text(
        "상대방의 태어난 시(시간)를 입력해주세요.\n"
        "(예: 14 → 오후 2시)\n"
        "모르시면 0을 입력해주세요."
    )
    return GH_HOUR


async def gh_hour_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        hour = int(update.message.text.strip())
        if hour < 0 or hour > 23:
            await update.message.reply_text("0~23 사이의 시간을 입력해주세요.")
            return GH_HOUR
        context.user_data["gh_hour"] = hour
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요. (예: 14)")
        return GH_HOUR
    await update.message.reply_text(
        "상대방의 태어난 분을 입력해주세요.\n"
        "(예: 30)\n"
        "모르시면 0을 입력해주세요."
    )
    return GH_MINUTE


async def gh_minute_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """상대방 정보 완료 → 궁합 분석 실행"""
    try:
        minute = int(update.message.text.strip())
        if minute < 0 or minute > 59:
            await update.message.reply_text("0~59 사이의 분을 입력해주세요.")
            return GH_MINUTE
        context.user_data["gh_minute"] = minute
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요. (예: 30)")
        return GH_MINUTE

    await update.message.reply_text(
        "💕 궁합을 분석하고 있습니다... 잠시만 기다려주세요.\n"
        "⏳ 약 30초~1분 정도 소요됩니다.",
        reply_markup=ReplyKeyboardRemove(),
    )

    try:
        ud = context.user_data
        gh_year = ud["gh_year"]
        gh_month = ud["gh_month"]
        gh_day = ud["gh_day"]
        gh_hour = ud["gh_hour"]
        gh_minute = ud["gh_minute"]
        gh_gender = ud["gh_gender"]
        gh_calendar = ud["gh_calendar"]

        # 상대방 사주 계산
        if gh_calendar == "음력":
            solar_res = lunar_to_solar(gh_year, gh_month, gh_day, is_leap_month=False)
            gh_year = solar_res['solar_year']
            gh_month = solar_res['solar_month']
            gh_day = solar_res['solar_day']

        partner_saju = calc.calculate_saju(
            gh_year, gh_month, gh_day, gh_hour, gh_minute,
            use_solar_time=True, longitude=127.5, early_zi_time=False,
        )
        partner_details = get_saju_details(partner_saju)
        partner_details = get_extended_saju_data(partner_details, gender=gh_gender)
        partner_details['birth_year'] = ud.get('gh_year', gh_year)

        # 상대방 사주 요약 표시
        p_pillars = partner_details.get('pillars', {})
        p_five_el = partner_details.get('five_elements', {})
        p_el_str = "  ".join([f"{ELEMENT_EMOJI.get(k, '')} {k}: {v}" for k, v in p_five_el.items()])

        partner_summary = (
            f"💕 상대방 사주 명식\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"성별: {gh_gender}\n"
            f"명식: 년({p_pillars.get('year', {}).get('pillar', '?')}), "
            f"월({p_pillars.get('month', {}).get('pillar', '?')}), "
            f"일({p_pillars.get('day', {}).get('pillar', '?')}), "
            f"시({p_pillars.get('hour', {}).get('pillar', '?')})\n"
            f"오행: {p_el_str}\n"
            f"━━━━━━━━━━━━━━━━━━━━"
        )
        await update.message.reply_text(partner_summary)

        # 궁합 AI 분석 실행
        my_data = context.user_data.get("saju_data", {})
        my_pillars = my_data.get('pillars', {})

        mode = context.user_data.get("last_mode", "simple")

        gunghap_query = f"""
        [궁합 분석 요청]

        [본인 사주]
        - 성함: {my_data.get('name', '사용자')}님
        - 명식: 년({my_pillars.get('year', {}).get('pillar', '?')}), 월({my_pillars.get('month', {}).get('pillar', '?')}), 일({my_pillars.get('day', {}).get('pillar', '?')}), 시({my_pillars.get('hour', {}).get('pillar', '?')})
        - 오행 분포: {my_data.get('five_elements', {})}
        - 십성: {my_data.get('ten_gods', {})}
        - 십이운성: {my_data.get('twelve_growth', {})}

        [상대방 사주 (sajupy 계산기로 정확히 산출)]
        - 성별: {gh_gender}
        - 명식: 년({p_pillars.get('year', {}).get('pillar', '?')}), 월({p_pillars.get('month', {}).get('pillar', '?')}), 일({p_pillars.get('day', {}).get('pillar', '?')}), 시({p_pillars.get('hour', {}).get('pillar', '?')})
        - 오행 분포: {p_five_el}
        - 십성: {partner_details.get('ten_gods', {})}
        - 십이운성: {partner_details.get('twelve_growth', {})}
        - 신살: {partner_details.get('sinsal', '없음')}

        [분석 요청]
        두 사람의 사주를 바탕으로 궁합을 상세 분석해주세요.
        1. 일간(日干) 궁합: 두 사람의 일간 관계 (합, 충, 생, 극)
        2. 오행 보완: 서로의 오행이 어떻게 보완/충돌하는지
        3. 십성 궁합: 서로에 대한 십성 관계
        4. 종합 궁합 점수 (100점 기준)
        5. 관계에서 주의할 점과 잘 맞는 점
        6. 실천적 조언

        [중요] 위 사주 데이터는 sajupy 계산기로 정확히 산출한 것입니다.
        AI가 사주를 추측하지 말고 이 데이터를 그대로 사용하세요.
        """

        result = await run_ai_analysis(
            my_data,
            analysis_type="total",
            query=gunghap_query,
            mode=mode,
        )

        # 결과 전송
        if len(result) <= 4096:
            await update.message.reply_text(result)
        else:
            chunks = [result[i:i + 4000] for i in range(0, len(result), 4000)]
            for i, chunk in enumerate(chunks):
                prefix = f"💕 ({i + 1}/{len(chunks)})\n\n" if len(chunks) > 1 else ""
                await update.message.reply_text(prefix + chunk)

        # 다시 궁합/분석 버튼
        keyboard_again = [
            [InlineKeyboardButton("💕 다른 사람과 궁합 보기", callback_data="start_gunghap")],
        ]
        reply_markup_expert = InlineKeyboardMarkup(_make_analysis_buttons("expert"))
        reply_markup_simple = InlineKeyboardMarkup(_make_analysis_buttons("simple"))

        await update.message.reply_text(
            "🔮 궁합 분석이 완료되었습니다!",
            reply_markup=InlineKeyboardMarkup(keyboard_again),
        )
        await update.message.reply_text(
            "🧑‍🏫 전문가 해석",
            reply_markup=reply_markup_expert,
        )
        await update.message.reply_text(
            "😊 일반 해석",
            reply_markup=reply_markup_simple,
        )

    except Exception as e:
        logger.error(f"궁합 계산 오류: {e}", exc_info=True)
        await update.message.reply_text(
            f"⚠️ 궁합 분석 중 오류가 발생했습니다.\n"
            f"입력 정보를 확인 후 다시 시도해주세요.\n\n"
            f"오류: {str(e)}"
        )

    return ConversationHandler.END


async def gh_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """궁합 대화 취소"""
    await update.message.reply_text(
        "❌ 궁합 분석이 취소되었습니다.\n"
        "다시 시작하려면 /gunghap 을 입력해주세요.",
        reply_markup=ReplyKeyboardRemove(),
    )
    return ConversationHandler.END


# ─── 에러 핸들러 ──────────────────────────────────────────
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """에러 로깅"""
    logger.error(f"예외 발생: {context.error}", exc_info=context.error)
    if update and hasattr(update, 'message') and update.message:
        await update.message.reply_text(
            f"⚠️ 오류가 발생했습니다. 다시 시도해주세요.\n오류: {str(context.error)}"
        )


# ─── 메인 ──────────────────────────────────────────────
def main():
    """봇 시작"""
    if not TELEGRAM_BOT_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN 환경 변수가 설정되지 않았습니다.")
        print("   .env 파일에 TELEGRAM_BOT_TOKEN=your_token 을 추가해주세요.")
        print("   토큰은 텔레그램 @BotFather에서 /newbot 명령으로 발급받을 수 있습니다.")
        return

    # Application 생성
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # 사주 대화 핸들러
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("saju", saju_start)],
        states={
            NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, name_received)],
            GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, gender_received)],
            CALENDAR: [MessageHandler(filters.TEXT & ~filters.COMMAND, calendar_received)],
            YEAR: [MessageHandler(filters.TEXT & ~filters.COMMAND, year_received)],
            MONTH: [MessageHandler(filters.TEXT & ~filters.COMMAND, month_received)],
            DAY: [MessageHandler(filters.TEXT & ~filters.COMMAND, day_received)],
            HOUR: [MessageHandler(filters.TEXT & ~filters.COMMAND, hour_received)],
            MINUTE: [MessageHandler(filters.TEXT & ~filters.COMMAND, minute_received)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    # 핸들러 등록
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("term", term_command))
    application.add_handler(conv_handler)

    # 궁합 대화 핸들러
    gunghap_handler = ConversationHandler(
        entry_points=[CommandHandler("gunghap", gunghap_start)],
        states={
            GH_GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_gender_received)],
            GH_CALENDAR: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_calendar_received)],
            GH_YEAR: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_year_received)],
            GH_MONTH: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_month_received)],
            GH_DAY: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_day_received)],
            GH_HOUR: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_hour_received)],
            GH_MINUTE: [MessageHandler(filters.TEXT & ~filters.COMMAND, gh_minute_received)],
        },
        fallbacks=[CommandHandler("cancel", gh_cancel)],
    )
    application.add_handler(gunghap_handler)

    application.add_handler(CallbackQueryHandler(analysis_callback, pattern=r"^analysis_"))
    application.add_handler(CallbackQueryHandler(gunghap_start_callback, pattern=r"^start_gunghap$"))

    # 자유 텍스트 질문 핸들러 (사주 대화가 아닌 일반 메시지)
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, free_question_handler))

    # 에러 핸들러 등록
    application.add_error_handler(error_handler)

    # 봇 실행 (이전 미처리 메시지 드랍)
    print("사주 명리학 텔레그램 봇이 시작되었습니다!")
    print("   Ctrl+C로 종료할 수 있습니다.")
    application.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
