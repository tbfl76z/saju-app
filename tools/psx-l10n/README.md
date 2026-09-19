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

### 4. 한국어/일본어가 들어있는지 판정

이미지 안에 실제 텍스트가 있는지, 어느 언어인지 판정한다.

```
python3 psxtool.py scan-text 게임.bin
```

**개수를 세지 않고 "연속"을 본다.** 700MB 이미지에서 2바이트 문자를 개수로
세면 무용지물이다. EUC-KR 한글은 바이트 범위가 넓어 **랜덤 데이터에서도
3.6%가 우연히 한글처럼 보이기 때문에**, 그래픽·음성 데이터에서만 수백만 건의
오탐이 나온다.

대신 연속된 덩어리를 찾는다. 한글 6글자가 연달아 나올 우연 확률은
0.036⁶ ≈ 2e-9 이라, 700MB를 다 뒤져도 우연히는 거의 나오지 않는다.
띄어쓰기와 문장부호는 덩어리를 끊지 않는다.

일본어는 Shift-JIS의 바이트 범위가 13.5%로 훨씬 넓어 이것만으로 부족하다.
그래서 **가나가 25% 이상 섞여 있을 것**을 추가로 요구한다. 실제 일본어
문장은 가나가 절반 이상이지만, 우연히 만들어진 덩어리는 희귀한 한자뿐이다.

판정은 세 단계로 나온다:

| 표시 | 의미 |
|---|---|
| ✅ | 텍스트가 확실히 존재 (최장 덩어리가 우연으로 설명되지 않음) |
| ⚠️ | 소량 존재 가능 — 샘플을 눈으로 확인할 것 |
| ❌ | 없음 (랜덤 기대치 수준) |

발견된 문자열은 오프셋과 함께 디코딩해서 보여주므로, 진짜 대사인지 바로
눈으로 확인할 수 있다.

양쪽 다 ❌로 나오면 **자체 인코딩(폰트 타일 인덱스)을 쓰는 빌드**라는 뜻이다.
그 경우 `timtool.py scan`으로 폰트부터 찾아야 한다.

옵션: `--min-run`(기본 6), `--samples`(기본 15), `--width`(기본 40)

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

## sjisdump.py — 일본어 문자열 덤프

아카이브 안의 Shift-JIS 문자열을 오프셋과 함께 뽑는다. 각 문자열이 무슨
바이트로 끝나는지도 기록해서 게임의 제어 코드(줄바꿈·화자·종료)를
역추적할 수 있다.

```
python3 sjisdump.py map  G2DATA1.DAT             # 문자열이 몰린 영역 지도
python3 sjisdump.py dump G2DATA1.DAT -o script.tsv
python3 sjisdump.py peek G2DATA1.DAT 0x75874C    # 특정 위치를 16진수로
```

`dump`의 TSV 열: `offset, bytes, chars, gap, term, text`.
`gap`은 직전 문자열 끝에서 이 문자열까지의 바이트 수 — 일정하면 고정 길이
레코드. `term`은 문자열 직후 4바이트 — 제어 코드 후보.

## tileview.py — 헤더 없는 폰트/타일 보기

TIM 헤더 없이 EXE나 아카이브에 그대로 박힌 비트맵을 격자 타일로 렌더한다.
폰트 구간을 맞게 잡으면 글자가 줄줄이 보인다. 의존성 없이 PNG를 만든다.

```
python3 tileview.py SLPS_023.11 0xD03DC font.png --bpp 1 --tile 16x13 --per-row 32 --count 524
python3 tileview.py DATA.BIN 0x1000 raw.png --linear --width 128        # 그냥 연속 비트맵으로
```

1bpp는 MSB 우선, 4/8bpp는 `--lsb`로 PS1 니블 순서를 맞춘다.

## mipsdis.py — PS-X EXE 미니 디스어셈블러

