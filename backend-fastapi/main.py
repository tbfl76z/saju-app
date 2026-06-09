from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime
import os
import glob
import google.generativeai as genai
from google.generativeai import caching
from dotenv import load_dotenv

# Import Saju logic
from sajupy import SajuCalculator, get_saju_details, lunar_to_solar
from saju_utils import (
    get_extended_saju_data, get_seyun_list, get_wolun_data,
    get_ilun_data, get_seyun_data, get_ganzhi_details,
)
from saju_data import SAJU_TERMS
import ai_report
import image_prompt as image_prompt_mod
import share_store

load_dotenv()

app = FastAPI(title="Saju API")
calc = SajuCalculator()  # Initialize calculator once

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Set to False to avoid conflicts with "*" when using credentials
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini Initialization
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
KNOWLEDGE_CONTEXT_LIMIT = int(os.getenv("KNOWLEDGE_CONTEXT_LIMIT", "240000"))
KNOWLEDGE_FALLBACK_LIMIT = int(os.getenv("KNOWLEDGE_FALLBACK_LIMIT", "60000"))
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

@app.get("/")
async def root():
    return {"message": "Saju API is running", "status": "healthy"}

class SajuRequest(BaseModel):
    name: Optional[str] = "하늘"
    gender: str = "여"
    year: int
    month: int
    day: int
    hour: int = 0
    minute: int = 0
    calendar_type: str = "양력"
    is_leap: bool = False
    unknown_time: bool = False  # 태어난 시간 모름 (시주는 참고용 처리)

@app.post("/calculate")
async def calculate(req: SajuRequest):
    try:
        b_year, b_month, b_day = req.year, req.month, req.day
        # 시간 미상이면 정오(12:00)로 계산해 자시 경계 오류를 피하고 시주는 참고용으로 표시한다
        b_hour, b_minute = (12, 0) if req.unknown_time else (req.hour, req.minute)

        # 1. Calculate Saju
        saju_res = calc.calculate_saju(
            b_year, b_month, b_day, 
            b_hour, b_minute,
            use_solar_time=True, 
            longitude=127.5,
            early_zi_time=False
        )
        
        # 2. Lunar to Solar correction if needed
        if req.calendar_type == "음력":
            solar_res = lunar_to_solar(b_year, b_month, b_day, is_leap_month=req.is_leap)
            y, m, d = solar_res['solar_year'], solar_res['solar_month'], solar_res['solar_day']
            saju_res = calc.calculate_saju(y, m, d, b_hour, b_minute, 
                                    use_solar_time=True, longitude=127.5, early_zi_time=False)
        
        details = get_saju_details(saju_res)

        # 3. Extend data
        details = get_extended_saju_data(details, gender=req.gender)

        # 4. 입력 정보(이름/성별/시간미상)를 응답에 포함 (저장·표시·AI 분석용)
        details['name'] = req.name
        details['gender'] = req.gender
        details['unknown_time'] = bool(req.unknown_time)

        return details
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/terms")
async def get_terms():
    return SAJU_TERMS


@app.get("/health/ai")
async def health_ai():
    """AI 키·모델 설정 상태 진단 (키 값은 노출하지 않고 존재 여부만 반환)."""
    return {
        "google_api_key": bool(GEMINI_API_KEY),
        "openrouter_api_key": bool(ai_report.OPENROUTER_API_KEY),
        "openrouter_models": ai_report.OPENROUTER_MODELS,
        "priority_models": ai_report.PRIORITY_MODELS,
    }


class SeyunRequest(BaseModel):
    day_gan: str
    year_branch: str
    start_year: int
    pillars: Dict[str, Any]
    day_branch: Optional[str] = None

