/**
 * 팔택풍수(八宅風水) — 본명괘와 방위별 길흉 산출
 *
 * 방위별 길흉은 표를 외워 넣지 않고 변효법(變爻法)으로 계산한다.
 * 본명괘와 방위괘의 세 효를 비교해 어느 효가 바뀌었는지로 팔성을 정한다.
 * 표를 손으로 옮겨 적으면 대칭이 깨지기 쉬운데, 이 방식은 구조상 항상 대칭이다.
 */

export type Trigram = "坎" | "艮" | "震" | "巽" | "離" | "坤" | "兌" | "乾";
export type Gender = "male" | "female";
export type Star = "생기" | "천의" | "연년" | "복위" | "화해" | "육살" | "오귀" | "절명";
export type House = "동사" | "서사";

/** 각 괘의 효 구성 [하효, 중효, 상효] · 1 = 양(⚊), 0 = 음(⚋) */
const LINES: Record<Trigram, [0 | 1, 0 | 1, 0 | 1]> = {
  乾: [1, 1, 1], // ☰ 건삼련
  兌: [1, 1, 0], // ☱ 태상절
  離: [1, 0, 1], // ☲ 이허중
  震: [1, 0, 0], // ☳ 진하련
  巽: [0, 1, 1], // ☴ 손하절
  坎: [0, 1, 0], // ☵ 감중련
  艮: [0, 0, 1], // ☶ 간상련
  坤: [0, 0, 0], // ☷ 곤삼절
};

/** 변효 조합 → 팔성. 비트 1=하효, 2=중효, 4=상효 */
const BY_MASK: Record<number, Star> = {
  0b000: "복위",
  0b100: "생기",
  0b010: "절명",
  0b001: "화해",
  0b110: "오귀",
  0b011: "천의",
  0b101: "육살",
  0b111: "연년",
};

const NUM_TO_TRIGRAM: Record<number, Trigram> = {
  1: "坎", 2: "坤", 3: "震", 4: "巽",
  6: "乾", 7: "兌", 8: "艮", 9: "離",
};

const EAST_GROUP: Trigram[] = ["坎", "震", "巽", "離"];

export const STAR_INFO: Record<Star, {
  hanja: string; alias: string; good: boolean; rank: number; meaning: string; use: string;
}> = {
  생기: { hanja: "生氣", alias: "탐랑", good: true, rank: 1, meaning: "활력과 발전, 명예", use: "대문·주 활동 공간" },
  천의: { hanja: "天醫", alias: "거문", good: true, rank: 2, meaning: "건강과 재물의 안정", use: "침실·주방" },
  연년: { hanja: "延年", alias: "무곡", good: true, rank: 3, meaning: "화합과 인간관계, 장수", use: "침실·거실" },
  복위: { hanja: "伏位", alias: "보필", good: true, rank: 4, meaning: "평온과 지속", use: "서재·공부방" },
  화해: { hanja: "禍害", alias: "녹존", good: false, rank: 5, meaning: "구설과 다툼", use: "창고·욕실" },
  육살: { hanja: "六殺", alias: "문곡", good: false, rank: 6, meaning: "손재와 불화", use: "창고·복도" },
  오귀: { hanja: "五鬼", alias: "염정", good: false, rank: 7, meaning: "도난·시비·화재", use: "욕실·보일러실" },
  절명: { hanja: "絶命", alias: "파군", good: false, rank: 8, meaning: "질병과 큰 손실", use: "욕실·창고" },
};

export const TRIGRAM_DIRECTION: Record<Trigram, { deg: number; label: string; symbol: string }> = {
  坎: { deg: 0, label: "북", symbol: "☵" },
  艮: { deg: 45, label: "북동", symbol: "☶" },
  震: { deg: 90, label: "동", symbol: "☳" },
  巽: { deg: 135, label: "남동", symbol: "☴" },
  離: { deg: 180, label: "남", symbol: "☲" },
  坤: { deg: 225, label: "남서", symbol: "☷" },
  兌: { deg: 270, label: "서", symbol: "☱" },
  乾: { deg: 315, label: "북서", symbol: "☰" },
};

