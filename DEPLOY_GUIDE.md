# 🚀 GitHub 및 Vercel 배포 가이드

이 문서는 프로젝트를 로컬 환경에서 GitHub에 업로드하고, Vercel(프론트엔드)과 Render(백엔드)를 통해 웹 서비스로 배포하는 방법을 설명합니다.

---

## 1. GitHub 업로드 (저장소 생성 및 푸시)

1. **GitHub 저장소 생성**: [GitHub](https://github.com/new)에서 새로운 Repository(예: `saju-app`)를 생성합니다.
2. **로컬 Git 초기화 및 푸시**:
   ```bash
   # 프로젝트 루트 폴더 (saju_app)에서 실행
   git init
   git add .
   git commit -m "Initial commit: Saju App with FastAPI and Next.js"
   git branch -M main
   git remote add origin https://github.com/tbfl76z/saju-app.git
   # 만약 "error: remote origin already exists" 에러가 발생하면 아래 명령어를 실행하세요:
   # git remote set-url origin https://github.com/사용자아이디/saju-app.git
   git push -u origin main
   ```
   > [!IMPORTANT]
   > 제가 이미 `.gitignore`를 생성해 두었습니다. `.env` 파일과 같은 민감한 정보는 GitHub에 업로드되지 않으니 안심하세요.

---

## 2. 백엔드 배포 (FastAPI - Render 추천)

FastAPI와 같은 파이썬 백엔드는 **Render**나 **Railway**가 무료 티어에서 안정적입니다. (Vercel도 가능하지만 설정이 복잡합니다.)

1. **[Render](https://render.com/) 가입** 후 GitHub 계정을 연결합니다.
2. **New > Web Service**를 선택하고 GitHub에서 `saju-app` 저장소를 고릅니다.
3. **설정값 입력**:
   - **Root Directory**: `backend-fastapi`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. **환경 변수(Environment Variables) 설정**:
   - `GOOGLE_API_KEY`: 사용 중인 Gemini API 키 입력
5. **배포 후 받은 URL**(예: `https://saju-backend.onrender.com`)을 복사해 둡니다.

---

## 3. 프론트엔드 배포 (Next.js - Vercel)

1. **[Vercel](https://vercel.com/) 가입** 후 GitHub 계정을 연결합니다.
2. **Add New > Project**를 선택하고 GitHub에서 `saju-app` 저장소를 Import 합니다.
3. **설정값 입력**:
   - **Root Directory**: `frontend-next`
   - **Framework Preset**: `Next.js`
4. **환경 변수 설정 (중요!)**:
   - Vercel의 프로젝트 설정 화면에서 **Environment Variables** 메뉴를 찾습니다.
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://saju-backend.onrender.com` (사용자님의 백엔드 주소)
   - **Add**를 누른 후 **Deploy**를 진행합니다.

> [!TIP]
> 제가 이미 코드를 `process.env.NEXT_PUBLIC_API_URL`을 사용하도록 수정해 두었기 때문에, 깃허브에서 코드를 직접 고칠 필요 없이 Vercel 대시보드 설정만으로 충분합니다!

---

## 4. 실시간 연동을 위한 코드 수정 (배포용)

실제 서비스에서는 백엔드 주소가 계속 바뀌므로, 아래와 같이 코드를 수정하는 것을 추천합니다.

**`frontend-next/src/app/page.tsx` 수정 예:**
```typescript
// 로컬 테스트용이 아닌, 환경변수나 조건문에 따른 주소 설정
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
```

---

이제 이 가이드에 따라 GitHub에 먼저 푸시해 보세요! 궁금한 점이 있으면 바로 말씀해 주세요.
