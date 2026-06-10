# 사주 학습 모드 — 리서치 (research.md)

> 작성일: 2026-06-10
> 목적: 기존 사주 풀이 앱(saju_app)을 기반으로 "사주를 공부하는 앱(학습 모드)"을 만들기 위한 사전 리서치

---

## 1. 기존 자산 분석 (코드베이스 리서치)

### 재사용 가능한 핵심 자산
| 자산 | 위치 | 학습 앱 활용 방안 |
|---|---|---|
| 순수 계산 엔진 | `backend-fastapi/saju_utils.py` | 천간·지지·60갑자·십성·12운성·신살·형충회합 매핑 테이블 → **퀴즈 문제·정답 자동 생성** |
| 용어 사전 | `backend-fastapi/saju_data.py` (SAJU_TERMS) | 용어 학습 카드, 보기(오답 선지) 풀 |
| 명리학 교과서 MD 22종 | `data/*.md` | 챕터별 개념 학습 콘텐츠 + AI 튜터 지식베이스 |
| LLM 인프라 | `backend-fastapi/ai_report.py` | Gemini→OpenRouter 폴백 체인, 스트리밍 → **AI 튜터(질의응답·오답 해설)** 재활용 |
| 사주 계산 API | `POST /calculate` | 실전 명식 읽기 훈련 문제지 생성 |
| 명식 UI 컴포넌트 | `frontend-next/src/components/SajuPillars.tsx` 등 | 실전 훈련 화면 재사용 |

### data/ 학습자료 → 커리큘럼 매핑 가능성
음양오행(기초·심화 3종), 천간(3종), 지지(2종), 지장간기초, 육친기초·심화, 12운성, 12신살·기타신살, 합형충파해, 격국용신, 병존, 천간지지12운성해석, 운성신살심화, 종합 매뉴얼 — **기초→심화 커리큘럼을 구성하기에 충분한 분량**. 단, "읽기 자료"이므로 레슨 단위(개념 카드)로 쪼개는 구조화 작업이 필요.

---

## 2. 시장 리서치 — 경쟁 환경