폰트 렌더러·문자열 루틴을 읽기 위한 최소 MIPS R3000 디스어셈블러. PS-X EXE 헤더로
파일 오프셋 ↔ RAM 주소를 자동 변환하고 `lui`+`addiu/lw/sw` 쌍의 합성 주소를 주석으로 단다.

```
python3 mipsdis.py SLPS_023.11 0x80019A50 --len 200     # 디스어셈블
python3 mipsdis.py SLPS_023.11 --find-ref 0x800DFBDC    # 이 주소를 만드는 lui/addiu 위치
python3 mipsdis.py SLPS_023.11 --calls 0x80019A50       # 이 함수를 jal 하는 위치
```

## hangulfont.py — BDF 폰트를 게임 폰트 슬롯으로

TIM이 아닌 원시 1bpp 폰트(글리프당 13행 × u16)를 쓰는 게임에 한글 비트맵 폰트를 넣기 위한
변환기. Galmuri11 같은 BDF에서 KS X 1001 2,350자를 뽑아 26바이트 글리프 블롭으로 만들고,
게임 렌더러의 가변폭 규칙으로 문장을 미리 렌더해 원본 글자와 크기를 비교한다.

```
python3 hangulfont.py info    fonts/Galmuri11.bdf
python3 hangulfont.py build   fonts/Galmuri11.bdf out.bin --map map.tsv --png sheet.png
python3 hangulfont.py preview fonts/Galmuri11.bdf "확인할 문장" out.png --scale 3 --game-exe SLPS_023.11
```

`--baseline`(기준선이 놓이는 슬롯 행, 기본 11)과 `--dx`(가로 오프셋, 기본 1)로 위치를 맞춘다.
슬롯 밖으로 잘린 글자가 있으면 경고한다.

## g2text.py / koremap.py / g2patch.py — 텍스트 파이프라인

```
g2text.py chars   SLPS_023.11 G2DATA1.DAT       # 실제 쓰이는 문자 집계 (슬롯 선정용)
koremap.py build  SLPS_023.11 G2DATA1.DAT -o koremap.tsv
hangulfont.py patch Galmuri11.bdf koremap.tsv SLPS_023.11 -o SLPS_023.11.ko
g2patch.py table  G2DATA1.DAT --preset items -o tr_items.tsv    # 고정 레코드 → 번역 TSV
g2patch.py exestr G2DATA1.DAT -o tr_data.tsv                    # NUL 종결 문자열 → 번역 TSV
g2patch.py apply  G2DATA1.DAT tr_items.tsv koremap.tsv -o G2DATA1.ko.DAT
hangulfont.py shot SLPS_023.11.ko out.png --file G2DATA1.ko.DAT --offset 0xD008
```

`shot` 은 게임 렌더러와 똑같이 **코드 → 리맵 테이블 → 글리프**를 거쳐 그리므로,
에뮬레이터 없이도 화면에 무엇이 나올지 확인할 수 있다. 원본 바이트를 넣으면 원본
화면과 같은 그림이 나오는 것으로 경로가 맞는지 검증했다.

문자 집계와 문자열 추출 모두 **오탐을 거르는 것이 핵심**이다. 700MB 짜리 바이너리에서
"2바이트 문자로 보이는 바이트쌍"을 세면 그래픽·코드 데이터가 대량으로 걸린다
(JIS 2수준 한자가 1,387개 쓰이는 것처럼 보였지만 실제로는 71개, EXE 문자열은
2,201개처럼 보였지만 실제로는 243개).

`exestr` 가 쓰는 판정:

1. **NUL 부터 NUL 까지 전체가** 유효한 Shift-JIS/ASCII 여야 한다. 중간부터 보면
   코드 바이트가 통과한다. 덤으로 `%s %d レベルアップ` 처럼 ASCII 로 시작하는
   문자열이 앞부분까지 온전히 잡힌다.
