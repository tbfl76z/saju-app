/*
 * 현공비성(玄空飛星) 계산 — 순수 함수만, 의존성 없음.
 *
 * 산법(표준 문헌 기준):
 * - 삼원9운: 1864년 상원 1운 기점, 운마다 20년. 현재 9운(2024~2043).
 * - 운반(運盤): 운수를 중궁에 넣고 낙서 순서로 순비(順飛).
 * - 24산: 팔괘 궁마다 지원룡·천원룡·인원룡 3산.
 * - 산성(山星): 좌궁의 운반수를 중궁에 → 그 수의 낙서 원궁에서 좌산과 같은
 *   원룡 위치 산의 음양이 양이면 순비, 음이면 역비. (5는 원궁이 없어 좌산 자체 음양)
 * - 향성(向星): 향궁의 운반수로 동일 로직(향산 기준).
 * - 격국: 당운수의 산성·향성 위치로 왕산왕향/상산하수/쌍성회향/쌍성회좌 판정.
 *
 * 검증: 9운 子山午向=쌍성회좌, 9운 午山子向=쌍성회향, 8운 子山午向=쌍성회향 —
 * 문헌 표준 비성반과 대조 확인(scripts 참고).
 */

export type Palace = "坎" | "艮" | "震" | "巽" | "離" | "坤" | "兌" | "乾" | "中";
export type YuanLong = "지원룡" | "천원룡" | "인원룡";

/** 낙서 궁 ↔ 수 (중궁 5) */
export const PALACE_NUM: Record<Palace, number> = {
  坎: 1, 坤: 2, 震: 3, 巽: 4, 中: 5, 乾: 6, 兌: 7, 艮: 8, 離: 9,
};
export const NUM_PALACE: Record<number, Palace> = {
  1: "坎", 2: "坤", 3: "震", 4: "巽", 5: "中", 6: "乾", 7: "兌", 8: "艮", 9: "離",
};

/** 순비(順飛) 궁 순서 — 중궁에서 시작해 乾→兌→艮→離→坎→坤→震→巽 */
const FLY_ORDER: Palace[] = ["中", "乾", "兌", "艮", "離", "坎", "坤", "震", "巽"];

/** 궁별 24산 [지원룡, 천원룡, 인원룡] — 나경 시계방향 순서와 동일 */
export const PALACE_MOUNTAINS: Record<Exclude<Palace, "中">, [string, string, string]> = {
  坎: ["壬", "子", "癸"], 艮: ["丑", "艮", "寅"], 震: ["甲", "卯", "乙"],
  巽: ["辰", "巽", "巳"], 離: ["丙", "午", "丁"], 坤: ["未", "坤", "申"],
  兌: ["庚", "酉", "辛"], 乾: ["戌", "乾", "亥"],
};

/** 24산 음양 — 양(+1)=순비, 음(-1)=역비
 *  지원룡: 甲庚壬丙 양 / 辰戌丑未 음
 *  천원룡: 乾坤艮巽 양 / 子午卯酉 음
 *  인원룡: 寅申巳亥 양 / 乙辛丁癸 음 */
export const MOUNTAIN_YINYANG: Record<string, 1 | -1> = {
  甲: 1, 庚: 1, 壬: 1, 丙: 1, 辰: -1, 戌: -1, 丑: -1, 未: -1,
  乾: 1, 坤: 1, 艮: 1, 巽: 1, 子: -1, 午: -1, 卯: -1, 酉: -1,
  寅: 1, 申: 1, 巳: 1, 亥: 1, 乙: -1, 辛: -1, 丁: -1, 癸: -1,
};

/** 24산 → 소속 궁/원룡/중심 방위각(도) — 子=0(북), 시계방향 15도 간격 */
export interface MountainInfo { palace: Exclude<Palace, "中">; yuan: YuanLong; deg: number; }
export const MOUNTAIN_INFO: Record<string, MountainInfo> = (() => {
  // 나경 시계방향: 坎(壬子癸) → 艮(丑艮寅) → 震(甲卯乙) → ... 子 중심 0도, 각 산 15도
  const order: Exclude<Palace, "中">[] = ["坎", "艮", "震", "巽", "離", "坤", "兌", "乾"];
  const yuans: YuanLong[] = ["지원룡", "천원룡", "인원룡"];
  const out: Record<string, MountainInfo> = {};
  order.forEach((p, pi) => {
    PALACE_MOUNTAINS[p].forEach((m, mi) => {
      // 坎궁 천원룡 子가 0도. 궁 시작(지원룡)은 子-15도.
      const deg = ((pi * 45 + (mi - 1) * 15) % 360 + 360) % 360;
      out[m] = { palace: p, yuan: yuans[mi], deg };
    });
  });
  return out;
})();

