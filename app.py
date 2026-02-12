"""
app.py - 사주 풀이 웹 서버 (Flask)
"""

import os
from flask import Flask, render_template, request, jsonify
from backend.data_caching_util import load_saju_data_as_files, create_saju_cache
import google.generativeai as genai

app = Flask(__name__, template_folder='frontend', static_folder='frontend')

# 전역 변수로 모델 관리 (실제 운영 시에는 세션 또는 DB 관리 필요)
saju_model = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    global saju_model
    data = request.json
    name = data.get('name')
    birth_date = data.get('birth_date')
    birth_time = data.get('birth_time')
    is_lunar = data.get('is_lunar', False)

    if not saju_model:
        # 1. API 키 확인
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            return jsonify({"error": "API 키가 설정되지 않았습니다."}), 500
        
        # 2. 사주 데이터 로드 및 캐싱
        files = load_saju_data_as_files(api_key, "data")
        if not files:
            # 학습 데이터가 없을 경우 기본 안내
            saju_model = genai.GenerativeModel('gemini-1.5-pro-002')
        else:
            cache = create_saju_cache(api_key, files)
            saju_model = genai.GenerativeModel.from_cached_content(cached_content=cache)

    # 3. 사주 분석 요청
    prompt = f"""
    사용자 이름: {name}
    생년월일: {birth_date}
    태어난 시: {birth_time}
    음력 여부: {"음력" if is_lunar else "양력"}
    
    위 정보를 바탕으로 서비스의 사주 학습 데이터를 참조하여 이 사용자의 전체적인 운세와 성격, 올해의 운을 상세히 풀이해 주세요.
    """
    
    try:
        response = saju_model.generate_content(prompt)
        return jsonify({"result": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