/** 자리수를 한 자리가 될 때까지 더한다. 1980 → 18 → 9 */
function digitRoot(n: number): number {
  let s = Math.abs(n);
  while (s > 9) {
    s = String(s).split("").reduce((a, c) => a + Number(c), 0);
  }
  return s;
}

/**
 * 본명성 번호(1~9, 5 제외). 남자는 11−근, 여자는 4+근을 9로 순환시킨다.
 * 5는 중궁이라 괘가 없으므로 남자는 2곤, 여자는 8간으로 본다.
 */
export function kuaNumber(year: number, gender: Gender): number {
  const s = digitRoot(year);
  let k = gender === "male" ? 11 - s : 4 + s;
  if (k > 9) k -= 9;
  if (k === 5) k = gender === "male" ? 2 : 8;
  return k;
}

export function mingGua(year: number, gender: Gender): Trigram {
  return NUM_TO_TRIGRAM[kuaNumber(year, gender)];
}

export function houseOf(t: Trigram): House {
  return EAST_GROUP.includes(t) ? "동사" : "서사";
}

/** 본명괘 기준으로 어떤 방위괘가 어떤 팔성에 해당하는지 */
export function starFor(ming: Trigram, direction: Trigram): Star {
  const a = LINES[ming];
  const b = LINES[direction];
  const mask =
    (a[0] !== b[0] ? 0b001 : 0) |
    (a[1] !== b[1] ? 0b010 : 0) |
    (a[2] !== b[2] ? 0b100 : 0);
  return BY_MASK[mask];
}

/** 여덟 방위 전체를 한 번에 */
export function eightMansions(ming: Trigram): Array<{
  trigram: Trigram; deg: number; label: string; symbol: string; star: Star; good: boolean;
}> {
  return (Object.keys(TRIGRAM_DIRECTION) as Trigram[]).map((t) => {
    const star = starFor(ming, t);
    return { trigram: t, ...TRIGRAM_DIRECTION[t], star, good: STAR_INFO[star].good };
  }).sort((x, y) => x.deg - y.deg);
}

/** 특정 방위각(0~360)이 어느 괘 방위에 속하는지 */
export function trigramAt(deg: number): Trigram {
  const order: Trigram[] = ["坎", "艮", "震", "巽", "離", "坤", "兌", "乾"];
  const d = ((deg % 360) + 360) % 360;
  return order[Math.floor(((d + 22.5) % 360) / 45)];
}

/* ────────────────────────────────────────────
   택괘(宅卦) — 집의 기운
   본명괘가 사람의 기운이라면 택괘는 집의 기운이다.
   택괘는 향(向)이 아니라 좌(坐), 즉 집이 등지고 있는 쪽으로 정한다.
   남향집(向南)은 북쪽을 등지므로 감택(坎宅)이 된다.
   ──────────────────────────────────────────── */

export const HOUSE_INFO: Record<Trigram, { name: string; sitFace: string; plain: string }> = {
  坎: { name: "감택", sitFace: "子坐午向", plain: "북쪽을 등진 남향" },
  艮: { name: "간택", sitFace: "艮坐坤向", plain: "북동쪽을 등진 남서향" },
  震: { name: "진택", sitFace: "卯坐酉向", plain: "동쪽을 등진 서향" },
  巽: { name: "손택", sitFace: "巽坐乾向", plain: "남동쪽을 등진 북서향" },
  離: { name: "이택", sitFace: "午坐子向", plain: "남쪽을 등진 북향" },
  坤: { name: "곤택", sitFace: "坤坐艮向", plain: "남서쪽을 등진 북동향" },
  兌: { name: "태택", sitFace: "酉坐卯向", plain: "서쪽을 등진 동향" },
  乾: { name: "건택", sitFace: "乾坐巽向", plain: "북서쪽을 등진 남동향" },
};

/** 향(向) 방위각으로부터 택괘를 구한다. 좌는 향의 반대편. */
export function houseGuaFromFacing(facingDeg: number): Trigram {
  return trigramAt(facingDeg + 180);
}

/**
 * 본명괘와 택괘의 배합 여부.
 * 동사명은 동사택에, 서사명은 서사택에 살아야 배합택으로 본다.
 */
