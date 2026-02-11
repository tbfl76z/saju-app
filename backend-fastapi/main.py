from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
from saju_utils import get_extended_saju_data, get_seyun_list, get_wolun_data
from saju_data import SAJU_TERMS

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

@app.post("/calculate")
async def calculate(req: SajuRequest):
    try:
        b_year, b_month, b_day = req.year, req.month, req.day
        b_hour, b_minute = req.hour, req.minute
        
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
        
        return details
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/terms")
async def get_terms():
    return SAJU_TERMS

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

class AnalysisRequest(BaseModel):
    saju_data: Dict[str, Any]
    query: Optional[str] = ""
    analysis_type: Optional[str] = "total" # total, original, daeun, seyun, wolun

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    
    try:
        data = req.saju_data
        pillars = data['pillars']
        
        # 전문 지식 베이스 로드 및 분석 타입별 필터링
        knowledge_path = os.path.join(os.path.dirname(__file__), 'knowledge_base.txt')
        knowledge_context = ""
        if os.path.exists(knowledge_path):
            try:
                with open(knowledge_path, 'r', encoding='utf-8') as f:
                    full_content = f.read()
                    
                    # 소스별 분할
                    parts = full_content.split("### SOURCE: ")
                    relevant_parts = []
                    
                    # 분석 타입에 따른 소스 우선순위 및 조합 결정
                    if req.analysis_type in ["total", "original"]:
                        # 1. '핵심 매뉴얼'을 최상단에 배치 (대원칙)
                        manual_part = next((p for p in parts if "명리학 핵심 이론과 실전 분석 매뉴얼.pdf" in p), "")
                        if manual_part:
                            relevant_parts.append(f"### [분석 대원칙 및 방향성 가이드]\n{manual_part}")
                        
                        # 2. 나머지 모든 PDF 소스 추가 (세부 참조 데이터)
                        for p in parts:
                            if ".pdf" in p and "명리학 핵심 이론과 실전 분석 매뉴얼.pdf" not in p:
                                relevant_parts.append(p)
                    else:
                        # 대운/세운/월운: sample_knowledge.txt 우선
                        sample_part = next((p for p in parts if "sample_knowledge.txt" in p), "")
                        if sample_part:
                            relevant_parts.append(f"### [시간 운세 분석 핵심 기준]\n{sample_part}")
                        # 보조적으로 다른 PDF들도 포함
                        for p in parts:
                            if ".pdf" in p:
                                relevant_parts.append(p)
                    
                    if relevant_parts:
                        knowledge_context = "\n".join(relevant_parts)[:60000] # 6만자 확장
                    else:
                        knowledge_context = full_content[:30000]
            except Exception as e:
                print(f"Knowledge load/filter error: {e}")

        sys_instr = (
            "당신은 사주 명리학의 깊이 있는 통찰을 전하는 인격 고매한 대가입니다.\n"
            "지식 참조 원칙:\n"
            "1. 전체사주 및 원국 해석 시, 반드시 '[분석 대원칙 및 방향성 가이드]'로 명시된 '명리학 핵심 이론과 실전 분석 매뉴얼.pdf'의 해석 방향을 '최우선 대원칙'으로 삼으세요.\n"
            "2. 십성, 12운성, 신살 등 개별 항목의 구체적인 풀이는 해당 주제와 관련된 개별 PDF 소스(예: 12신살.pdf, 12운성.pdf 등)의 상세 내용을 적극 인용하여 분석의 깊이를 더하세요.\n"
            "3. 대운/세운/월운 분석 시에는 '[시간 운세 분석 핵심 기준]'으로 명시된 정보를 절대적 기준으로 삼아 해석의 일관성을 유지하세요.\n\n"
            "스타일 및 구조:\n"
            "- 정중한 평서문 위주의 격식체를 사용하고, 과도한 마크다운 강조(**)를 절대 사용하지 마세요.\n"
            "- 반드시 '총평 - 데이터 기반 정밀 분석 - 실천적 개운법 - 대가의 한마디' 구조를 유지하세요.\n"
            "- 상담을 받는 듯한 따뜻하고 지혜로운 문체로 작성하세요."
        )
        
        # 분석 타입별 헤더 구성
        headers = {
            "total": "📜 전체 사주 보고서 - 삶의 총체적 흐름",
            "original": "🌿 사주 원국 정밀 해석 - 타고난 천명과 자아",
            "daeun": "🌊 대운 평생 운세 분석 - 거시적 환경의 변화",
            "seyun": "📈 흐르는 세운 분석 - 올해의 가능성과 기회",
            "wolun": "🗓️ 세밀한 월운 가이드 - 이달의 지혜로운 처세"
        }
        report_header = headers.get(req.analysis_type, headers['total'])

        prompt = f"""
        {report_header}
        
        [제공된 전문 지식 베이스]
        {knowledge_context}
        
        [분석 대상자 데이터]
        - 성함: {data.get('name', '사용자')}님
        - 명식: 년({pillars['year']['pillar']}), 월({pillars['month']['pillar']}), 일({pillars['day']['pillar']}), 시({pillars['hour']['pillar']})
        - 오행 분포: {data['five_elements']}
        - 십성 구성: 년({data['ten_gods']['year']}/{data['jiji_ten_gods']['year']}), 일(본인/{data['jiji_ten_gods']['day']})
        - 십이운성: {data['twelve_growth']}
        - 신살 및 상호관계: {data.get('sinsal', '없음')}, {data.get('relations', '특이사항 없음')}
        {f'- 현재 대운 정보: {data["fortune"]["num"]}대운 / {data["fortune"]["list"][0]["ganzhi"]}' if 'fortune' in data else ''}

        [분석 요청 사항]
        {req.query if req.query else "제공된 지식 베이스의 원칙과 상세 이론을 조화롭게 엮어, 한 사람의 인생을 깊이 있게 통찰하는 상담 리포트를 작성해 주세요."}

        [대가의 리포트 작성 가이드]
        1. 지식 베이스에서 명시된 '분석 대원칙'에 따라 전체적인 해석의 톤을 잡으세요.
        2. 개별 데이터(신살, 운성 등)에 대해서는 관련 PDF의 상세 설명을 인용하여 '근거 있는 분석'을 제시하세요.
        3. 문학적 비유를 곁들여 읽는 이의 마음을 어루만지는 품격 있는 결과물을 도출하세요.
        """

        # 모델 우선순위 정의 (최신 모델부터 폴백)
        priority_models = ['models/gemini-2.0-flash', 'models/gemini-1.5-flash', 'models/gemini-pro']
        
        response = None
        error_msg = ""
        
        # 가용 모델 목록 확인
        try:
            available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
            models_to_try = [pm for pm in priority_models if pm in available_models]
            if not models_to_try:
                models_to_try = ['models/gemini-pro']
        except Exception:
            models_to_try = priority_models

        # 성공할 때까지 차례대로 시도
        for model_name in models_to_try:
            try:
                print(f"Attempting analysis with: {model_name}")
                model = genai.GenerativeModel(model_name, system_instruction=sys_instr)
                response = model.generate_content(prompt)
                if response and response.text:
                    break # 성공 시 루프 탈출
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "quota" in error_msg.lower():
                    print(f"Model {model_name} quota exceeded, trying next...")
                    continue # 다음 모델로 재시도
                else:
                    raise e # 429 외의 에러는 중단

        if not response or not response.text:
            return {"result": f"죄송합니다. 현재 모든 AI 모델의 할당량이 초과되었습니다. 잠시 후 다시 시도해 주세요. (에러: {error_msg})"}
        
        # 클린업 (불필요한 마크다운 보정)
        result_text = response.text.replace('**', '') if response.text else ""
        return {"result": result_text}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"result": f"죄송합니다. AI 분석 중 오류가 발생했습니다: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