### 기존 앱 생태계
- 만세력·풀이 중심: [포스텔러 만세력](https://pro.forceteller.com/), [K-Saju](https://ikbiz.com/k-saju/), [2026 정통사주](https://play.google.com/store/apps/details?id=com.ipapas.sajulite&hl=en_US), [사주풀이도우미](https://kr.fateup.com/), [플러스만세력](http://manse.sajuplus.net/), [만세력 천을귀인](https://play.google.com/store/apps/details?id=com.gooddaytoday.mynobleman&hl=en_US) 등 — 전부 **"풀이를 보여주는" 도구**이지 "공부시키는" 도구가 아님
- 학습은 유료 동영상 강의 중심: [K-Fortune 교육과정](https://k-fortune.com/page_course_details.php?uid=NjM%3D)(상담가 양성 기본~전문), [MKYU 명리학 완성 패키지](https://www.mkyu.co.kr/course/course_view.jsp?id=157176) — 수동적 시청형, 인터랙티브 요소 없음
- 블로그/웹 텍스트 강의: [사주스터디](https://www.sajustudy.com/), [브런치 명리학 기초](https://brunch.co.kr/@damon/62) 등

### 핵심 발견 (기회)
검색 결과 **"퀴즈·문제풀이·게임형 사주 학습 앱"은 시장에서 확인되지 않음.** 만세력(도구)과 동영상 강의(콘텐츠) 사이의 빈 자리 — *인터랙티브 학습 앱* — 이 비어 있다. 듀오링고식 학습 루프를 명리학에 적용한 사례 부재.

---

## 3. 명리학 표준 학습 커리큘럼 (커뮤니티·강의 공통)

[사자사주 공부 순서 가이드](https://www.sazasaju.com/blog/saju-study-guide), [사주스터디 심화과정](https://www.sajustudy.com/98) 등 복수 소스가 일치하는 표준 순서:

1. **음양오행** — 목화토금수 성질, 상생·상극 (모든 개념의 토대, 필수 선행)
2. **천간·지지** — 10천간 12지지, 물상, 60갑자
3. **지장간 · 근묘화실** — 지지 속 천간, 4기둥의 의미
4. **십성(육친)** — 일간 기준 10가지 관계 (비겁·식상·재성·관성·인성)
5. **12운성 · 신살** — 에너지 흐름, 길흉 포인트
6. **합형충파해** — 글자 간 상호작용
7. **신강신약 → 격국·용신** — 사주 강약 판단 후 핵심 글자 찾기 (순서 중요: 십성 숙달 전 용신 공부는 금물)
8. **대운·세운** — 시간 흐름 해석
9. **통변(실전 풀이)** — 종합 해석 훈련

소요 기간 통설: 기초(1~2단계) 1~2개월, 내 사주 읽기(4단계까지) 3~6개월, 타인 사주 해석 6~12개월. **"내 사주를 읽는 수준까지는 독학 가능"** — 학습 앱의 타깃 구간과 일치.

→ data/ 자료가 1~8단계를 모두 커버함을 확인 (통변은 종합 매뉴얼 + 실전 훈련으로 대체).

---

## 4. 학습 앱 설계 패턴 리서치

### 듀오링고형 학습 루프 ([Octalysis 분석](https://yukaichou.com/gamification-examples/10-best-gamification-education-apps/), [Duolingo 케이스 스터디](https://www.uladshauchenka.com/p/duolingo-case-study-the-gamification), [디자인 가이드](https://blakecrosley.com/guides/design/duolingo))
- **짧은 레슨 1개/일** 단일 행동에 집중 — 습관 형성이 개별 기능보다 중요
- **즉각 피드백**: 문제 풀이 직후 정답·해설 노출
- **스트릭(연속 학습일)**: 손실 회피 심리, 단 스트릭 프리즈로 압박 완화
- **XP·레벨·진도 시각화**: 성취감 (커리큘럼 맵에서 챕터 잠금 해제 방식)
- 게임 요소는 학습 활동 자체에 내장되어야 함 (장식이 아니라)

### 간격 반복 — SM-2 알고리즘 ([RemNote 해설](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm), [구현 예제](https://github.com/thyagoluciano/sm2), [DEV 해설](https://dev.to/umangsinha12/how-spaced-repetition-actually-works-the-sm-2-algorithm-1ge3))
- 입력: 품질(0~5), 반복 횟수, 이전 ease factor, 이전 간격
- 정답(q≥3): 1회차 1일 → 2회차 6일 → 이후 `간격 × EF`
- `EF' = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))`, 최소 1.3
- 오답(q<3): 반복 횟수 리셋, 간격 1일
- **수십 줄로 구현 가능** — 외부 라이브러리 불필요, localStorage 기반으로도 충분

### 사주 학습 앱에의 적용 시사점
- 명리학 암기 요소(천간지지 물상, 십성 표, 12운성 표, 합충 관계)는 **플래시카드 + SM-2와 정합성이 매우 높음**
- 계산 엔진이 있으므로 듀오링고처럼 **무한 문제 생성** 가능 (정적 문제은행 불필요)
- "내 사주로 배우기" — 학습자 본인 명식을 예제로 쓰면 동기 부여 극대화 (기존 앱과의 차별화 포인트이자 시너지)

---

## 5. 결론

1. **시장 공백 확인**: 인터랙티브 사주 학습 앱은 부재. 만세력 도구 + 유료 강의 사이 빈자리.
2. **자산 적합도 높음**: 계산 엔진(문제 자동 생성·채점) + 교과서 MD(콘텐츠) + LLM 인프라(AI 튜터) = 학습 앱 3대 요소가 이미 확보됨.
3. **신규 개발 핵심**: ① 커리큘럼 구조화(MD→레슨) ② 퀴즈 생성기 ③ 진도·SRS(SM-2) ④ 학습 UI.
4. **권장 방향**: 별도 앱 분리보다 기존 saju_app에 `/learn` 학습 모드 추가 — 인프라 공유, "풀이 보기 ↔ 공부하기" 상호 유입.