export function compatibility(ming: Trigram, house: Trigram): {
  match: boolean; label: string; mingHouse: House; houseHouse: House; note: string;
} {
  const a = houseOf(ming), b = houseOf(house);
  const match = a === b;
  return {
    match, label: match ? "배합택" : "불배합택",
    mingHouse: a, houseHouse: b,
    note: match
      ? "사람과 집의 기운이 같은 계열입니다. 집의 사길방과 본인의 사길방이 일치합니다."
      : "사람과 집의 기운이 어긋납니다. 집의 길방이 본인에게는 흉방이 되므로, 침실처럼 오래 머무는 곳은 본명괘를 우선하고 대문·주방 배치는 택괘를 따르는 절충이 일반적입니다.",
  };
}

/**
 * 여덟 방위를 본명괘와 택괘 양쪽으로 동시에 판정한다.
 * score 2 = 둘 다 길방, 1 = 한쪽만, 0 = 둘 다 흉방.
 */
export function combinedMansions(ming: Trigram | null, house: Trigram | null): Array<{
  trigram: Trigram; deg: number; label: string; symbol: string;
  mingStar: Star | null; houseStar: Star | null; score: number;
}> {
  return (Object.keys(TRIGRAM_DIRECTION) as Trigram[])
    .map((t) => {
      const mingStar = ming ? starFor(ming, t) : null;
      const houseStar = house ? starFor(house, t) : null;
      const score =
        (mingStar && STAR_INFO[mingStar].good ? 1 : 0) +
        (houseStar && STAR_INFO[houseStar].good ? 1 : 0);
      return { trigram: t, ...TRIGRAM_DIRECTION[t], mingStar, houseStar, score };
    })
    .sort((x, y) => x.deg - y.deg);
}

/**
 * 명리는 입춘을 세수(歲首)로 삼으므로, 입춘 이전 출생자는 전년도로 계산한다.
 * 입춘은 매년 2월 3~5일 사이에서 움직인다. 정밀한 절입시각이 필요하면
 * 기존 명식 계산기의 절기 데이터를 넘겨 쓰는 편이 낫다.
 */
export function solarYearForBazi(birth: Date, lipchunMonthDay: [number, number] = [2, 4]): number {
  const [m, d] = lipchunMonthDay;
  const before =
    birth.getMonth() + 1 < m || (birth.getMonth() + 1 === m && birth.getDate() < d);
  return before ? birth.getFullYear() - 1 : birth.getFullYear();
}

export type MountainKind = "支" | "干" | "維";

/** 24산 — 정북(子)에서 시계방향 15°씩. 支 12지지 / 干 8천간 / 維 4유 */
export const MOUNTAINS: { hanja: string; hangul: string; kind: MountainKind; deg: number }[] = (
  [
    ["子", "자", "支"], ["癸", "계", "干"], ["丑", "축", "支"], ["艮", "간", "維"],
    ["寅", "인", "支"], ["甲", "갑", "干"], ["卯", "묘", "支"], ["乙", "을", "干"],
    ["辰", "진", "支"], ["巽", "손", "維"], ["巳", "사", "支"], ["丙", "병", "干"],
    ["午", "오", "支"], ["丁", "정", "干"], ["未", "미", "支"], ["坤", "곤", "維"],
    ["申", "신", "支"], ["庚", "경", "干"], ["酉", "유", "支"], ["辛", "신", "干"],
    ["戌", "술", "支"], ["乾", "건", "維"], ["亥", "해", "支"], ["壬", "임", "干"],
  ] as [string, string, MountainKind][]
).map(([hanja, hangul, kind], i) => ({ hanja, hangul, kind, deg: i * 15 }));

/* ────────────────────────────────────────────
   공망(空亡) — 경계선에 걸린 좌향
   측정값이 두 산의 경계에 놓이면 기운이 어느 쪽에도 온전히 속하지 못한다고 본다.
   그 경계가 팔괘의 경계까지 겸하면 대공망, 같은 괘 안의 산끼리면 소공망이다.
   허용 오차는 유파마다 다르다. 1.5°를 쓰는 곳도 3°를 쓰는 곳도 있다.
   ──────────────────────────────────────────── */

