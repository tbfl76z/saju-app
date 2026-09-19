# psx-l10n — PS1 디스크 한글화 툴킷

PS1(및 PC) CD 이미지를 분석하고 텍스트를 찾아내기 위한 도구 모음.
한글화 작업의 1단계(디스크 식별 → 파일 추출 → 텍스트 위치 파악)를 담당한다.

## 요구사항

Python 3.8+ 외에 의존성 없음.

## 사용법

### 1. 디스크 식별

이미지가 PS1 디스크인지 PC CD인지, 어떤 섹터 형식인지 판정한다.

```
python3 psxtool.py identify 게임.bin
```

`SYSTEM.CNF`의 `BOOT = cdrom:\SLPS_012.34;1` 줄에서 게임 시리얼을 읽을 수 있고,
시리얼 접두사로 지역을 알 수 있다:

| 접두사 | 지역 |
|---|---|
| `SLPS` / `SLPM` / `SCPS` | 일본 |
| `SLUS` / `SCUS` | 북미 |
| `SLES` / `SCES` | 유럽 |

### 2. 파일 목록

```
python3 psxtool.py ls 게임.bin --all
```

### 3. 전체 추출

```
python3 psxtool.py extract 게임.bin extracted/
```

파일명 끝의 ISO9660 버전 접미사(`;1`)는 자동으로 제거된다.

### 4. 텍스트 인코딩 분포 스캔

이미지 전체를 훑어 Shift-JIS(일본어)와 EUC-KR(한글) 문자가 각각 얼마나,
어느 구간에 들어있는지 센다. 대사가 어느 파일에 몰려 있는지 찾는 출발점.

```
python3 psxtool.py scan-text 게임.bin --top 20
```

주의: 바이트 범위가 겹쳐 오탐이 섞인다. 절대 수치가 아니라 **비율과 편중 구간**을
보는 용도다. 자체 인코딩(폰트 타일 인덱스)을 쓰는 게임은 둘 다 낮게 나오는데,
그 자체가 "커스텀 인코딩이다"라는 신호다.

## 지원 섹터 형식

`identify`가 자동 판별한다.

| 형식 | 설명 |
|---|---|
| 2352 / offset 24 | MODE2/FORM1 raw — PS1 디스크의 표준 |
| 2352 / offset 16 | MODE1/2352 raw |
| 2048 / offset 0 | 순수 ISO — PC 데이터 CD |
| 2336 / offset 8 | MODE2 (sync 헤더 없음) |
| 2448 | subchannel 포함 덤프 |

`.chd`, `.ecm`, `.pbp`로 압축된 이미지는 먼저 `.bin`으로 풀어야 한다
(`chdman extractcd`, `unecm`).

## 검증

합성 ISO9660 이미지(순수 ISO / MODE2 raw 양쪽)로 파서를 검증했고,
추출 결과가 원본 바이트와 일치함을 확인했다.

## psxsniff.py — 파일 정체 판정 / 아카이브 분석

추출한 파일들은 대부분 `.BIN`, `.DAT` 같은 무의미한 이름이다. 각 파일이
실제로 무엇인지 판정해서 "대사가 어디 있는가"를 좁힌다.

```
python3 psxsniff.py triage extracted/
```

판정 종류: `PSX-EXE`, `TIM`, `TIM 포함`, `VAG`, `TEXT`, `TEXT?`(일본어/한국어),
`ARCHIVE?`, `COMPRESSED?`, `SPARSE`, `UNKNOWN`.

`ARCHIVE?`로 잡힌 파일은 내부 오프셋 테이블을 분석하고 조각으로 나눌 수 있다.

```
python3 psxsniff.py archive extracted/DATA/SCRIPT.DAT --unpack unpacked/
```

세 가지 헤더 변형을 검사하고, **첫 데이터가 헤더 바로 뒤에서 시작하는가**라는
자기일관성 검사로 어느 해석이 맞는지 가린다:

| 변형 | 구조 |
|---|---|
| 직접 오프셋 배열 | 파일 선두부터 바로 u32 오프셋들 |
| 개수 + 오프셋 배열 | 선두 u32가 엔트리 개수, 그 뒤가 오프셋들 |
| 섹터 단위 오프셋 | 오프셋이 바이트가 아니라 2048바이트 LBA 단위 |

언팩한 조각에 다시 `triage`를 돌리면 내용물을 확인할 수 있다.

## timtool.py — 폰트 찾기

TIM은 PS1의 표준 이미지 포맷이고, **폰트는 거의 항상 TIM으로 들어있다.**
아카이브 중간에 박혀 있어도 매직 넘버 스캔으로 찾아낸다.

```
python3 timtool.py scan extracted/
python3 timtool.py extract extracted/ fonts/ --opaque --all-cluts
```

의존성 없이 PNG를 직접 생성한다(Pillow 불필요). 4/8/16/24bpp와 다중 팔레트를
지원한다.

폰트 후보를 고르는 요령:

- 4bpp이고 크기가 작으며 같은 크기가 여러 장 연속으로 나오는 것
- 128×128 또는 256×256에 글자가 격자로 박힌 것
- `--opaque`를 주면 투명 배경이 사라져 글자 모양을 보기 쉽다

## 검증

합성 데이터로 각 도구를 검증했다.

- ISO9660 파서: 순수 ISO와 MODE2/2352 raw 양쪽에서 파싱, 추출 바이트 일치 확인
- TIM 파서: 쓰레기 데이터 사이에 박은 TIM을 정확한 오프셋에서 발견,
  PNG로 변환한 결과가 원본 픽셀·팔레트 색상값과 완전 일치
- 아카이브 탐지: 두 가지 헤더 변형을 각각 올바르게 판별하고 조각 경계 정확
- 언어 판정: 랜덤 바이트를 한국어로 오탐하던 문제를 확률 기반 임계값으로 해결
  (EUC-KR 한글은 바이트 범위가 넓어 랜덤에서도 3.6%가 우연히 일치한다)

## 작업 순서

```
identify → ls → extract → triage → archive --unpack → triage → timtool
```

## 아직 미구현

1. 폰트 타일 ↔ 문자 대응표(테이블) 생성
2. 포인터 테이블 탐색기
3. 대사 덤프 / 재삽입 (길이 변화에 따른 포인터 재계산 포함)
4. 한글 폰트 생성 및 렌더러 훅 (MIPS ASM)
5. `mkpsxiso` 리빌드 + xdelta 패치 생성
