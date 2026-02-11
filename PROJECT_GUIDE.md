# 🔮 사주 앱 실행 및 관리 가이드 (Destiny Code)

이 문서는 서비스 운영을 위한 핵심 실행 명령어와 지식 베이스 관리 방법을 요약합니다.

## 1. 백엔드 (FastAPI) 실행
백엔드 서버는 사주 계산 및 AI 분석 로직을 담당합니다.

- **위치**: `backend-fastapi/`
- **실행 방법**:
  ```bash
  # 가상환경 활성화 (필요 시)
  # .\venv\Scripts\activate
  
  # 서버 실행
  python main.py
  ```
- **API 주소**: `http://localhost:8001`

## 2. 지식 베이스(AI 학습 데이터) 갱신
새로운 PDF 문서를 추가했거나 지식 베이스를 최신화해야 할 때 실행합니다.

- **위치**: `backend-fastapi/`
- **방법**:
  1. `data/` 폴더에 원하는 PDF 또는 TXT 파일들을 넣습니다.
  2. 다음 스크립트를 실행합니다:
     ```bash
     python extract_knowledge.py
     ```
  3. `knowledge_base.txt`가 생성/갱신되며, 백엔드가 이를 AI 분석에 즉시 반영합니다.

## 3. 프론트엔드 (Next.js) 실행
사용자 인터페이스(UI)를 실행합니다.

- **위치**: `frontend-next/`
- **실행 방법**:
  ```bash
  npm run dev
  ```
- **접속 주소**: `http://localhost:3000`

## 4. 데이터 관리 팁
- **PDF 참조**: '전체사주/원국해석'은 `명리학 핵심 이론과 실전 분석 매뉴얼.pdf`의 내용을 최우선으로 찾습니다. 해당 파일명이 정확한지 확인해 주세요.
- **TXT 참조**: '대운/세운/월운' 분석은 `sample_knowledge.txt`의 내용을 우선 참조합니다.
- **용어 수정**: 사주 용어 클릭 시 나오는 팝업 설명은 `saju_data.py` 파일의 `SAJU_TERMS` 딕셔너리를 수정하여 변경할 수 있습니다.

---
**주의**: 시스템 중단 시 백엔드(`main.py`)와 프론트엔드(`npm run dev`)를 모두 다시 실행해 주셔야 합니다.