/** 좌(坐) → 향(向): 정반대 산 */
export function oppositeMountain(m: string): string {
  const info = MOUNTAIN_INFO[m];
  const target = (info.deg + 180) % 360;
  for (const [name, i] of Object.entries(MOUNTAIN_INFO)) {
    if (i.deg === target) return name;
  }
  throw new Error(`대향 산 없음: ${m}`);
}

/** 방위각(도) → 24산 (각 산 ±7.5도) */
export function mountainFromDeg(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  let best = "子", bestDiff = 999;
  for (const [name, i] of Object.entries(MOUNTAIN_INFO)) {
    let diff = Math.abs(d - i.deg);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) { bestDiff = diff; best = name; }
  }
  return best;
}

/** 연도 → 운(1~9). 1864년 상원 1운 기점, 20년 단위. */
export function periodOf(year: number): number {
  return ((Math.floor((year - 1864) / 20) % 9) + 9) % 9 + 1;
}
/** 운 → 기간 [시작, 끝] (가장 최근 주기) */
export function periodYears(period: number): [number, number] {
  // 9운=2024~2043 기준 역산
  const start = 1864 + (period - 1) * 20 + 160; // 최근 주기(1864+180=2044 직전)
  return start > 2043 ? [start - 180, start - 161] : [start, start + 19];
}

/** 중궁수와 순/역으로 9궁 배치 — palace→수 */
export function flyChart(center: number, forward: boolean): Record<Palace, number> {
  const out = {} as Record<Palace, number>;
  FLY_ORDER.forEach((p, i) => {
    const n = forward ? center + i : center - i;
    out[p] = ((n - 1) % 9 + 9) % 9 + 1;
  });
  return out;
}

export interface StarChart {
  period: number;                       // 운(元運)
  sitting: string; facing: string;      // 좌/향 24산
  base: Record<Palace, number>;         // 운반
  mountain: Record<Palace, number>;     // 산성
  water: Record<Palace, number>;        // 향성
  structure: string;                    // 격국(왕산왕향 등)
  structureNote: string;
}

/** 5 특칙 포함: 입중수의 원궁에서 원룡 위치 산의 음양 → 순/역 */
function flyDirection(centerNum: number, yuan: YuanLong, selfMountain: string): boolean {
  if (centerNum === 5) return MOUNTAIN_YINYANG[selfMountain] === 1; // 5는 좌/향산 자체 음양
  const palace = NUM_PALACE[centerNum] as Exclude<Palace, "中">;
  const idx = yuan === "지원룡" ? 0 : yuan === "천원룡" ? 1 : 2;
  const mountain = PALACE_MOUNTAINS[palace][idx];
  return MOUNTAIN_YINYANG[mountain] === 1;
}

