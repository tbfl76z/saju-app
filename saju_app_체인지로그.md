# saju_app 체인지로그

> 프로젝트: Destiny Code (FastAPI + Next.js 사주 풀이 앱)
> 위치: /mnt/c/Users/swahn/Documents/saju_app/

---

## 2026-06-10 — 학습 모드("사주 공부하기") 신규 구축

### 배경
- 기존 풀이 앱을 기반으로 "사주를 공부하는 앱"으로 확장. research(시장 공백 확인) → plan → 구현 3단계로 진행
- 리서치 결론: 만세력 도구·유료 강의는 많지만 **퀴즈·게임형 인터랙티브 사주 학습 앱은 시장 부재** → `research.md` / 구현 계획 → `plan.md`

### 백엔드 (backend-fastapi/)
- **learn_curriculum.py 신규**: 10챕터 커리큘럼(음양오행 → 천간 → 지지 → 60갑자 → 지장간 → 십성 → 12운성 → 합충형파해 → 신살 → 실전 명식 읽기), 챕터당 개념 카드 4~6장 수록
- **learn_quiz.py 신규**: saju_utils 매핑 테이블(오행·십성·12운성·지장간·합충·신살·공망) 기반 **퀴즈 동적 생성기**. 4지선다 + 해설, seed 재현 가능, 같은 지식 포인트 중복 출제 방지
- **ai_report.py 확장**: AI 튜터(`stream_tutor`) 추가 — 과외 선생님 페르소나 시스템 프롬프트, 지식베이스 30KB 주입, 기존 Gemini→OpenRouter 폴백 체인 재사용
- **main.py 라우트 추가**:
  - `GET /learn/curriculum` — 챕터 목록
  - `GET /learn/chapter/{id}` — 개념 카드
  - `GET /learn/quiz/{id}?count&seed` — 퀴즈 생성 (count 1~20 클램프)
  - `POST /learn/tutor` — AI 튜터 SSE 스트리밍

### 프론트엔드 (frontend-next/)
- **lib/learn.ts 신규**: API 호출 + 진도/XP/스트릭(연속 학습일) localStorage 저장 + **SM-2 간격 반복** 복습 덱(오답 자동 등록, 5회 연속 정답 시 졸업, 카드 300장 상한)
- **app/(main)/learn/page.tsx**: 커리큘럼 맵 — XP·스트릭·완료 챕터 헤더, 직전 챕터 통과 시 다음 잠금 해제, 복습 due 카드 알림
- **app/(main)/learn/[chapterId]/page.tsx**: 개념 카드 → 10문항 퀴즈(즉각 정오 피드백+해설) → 결과(80점 통과) 플로우
- **app/(main)/learn/review/page.tsx**: due 카드 복습 — 몰랐다/헷갈렸다/알았다 자기평가 → SM-2 일정 갱신
- **components/learn/**: ConceptBody(굵게·목록·표 경량 마크다운 렌더러), QuizRunner, TutorPanel(스트리밍 질문)
- **NavBar.tsx**: "공부" 탭 추가 (GraduationCap 아이콘)

### 검증
- 퀴즈 생성기 전수 검증: 10챕터 × 3시드 × 10문항 = **300문항 PASS** (선지 4개·중복 없음·정답 포함·해설 존재·seed 재현성)
- `npm run build` 통과 (/learn, /learn/[chapterId], /learn/review 라우트 정상 생성)
- API 스모크 테스트: curriculum/chapter/quiz/404/422 정상, **AI 튜터 실제 스트리밍 응답 확인** (Gemini 정상 동작)

### 남은 과제 (plan.md Phase 2~3)
- 실전 챕터의 "내 명식 연동"(저장 명식 불러와 풀기)
- 스트릭 프리즈·레벨 시스템, 학습 통계 화면
- 신강신약·격국용신 고급 챕터, 통변 훈련(AI 채점)