2. 2바이트 문자가 **글자다운 범위**여야 한다(그리스·키릴·괘선 제외). 가나나 한자 최소 하나.
3. **혼자 떨어져 있는 짧은 것**은 버린다 — 진짜 문자열은 풀에 여럿 붙어 있거나,
   포인터로 참조되거나, 셋 글자 이상이다.

앞이 NUL 이 아니라 포인터 배열인 문자열(마법명 표 등)은 1번으로 못 찾으므로,
PS-X EXE 일 때는 EXE 안을 가리키는 u32 도 후보 시작점으로 쓴다.

## 창세기전2 PS1 프로토타입 — 확인된 구조

폰용 검사 페이지로 두 디스크를 검사해 확인한 내용.

- 시리얼 SLPS-02311 / 02312 (정식 2장 세트). MODE2/2352
- `G2DATA1.DAT` (76MB): **일본어 스크립트 전체** — Shift-JIS 평문, 7,321개 덩어리
- `G2DATA2.DAT` (274MB): 텍스트 0건 → 그래픽·사운드
- `SLPS_023.11` (1.1MB, 디스크 1에만 있음): 시스템 메시지 133건
- `XA/`, `XA3/`: 동영상·음성. 디스크 간에 다른 건 이것뿐
- 두 디스크의 `G2DATA1.DAT`, `G2DATA2.DAT`는 파일 내 오프셋까지 완전히 동일
  → **한 번 한글화해서 두 디스크에 같이 적용**
- 한국어 텍스트 없음. 한글 판정으로 잡힌 건 전부 `0xB8` 채움 패턴

## 검증

합성 데이터로 각 도구를 검증했다.

- ISO9660 파서: 순수 ISO와 MODE2/2352 raw 양쪽에서 파싱, 추출 바이트 일치 확인
- TIM 파서: 쓰레기 데이터 사이에 박은 TIM을 정확한 오프셋에서 발견,
  PNG로 변환한 결과가 원본 픽셀·팔레트 색상값과 완전 일치
- 아카이브 탐지: 두 가지 헤더 변형을 각각 올바르게 판별하고 조각 경계 정확
- 타일 렌더: 합성 16×16 1bpp 글리프(대각선·테두리)를 정확한 위치에 그리는지 확인
- 디스어셈블러: `lui/addiu/lw/jal/jr/bne/sltiu/li` 등 9개 알려진 인코딩 일치 확인
- BDF 변환: 합성 글리프(ox/oy 양·음)가 기준선 기준 정확한 행·열에 놓이고 실폭·진행 폭 계산이 맞는지 확인
- 텍스트 섹션 파서: 합성 섹션을 인식하고, offs·size를 일부러 어긋낸 것은 거부
- 제자리 교체: 공간에 맞으면 넣고 주변 바이트는 그대로, 초과하면 파일을 건드리지 않음
- 코드 ↔ 글리프 인덱스: 리맵 테이블 왕복, 0x7F 건너뛰기 연속성, 2수준 3,390개 전수
- ASCII → 전각 변환: 게임 테이블로 계산한 값이 알려진 대응(Ａ Ｚ ０ ９ ！ ？ ． ，)과 일치
- 언어 판정: 랜덤 바이트를 한국어로 오탐하던 문제를 확률 기반 임계값으로 해결
  (EUC-KR 한글은 바이트 범위가 넓어 랜덤에서도 3.6%가 우연히 일치한다)

## 작업 순서

```
identify → ls → extract → triage → archive --unpack → triage → timtool
```

## 아직 미구현

1. 텍스트 섹션 **재삽입** (길이 증가 시 EXE 인덱스 재계산) — 덤프는 `g2text.py`로 완료
2. NUL 종결 대사(전체의 95%)의 위치 목록화
3. `mkpsxiso` 리빌드 + xdelta 패치 생성

확인된 세부 구조(인덱스 위치, 텍스트 섹션 형식, 폰트 좌표)는 `CLAUDE.md`에 있다.
