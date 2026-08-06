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