export type VoidLevel = "대공망" | "소공망" | null;

export interface VoidResult {
  level: VoidLevel;
  /** 가장 가까운 경계선까지의 각거리 */
  distance: number;
  /** 경계선의 방위각 */
  boundary: number;
  /** 경계를 이루는 두 산 */
  between: [string, string];
}

export function voidCheck(deg: number, tolerance = 3): VoidResult {
  const d = ((deg % 360) + 360) % 360;
  /* 산의 경계선은 7.5° + 15°k 지점에 놓인다 */
  const k = Math.round((d - 7.5) / 15);
  const boundary = (((7.5 + 15 * k) % 360) + 360) % 360;
  let distance = Math.abs(d - boundary);
  if (distance > 180) distance = 360 - distance;

  /* 7.5+15k 가 팔괘 경계(22.5+45m)와 겹치려면 k ≡ 1 (mod 3) */
  const isGuaBoundary = ((k % 3) + 3) % 3 === 1;
  const lo = MOUNTAINS[((k % 24) + 24) % 24];
  const hi = MOUNTAINS[(((k + 1) % 24) + 24) % 24];

  return {
    level: distance <= tolerance ? (isGuaBoundary ? "대공망" : "소공망") : null,
    distance,
    boundary,
    between: [lo.hanja, hi.hanja],
  };
}

export const VOID_NOTE: Record<Exclude<VoidLevel, null>, string> = {
  대공망:
    "팔괘의 경계에 걸쳤습니다. 좌향이 두 괘 어디에도 온전히 들지 못하는 자리라 팔택 판정 자체가 흔들립니다. 측정 위치를 옮기거나 기준선을 다시 잡으세요.",
  소공망:
    "같은 괘 안이지만 두 산의 경계에 걸쳤습니다. 괘 판정은 유효하나 24산 단위로 보는 감정에서는 피하는 자리입니다.",
};

/* ────────────────────────────────────────────
   용도별 배치 — 팔택파 통설
   대문과 주방은 집의 기운(택괘), 침실과 서재는 사람의 기운(본명괘)을 따른다.
   주방만 규칙이 거꾸로다. 흉방에 앉혀 흉기를 누르고 불길은 길방으로 돌린다.
   ──────────────────────────────────────────── */

export interface PlacementRule {
  room: string;
  basis: "命" | "宅";
  stars: Star[];
  note?: string;
}

const PLACEMENT_RULES: PlacementRule[] = [
  { room: "대문·현관", basis: "宅", stars: ["생기", "천의", "연년"],
    note: "집으로 드는 기운의 입구라 택괘를 따릅니다." },
  { room: "안방 침대 머리", basis: "命", stars: ["생기", "천의", "연년"],
    note: "가장 오래 머무는 곳이라 사람의 본명괘를 우선합니다." },
  { room: "서재·공부방", basis: "命", stars: ["복위", "생기"],
    note: "복위는 집중과 지속을 돕는 자리로 봅니다." },
  { room: "거실", basis: "宅", stars: ["생기", "연년"] },
  { room: "금고·재물", basis: "命", stars: ["천의"] },
  { room: "주방 화구", basis: "宅", stars: ["절명", "오귀", "화해", "육살"],
    note: "압살(壓煞). 주방은 흉방에 앉히되 불길이 향하는 쪽은 길방으로 돌립니다." },
  { room: "화장실·창고", basis: "宅", stars: ["절명", "오귀", "화해", "육살"],
    note: "흉방을 눌러 두는 용도입니다." },
];

export function placementAdvice(
  ming: Trigram | null,
  house: Trigram | null
): Array<PlacementRule & {
  directions: { star: Star; trigram: Trigram; label: string }[] | null;
}> {
  const keys = Object.keys(TRIGRAM_DIRECTION) as Trigram[];
  return PLACEMENT_RULES.map((r) => {
    const base = r.basis === "命" ? ming : house;
    if (!base) return { ...r, directions: null };
    const directions = r.stars.map((star) => {
      const trigram = keys.find((t) => starFor(base, t) === star)!;
      return { star, trigram, label: TRIGRAM_DIRECTION[trigram].label };
    });
    return { ...r, directions };
  });
}