@app.post("/seyun")
async def seyun(req: SeyunRequest):
    try:
        res = get_seyun_list(
            req.day_gan, 
            req.year_branch, 
            req.start_year, 
            count=10, 
            pillars=req.pillars, 
            day_branch=req.day_branch
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class WolunRequest(BaseModel):
    day_gan: str
    year_branch: str
    year_pillar: str
    pillars: Dict[str, Any]
    day_branch: Optional[str] = None

@app.post("/wolun")
async def wolun(req: WolunRequest):
    try:
        res_list = []
        for m in range(1, 13):
            data = get_wolun_data(
                req.day_gan,
                req.year_branch,
                req.year_pillar,
                m,
                pillars=req.pillars,
                day_branch=req.day_branch
            )
            res_list.append(data)
        return res_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class IlunRequest(BaseModel):
    day_gan: str
    year_branch: str
    pillars: Dict[str, Any]
    target_date: Optional[str] = None  # 'YYYY-MM-DD', 미지정 시 오늘
    day_branch: Optional[str] = None

@app.post("/ilun")
async def ilun(req: IlunRequest):
    """오늘의 운세(일운). target_date 미지정 시 서버 기준 오늘 날짜를 사용한다."""
    try:
        target = req.target_date or datetime.date.today().isoformat()
        res = get_ilun_data(
            req.day_gan,
            req.year_branch,
            target,
            pillars=req.pillars,
            day_branch=req.day_branch,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CompatibilityRequest(BaseModel):
    person_a: Dict[str, Any]  # /calculate 응답 전체 (본인)
    person_b: Dict[str, Any]  # /calculate 응답 전체 (상대)

@app.post("/compatibility")
async def compatibility(req: CompatibilityRequest):
    """두 사람 명식의 지지/천간 관계를 분석하여 호합도 점수(0-100)와 관계 목록을 반환한다.
    참고용 점수이며, A의 일간 기준으로 B의 네 기둥을 대조한다."""
    try:
        a, b = req.person_a, req.person_b
        a_pillars = a.get("pillars")
        b_pillars = b.get("pillars")
        if not a_pillars or not b_pillars:
            raise HTTPException(status_code=422, detail="두 사람의 pillars 데이터가 필요합니다.")

        day_gan = a_pillars["day"]["stem"]
        year_branch = a_pillars["year"]["branch"]
        day_branch = a_pillars["day"]["branch"]

        matches = []
        harmony = 0   # 합 가점
        conflict = 0  # 충/형/파/해/원진/귀문 감점
        for key in ["year", "month", "day", "hour"]:
            b_pillar = b_pillars.get(key, {}).get("pillar")
            if not b_pillar:
                continue
            detail = get_ganzhi_details(day_gan, year_branch, b_pillar, pillars=a_pillars, day_branch=day_branch)
            rels = detail.get("relations", "-")
            if rels and rels != "-":
                matches.append({"pillar": key, "ganzhi": b_pillar, "relations": rels})
                harmony += rels.count("합")
                for neg in ["충", "형", "파", "해", "원진", "귀문"]:
                    conflict += rels.count(neg)

        # 기준점 60에서 합은 가점, 충형 등은 감점 (0-100 클램프)
        score = 60 + harmony * 12 - conflict * 8
        score = max(0, min(100, score))
        summary = f"합 {harmony}건 · 충형해파 {conflict}건"
        return {"score": score, "harmony": harmony, "conflict": conflict, "matches": matches, "summary": summary}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class NewYearRequest(BaseModel):
    saju_data: Dict[str, Any]
    target_year: int

@app.post("/newyear")
async def newyear(req: NewYearRequest):
    """특정 연도의 세운 명식을 반환한다(원국과의 형충회합 포함)."""
    try:
        if not (1900 <= req.target_year <= 2100):
            raise HTTPException(status_code=422, detail="target_year는 1900~2100 범위여야 합니다.")
        pillars = req.saju_data.get("pillars")
        if not pillars:
            raise HTTPException(status_code=422, detail="saju_data.pillars가 필요합니다.")
        res = get_seyun_data(
            pillars["day"]["stem"],
            pillars["year"]["branch"],
            req.target_year,
            pillars=pillars,
            day_branch=pillars["day"]["branch"],
        )
        if res:
            res["year"] = req.target_year
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ShareRequest(BaseModel):
    saju_data: Dict[str, Any]
    ai_analysis: Optional[str] = None
    label: Optional[str] = None

@app.post("/share")
async def create_share(req: ShareRequest):
    """명식+AI리포트를 저장하고 공유 단축 코드를 반환한다."""
    try:
        payload = {
            "saju_data": req.saju_data,
            "ai_analysis": req.ai_analysis,
            "label": req.label,
        }
        code = share_store.save_share(payload)
        return {"code": code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/share/{code}")
async def read_share(code: str):
    """공유 코드로 저장된 명식을 조회한다."""
    res = share_store.get_share(code)
    if not res:
        raise HTTPException(status_code=404, detail="공유된 명식을 찾을 수 없습니다.")
    return res

class AnalysisRequest(BaseModel):
    saju_data: Dict[str, Any]
    query: Optional[str] = ""
    # total, original, daeun, seyun, wolun, today, compatibility, newyear
    analysis_type: Optional[str] = "total"
    partner_saju_data: Optional[Dict[str, Any]] = None  # 궁합 분석용 상대 명식
    target_year: Optional[int] = None  # 신년/오늘 기준 연도
    level: Optional[str] = "advanced"  # 'easy'(쉬운 설명) | 'advanced'(고급 풀이)
    category: Optional[str] = None  # love|wealth|career|health (newyear 분야별 운세)
    period_ganzhi: Optional[str] = None  # 대운/세운/월운 분석 대상 간지 (프론트가 선택한 카드)
    period_label: Optional[str] = None   # 그 시기의 사람이 읽는 라벨 (예: '2026년 6월(未월)')

class ImagePromptRequest(BaseModel):
    saju_data: Dict[str, Any]
    scope: Optional[str] = "natal"  # natal(원국) | daeun(명식+대운) | seyun(명식+세운)
    period_ganzhi: Optional[str] = None  # 명시 시 그 간지 사용, 없으면 자동(현재 대운/올해)
    period_label: Optional[str] = None


@app.post("/image-prompt")
async def image_prompt(req: ImagePromptRequest):
    """명식(천간지지) 기반 이미지 생성 프롬프트 반환 — ChatGPT/DALL-E에 바로 입력 가능.
    scope로 원국/대운/세운 기운을 더할 수 있다."""
    try:
        return image_prompt_mod.generate_image_prompt(
            req.saju_data, scope=req.scope or "natal",
            period_ganzhi=req.period_ganzhi, period_label=req.period_label,
        )
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    """동기 방식 AI 리포트 생성 (평문/마크다운 헤딩 반환). 로직은 ai_report 모듈에 위임."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    try:
        return {"result": ai_report.generate_report(req)}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"result": f"죄송합니다. AI 분석 중 오류가 발생했습니다: {str(e)}"}

@app.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest):
    """스트리밍(SSE) 방식 AI 리포트 생성. text/event-stream으로 토큰을 흘린다."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    return StreamingResponse(
        ai_report.stream_report(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
