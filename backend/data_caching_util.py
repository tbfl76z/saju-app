"""
data_caching_util.py - 사주 데이터 전처리 및 캐싱 유틸리티

이 모듈은 data/ 디렉토리에 있는 모든 사주 학습 파일을 읽어 
Gemini API Context Cache에 등록하는 역할을 합니다.
"""

import os
import glob
import datetime
import google.generativeai as genai
from google.generativeai import caching

def load_saju_data_as_files(api_key, data_dir="data"):
    """data 디렉토리의 모든 파일(PDF 포함)을 Gemini API에 업로드합니다."""
    genai.configure(api_key=api_key)
    uploaded_files = []
    
    # 지원하는 확장자
    extensions = ['*.pdf', '*.txt', '*.md']
    
    for ext in extensions:
        for filepath in glob.glob(os.path.join(data_dir, ext)):
            print(f"파일 업로드 중: {os.path.basename(filepath)}...")
            try:
                # Gemini File API를 사용하여 파일 업로드
                file = genai.upload_file(path=filepath, display_name=os.path.basename(filepath))
                uploaded_files.append(file)
            except Exception as e:
                print(f"파일 업로드 실패 ({filepath}): {e}")
    
    return uploaded_files

def create_saju_cache(api_key, uploaded_files):
    """업로드된 파일들을 사용하여 Gemini API Context Cache를 생성합니다."""
    genai.configure(api_key=api_key)
    
    print(f"{len(uploaded_files)}개의 파일을 바탕으로 지식 저장소 구축 중...")
    
    # 캐시 생성
    cache = caching.CachedContent.create(
        model='models/gemini-1.5-pro-002',
        display_name='saju_advanced_kb',
        system_instruction=(
            "당신은 사주팔자 및 명리학의 대가입니다. "
            "업로드된 사주 원전(PDF 등) 및 학습 데이터를 완벽히 숙지하고 있습니다. "
            "사용자의 생년월일시 정보를 받으면, 학습된 정통 명리학 이론에 근거하여 "
            "성격, 대운, 세운, 그리고 조언을 매우 상세하고 전문적으로 풀이해 주세요."
        ),
        contents=uploaded_files,
        ttl=datetime.timedelta(minutes=60),
    )
    
    return cache

if __name__ == "__main__":
    # 테스트 실행
    print("사주 데이터 로딩 테스트 중...")
    # 예시 데이터를 위해 폴더가 비어있을 경우 경고
    if not os.path.exists("data"):
        os.makedirs("data")
        print("'data' 폴더가 생성되었습니다. 여기에 사주 학습 파일을 넣어주세요.")