/** 좌산·운(또는 연도)으로 비성반 산출 */
export function starChart(sitting: string, period: number): StarChart {
  const sitInfo = MOUNTAIN_INFO[sitting];
  if (!sitInfo) throw new Error(`알 수 없는 좌산: ${sitting}`);
  const facing = oppositeMountain(sitting);
  const faceInfo = MOUNTAIN_INFO[facing];

  const base = flyChart(period, true); // 운반은 항상 순비

  // 산성: 좌궁 운반수 입중
  const mCenter = base[sitInfo.palace];
  const mForward = flyDirection(mCenter, sitInfo.yuan, sitting);
  const mountain = flyChart(mCenter, mForward);

  // 향성: 향궁 운반수 입중
  const wCenter = base[faceInfo.palace];
  const wForward = flyDirection(wCenter, faceInfo.yuan, facing);
  const water = flyChart(wCenter, wForward);

  // 격국: 당운수 위치
  const mAtSit = mountain[sitInfo.palace] === period;   // 산성 당운이 좌궁
  const mAtFace = mountain[faceInfo.palace] === period; // 산성 당운이 향궁
  const wAtSit = water[sitInfo.palace] === period;
  const wAtFace = water[faceInfo.palace] === period;
  let structure = "평국", structureNote = "당운수가 좌·향궁 밖에 있습니다. 궁별 성요 조합으로 판단합니다.";
  if (mAtSit && wAtFace) { structure = "왕산왕향"; structureNote = "정재정정(丁財兩旺) — 산·향 모두 득위한 최길국. 뒤가 실하고 앞이 트인 지형이면 인정·재물 모두 왕성합니다."; }
  else if (mAtFace && wAtSit) { structure = "상산하수"; structureNote = "산성이 물에, 향성이 산에 — 손정손재(損丁損財)의 흉국. 지형이 반배(뒤가 낮고 앞이 높으면) 오히려 화해될 수 있습니다."; }
  else if (mAtFace && wAtFace) { structure = "쌍성회향"; structureNote = "산·향성이 모두 향궁에 — 재물은 왕하나 인정은 부족. 향쪽에 물과 그 너머 산이 함께 있으면 겸수할 수 있습니다."; }
  else if (mAtSit && wAtSit) { structure = "쌍성회좌"; structureNote = "산·향성이 모두 좌궁에 — 인정은 왕하나 재물은 부족. 좌쪽에 산과 물이 함께 있으면 겸수할 수 있습니다."; }

  return { period, sitting, facing, base, mountain, water, structure, structureNote };
}

/** 성수(星數) 이름 — 표시용 */
export const STAR_NAMES: Record<number, string> = {
  1: "一白", 2: "二黑", 3: "三碧", 4: "四綠", 5: "五黃", 6: "六白", 7: "七赤", 8: "八白", 9: "九紫",
};
/** 성수 기운(당운·생기·퇴기·살기) — 안내용.
 *  생기는 다음 한 운만 취한다(9운이면 1白). 그다음 운까지 생기로 보는 관행도 있으나
 *  9운 기준 2黑은 병부성이라 실무에서 생기로 쓰지 않으므로 보수적으로 좁혔다. */
export function starMood(n: number, period: number): "왕기" | "생기" | "퇴기" | "쇠살" {
  if (n === period) return "왕기";
  const next = (period % 9) + 1;
  if (n === next) return "생기";
  const prev = ((period - 2 + 9) % 9) + 1;
  if (n === prev) return "퇴기";
  return "쇠살";
}

/* ── 연자백(年紫白) — 해마다 도는 유년 비성 ── */

/** 그 해의 연자백 중궁수 — 1864(갑자, 1白 입중) 기점 매년 역행.
 *  입춘(2/4경) 기준 연도를 넣을 것. 예: 2024=3碧, 2025=2黑, 2026=1白. */
export function annualCenter(year: number): number {
  return ((1864 - year) % 9 + 9) % 9 + 1;
}

/** 연자백 반(盤) — 중궁수를 넣고 순비 */
export function annualChart(year: number): Record<Palace, number> {
  return flyChart(annualCenter(year), true);
}

/* ── 월자백(月紫白) — 달마다 도는 유월 비성 ── */

// 각 월(寅월=정월 기준)의 절입일 근사 [월, 일] — 입춘 2/4, 경칩 3/6, …
// 절입 시각은 해마다 ±1일 오차가 있으므로 경계일엔 주의 문구를 띄운다.
const _JEOLIP: [number, number][] = [
  [2, 4], [3, 6], [4, 5], [5, 6], [6, 6], [7, 7],
  [8, 8], [9, 8], [10, 8], [11, 7], [12, 7], [1, 6],
];

