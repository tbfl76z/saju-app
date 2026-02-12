<<<<<<< HEAD
=======
<<<<<<< HEAD
# 🔮 사주 앱 실행 및 관리 가이드 (Premium Destiny Code)

이 문서는 서비스 운영을 위한 핵심 실행 명령어와 지식 베이스 관리, 그리고 최근 업데이트된 프리미엄 로직 및 디자인의 적용 방법을 요약합니다.

## 1. 백엔드 (FastAPI) 실행 및 로직 관리
백엔드 서버는 사주 계산 및 AI 분석 로직을 담당합니다.

- **위치**: `backend-fastapi/`
- **실행 방법**:
  ```bash
  # 서버 실행
  python main.py
  ```
- **최근 업데이트 (핵심 적용 사항)**:
    - **월운 계산 정교화**: 명리학 표준(월두법)에 따라 `saju_utils.py`의 월운 계산 로직이 수정되었습니다.
    - **데이터 동기화**: `backend-fastapi/saju_data.py`와 `saju_utils.py`가 루트 디렉토리의 최신 데이터와 완전히 동기화되었습니다. 로직 수정 시 이 두 파일을 확인하세요.

## 2. 지식 베이스(AI 학습 데이터) 갱신
새로운 PDF 문서를 추가했거나 지식 베이스를 최신화해야 할 때 실행합니다.

- **방법**:
  1. `data/` 폴더에 원하는 PDF 또는 TXT 파일들을 넣습니다.
  2. 다음 스크립트를 실행합니다: `python extract_knowledge.py`
  3. `knowledge_base.txt`가 생성되며 AI가 즉시 학습합니다.

## 3. 프론트엔드 (Next.js) 실행 및 UI 관리
"Premium AI 명리학" 컨셉의 세련된 UI를 실행합니다.

- **실행 방법**: `npm run dev` (위치: `frontend-next/`)
- **UI 업데이트 사항**:
    - **글래스모피즘(Glassmorphism)**: 모든 카드가 투명도와 블러 효과가 적용된 세련된 스타일로 변경되었습니다.
    - **애니메이션**: 페이지 로드 및 인터랙션 시 부드러운 `fade-up` 효과가 적용됩니다.
    - **디자인 수정**: `globals.css`에서 오행 컬러 및 공통 스타일을 관리할 수 있습니다.

## 4. 외부망(인터넷) 접속 및 배포 방법
로컬 컴퓨터 외에 외부망에서도 서비스를 이용하려면 클라우드 배포가 필요합니다.

### A. 클라우드 배포 (추천: 정식 서비스용)
- **백엔드 (Render.com)**:
    1. GitHub에 `backend-fastapi` 폴더를 포함하여 업로드합니다.
    2. Render에서 'Web Service'를 생성하고 GitHub을 연결합니다.
    3. 환경 변수(`Environment Variables`)에 `GOOGLE_API_KEY`를 추가합니다.
- **프론트엔드 (Vercel.com)**:
    1. Vercel에서 `frontend-next` 폴더를 배포합니다.
    2. 환경 변수에 `NEXT_PUBLIC_API_URL`을 백엔드의 Render 주소로 설정합니다.
- **상세 단계**: [DEPLOY_GUIDE.md](file:///c:/Users/swahn/.gemini/antigravity/scratch/saju_app/DEPLOY_GUIDE.md)를 참조하세요.

### B. 로컬 터널링 (ngrok - 빠른 테스트용)
내 컴퓨터에서 실행 중인 서버를 즉시 외부에 공유하고 싶을 때 사용합니다.
1. [ngrok](https://ngrok.com/) 설치 및 로그인
2. 다음 명령어로 터널 생성:
   ```bash
   ngrok http 3000  # 프론트엔드 공유 (사용자 접속용)
   ngrok http 8001  # 백엔드 공유 (연동용)
   ```
3. 생성된 `Forwarding` 주소를 공유하면 외부망에서도 접속 가능합니다.

## 5. 변경 사항 적용 방법 (A/S 가이드)
수정된 로직이나 디자인이 보이지 않는다면 다음을 수행하세요:
1. **백엔드 재시작**: `main.py`를 실행 중인 터미널에서 `Ctrl+C` 후 다시 실행합니다.
2. **프론트엔드 재시작**: `npm run dev`를 다시 실행합니다.
3. **브라우저 캐시 새로고침**: `Ctrl + Shift + R`을 눌러 강력 새로고침을 수행합니다.

## 5. 데이터 관리 팁
- **용어 수정**: 사주 용어 설명은 `saju_data.py`의 `SAJU_TERMS`를 수정하면 즉시 반영됩니다.
- **오행 컬러**: `globals.css`의 `:root` 섹션에서 목/화/토/금/수의 색상 값을 조정할 수 있습니다.

---
**주의**: 배포 환경(Vercel, Render)에 적용하려면 반드시 GitHub에 현재 변경 사항을 `push` 해야 합니다.
=======
>>>>>>> temp
# 🔮 사주 앱 실행 및 관리 가이드 (Premium Destiny Code)

이 문서는 서비스 운영을 위한 핵심 실행 명령어와 지식 베이스 관리, 그리고 최근 업데이트된 프리미엄 로직 및 디자인의 적용 방법을 요약합니다.

## 1. 백엔드 (FastAPI) 실행 및 로직 관리
백엔드 서버는 사주 계산 및 AI 분석 로직을 담당합니다.

- **위치**: `backend-fastapi/`
- **실행 방법**:
  ```bash
  # 서버 실행
  python main.py
  ```
- **최근 업데이트 (핵심 적용 사항)**:
    - **월운 계산 정교화**: 명리학 표준(월두법)에 따라 `saju_utils.py`의 월운 계산 로직이 수정되었습니다.
    - **데이터 동기화**: `backend-fastapi/saju_data.py`와 `saju_utils.py`가 루트 디렉토리의 최신 데이터와 완전히 동기화되었습니다. 로직 수정 시 이 두 파일을 확인하세요.

## 2. 지식 베이스(AI 학습 데이터) 갱신
새로운 PDF 문서를 추가했거나 지식 베이스를 최신화해야 할 때 실행합니다.

- **방법**:
  1. `data/` 폴더에 원하는 PDF 또는 TXT 파일들을 넣습니다.
  2. 다음 스크립트를 실행합니다: `python extract_knowledge.py`
  3. `knowledge_base.txt`가 생성되며 AI가 즉시 학습합니다.

## 3. 프론트엔드 (Next.js) 실행 및 UI 관리
"Premium AI 명리학" 컨셉의 세련된 UI를 실행합니다.

- **실행 방법**: `npm run dev` (위치: `frontend-next/`)
- **UI 업데이트 사항**:
    - **글래스모피즘(Glassmorphism)**: 모든 카드가 투명도와 블러 효과가 적용된 세련된 스타일로 변경되었습니다.
    - **애니메이션**: 페이지 로드 및 인터랙션 시 부드러운 `fade-up` 효과가 적용됩니다.
    - **디자인 수정**: `globals.css`에서 오행 컬러 및 공통 스타일을 관리할 수 있습니다.

## 4. 외부망(인터넷) 접속 및 배포 방법
로컬 컴퓨터 외에 외부망에서도 서비스를 이용하려면 클라우드 배포가 필요합니다.

### A. 클라우드 배포 (추천: 정식 서비스용)
- **백엔드 (Render.com)**:
    1. GitHub에 `backend-fastapi` 폴더를 포함하여 업로드합니다.
    2. Render에서 'Web Service'를 생성하고 GitHub을 연결합니다.
    3. 환경 변수(`Environment Variables`)에 `GOOGLE_API_KEY`를 추가합니다.
- **프론트엔드 (Vercel.com)**:
    1. Vercel에서 `frontend-next` 폴더를 배포합니다.
    2. 환경 변수에 `NEXT_PUBLIC_API_URL`을 백엔드의 Render 주소로 설정합니다.
- **상세 단계**: [DEPLOY_GUIDE.md](file:///c:/Users/swahn/.gemini/antigravity/scratch/saju_app/DEPLOY_GUIDE.md)를 참조하세요.

### B. 로컬 터널링 (ngrok - 빠른 테스트용)
내 컴퓨터에서 실행 중인 서버를 즉시 외부에 공유하고 싶을 때 사용합니다.
1. [ngrok](https://ngrok.com/) 설치 및 로그인
2. 다음 명령어로 터널 생성:
   ```bash
   ngrok http 3000  # 프론트엔드 공유 (사용자 접속용)
   ngrok http 8001  # 백엔드 공유 (연동용)
   ```
3. 생성된 `Forwarding` 주소를 공유하면 외부망에서도 접속 가능합니다.

## 5. 변경 사항 적용 방법 (A/S 가이드)
수정된 로직이나 디자인이 보이지 않는다면 다음을 수행하세요:
1. **백엔드 재시작**: `main.py`를 실행 중인 터미널에서 `Ctrl+C` 후 다시 실행합니다.
2. **프론트엔드 재시작**: `npm run dev`를 다시 실행합니다.
3. **브라우저 캐시 새로고침**: `Ctrl + Shift + R`을 눌러 강력 새로고침을 수행합니다.

## 5. 데이터 관리 팁
- **용어 수정**: 사주 용어 설명은 `saju_data.py`의 `SAJU_TERMS`를 수정하면 즉시 반영됩니다.
- **오행 컬러**: `globals.css`의 `:root` 섹션에서 목/화/토/금/수의 색상 값을 조정할 수 있습니다.

---
**주의**: 배포 환경(Vercel, Render)에 적용하려면 반드시 GitHub에 현재 변경 사항을 `push` 해야 합니다.
<<<<<<< HEAD
=======
>>>>>>> 609910e (Fix deployment error and enhance stability)
>>>>>>> temp