/** 날짜 → (입춘 기준 연도, 월 인덱스 0=寅월, 절기 경계 인접 여부) */
export function solarMonthIndex(date: Date): { year: number; monthIdx: number; nearBoundary: boolean } {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  // 입춘 이전은 전년 축월 소속
  const year = m < 2 || (m === 2 && d < _JEOLIP[0][1]) ? y - 1 : y;
  let monthIdx = 11; // 기본 축월(소한~입춘)
  for (let i = 0; i < 12; i++) {
    const [sm, sd] = _JEOLIP[i];
    const [em, ed] = _JEOLIP[(i + 1) % 12];
    const afterStart = m > sm || (m === sm && d >= sd);
    const beforeEnd = em < sm ? (m < em || (m === em && d < ed) || m > sm || (m === sm && d >= sd)) : (m < em || (m === em && d < ed));
    if (i === 11) { // 축월: 1/6~2/3 (연말 걸침)
      if ((m === 1 && d >= 6) || (m === 2 && d < _JEOLIP[0][1]) || (m === 12 && d >= 31)) { monthIdx = 11; break; }
    } else if (afterStart && beforeEnd) { monthIdx = i; break; }
  }
  // 절입일 ±1일이면 경계 주의
  const nearBoundary = _JEOLIP.some(([jm, jd]) => m === jm && Math.abs(d - jd) <= 1);
  return { year, monthIdx, nearBoundary };
}

/** 월자백 중궁수 — 년지 삼합군별 정월(寅월) 기점: 子午卯酉=8白, 辰戌丑未=5黃, 寅申巳亥=2黑. 매월 역행. */
export function monthlyCenter(date: Date): { center: number; year: number; monthIdx: number; nearBoundary: boolean } {
  const { year, monthIdx, nearBoundary } = solarMonthIndex(date);
  const branch = ((year - 4) % 12 + 12) % 12; // 0=子
  const group = branch % 3;                    // 0: 子午卯酉 / 1: 丑辰未戌 / 2: 寅巳申亥
  const start = group === 0 ? 8 : group === 1 ? 5 : 2;
  const center = ((start - 1 - monthIdx) % 9 + 9) % 9 + 1;
  return { center, year, monthIdx, nearBoundary };
}

/** 월자백 반(盤) */
export function monthlyChart(date: Date): Record<Palace, number> {
  return flyChart(monthlyCenter(date).center, true);
}

/* ── 성요 조합(산성·향성 동궁) 해석 — 심씨현공 계열 통용 조합 ── */

export interface ComboNote { grade: "길" | "흉"; name: string; note: string }
const _COMBOS: Record<string, ComboNote> = {
  "2,5": { grade: "흉", name: "이흑오황", note: "질병·재해 조합 — 침실·주방 부적합, 이 방위 공사·동토 금지" },
  "5,5": { grade: "흉", name: "오황중첩", note: "대흉 — 절대 동토 금지, 조용히 둘 것" },
  "2,2": { grade: "흉", name: "병부중첩", note: "건강 유의 — 환자·노약자 방 배치 회피" },
  "2,3": { grade: "흉", name: "투우살", note: "시비·구설·소송 주의 — 다툼이 잦아지는 조합" },
  "6,7": { grade: "흉", name: "교검살", note: "금속 상해·다툼 주의 — 날카로운 물건 정리" },
  "7,9": { grade: "흉", name: "화풍", note: "화재·화상 주의 — 화기 관리 철저" },
  "1,4": { grade: "길", name: "문창", note: "일사동궁(一四同宮) — 학업·시험·문서·창작에 길, 공부방 적합" },
  "1,6": { grade: "길", name: "문무귀인", note: "관운·명예·귀인 조력에 길" },
  "8,9": { grade: "길", name: "생왕경사", note: "재물·경사에 길 — 출입구·거실 적합" },
  "1,9": { grade: "길", name: "수화기제", note: "왕기·생기 만남 — 발전·성취에 길" },
  "9,9": { grade: "길", name: "왕기중첩", note: "9운 당왕 기운 집중 — 핵심 공간(출입구·안방) 적합" },
  "8,8": { grade: "길", name: "재성중첩", note: "재물 기운 — 금고·사업 공간에 길" },
  "1,1": { grade: "길", name: "생기중첩", note: "새 기회·인연의 기운" },
};

/** 산성·향성 조합의 통용 해석 (순서 무관, 등록된 주요 조합만 반환) */
export function comboFor(a: number, b: number): ComboNote | null {
  const key = a <= b ? `${a},${b}` : `${b},${a}`;
  return _COMBOS[key] ?? null;
}
