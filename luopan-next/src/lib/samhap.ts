/*
 * 삼합수법(三合水法) — 4국 12포태 계산. 순수 함수만, 의존성 없음.
 *
 * 산법(표준):
 * - 수구(水口·물이 빠져나가는 방위)의 지지로 국(局)을 정한다.
 *   수구 辰巽巳 → 수국(水局) / 戌乾亥 → 화국(火局) / 丑艮寅 → 금국(金局) / 未坤申 → 목국(木局)
 * - 국의 장생(長生) 기점: 수국 申 / 목국 亥 / 화국 寅 / 금국 巳 (모두 순행)
 * - 24산은 쌍산(雙山) 12조로 묶어 같은 포태를 쓴다:
 *   壬子·癸丑·艮寅·甲卯·乙辰·巽巳·丙午·丁未·坤申·庚酉·辛戌·乾亥
 */

export type Guk = "수국" | "목국" | "화국" | "금국";

export const BRANCHES12 = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

/** 12포태 순서 */
export const POTAE = ["장생", "목욕", "관대", "임관", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"] as const;
export type Potae = (typeof POTAE)[number];

/** 포태 길흉 등급 — 표시용 */
export const POTAE_GRADE: Record<Potae, "길" | "평" | "흉"> = {
  장생: "길", 목욕: "흉", 관대: "길", 임관: "길", 제왕: "길",
  쇠: "평", 병: "흉", 사: "흉", 묘: "평", 절: "흉", 태: "평", 양: "평",
};

/** 쌍산 12조 — [천간/사유, 지지] 같은 조는 같은 포태 */
export const SSANGSAN: [string, string][] = [
  ["壬", "子"], ["癸", "丑"], ["艮", "寅"], ["甲", "卯"], ["乙", "辰"], ["巽", "巳"],
  ["丙", "午"], ["丁", "未"], ["坤", "申"], ["庚", "酉"], ["辛", "戌"], ["乾", "亥"],
];

/**
 * 수구(파구) → 국.
 *
 * 파구는 각 국의 **묘·절·태** 세 방위다. 12쌍산이 4국으로 정확히 3개씩 나뉜다 —
 *   수국 乙辰·巽巳·丙午 / 목국 丁未·坤申·庚酉 / 화국 辛戌·乾亥·壬子 / 금국 癸丑·艮寅·甲卯
 * 예전에는 묘·절 두 자리만 하드코딩해 壬子·甲卯·丙午·庚酉 넷이 국을 못 잡았다.
 * 목록을 박아 두지 않고 포태에서 유도해 그런 누락이 다시 생기지 않게 한다.
 */
export function gukFromSugu(mountain: string): Guk | null {
  const pair = SSANGSAN.find(([g, b]) => g === mountain || b === mountain);
  if (!pair) return null;
  const b = pair[1];
  return (["수국", "목국", "화국", "금국"] as Guk[])
    .find((g) => ["묘", "절", "태"].includes(potaeOf(g, b))) ?? null;
}

/** 파구가 그 국의 어느 자리인가 — 놓을 수 있는 향이 여기서 갈린다 */
export function suguKind(mountain: string): { guk: Guk; kind: "묘" | "절" | "태" } | null {
  const guk = gukFromSugu(mountain);
  if (!guk) return null;
  const pair = SSANGSAN.find(([g, b]) => g === mountain || b === mountain)!;
  const p = potaeOf(guk, pair[1]);
  return { guk, kind: p as "묘" | "절" | "태" };
}

/** 국별 장생 기점 지지 */
export const GUK_JANGSAENG: Record<Guk, string> = { 수국: "申", 목국: "亥", 화국: "寅", 금국: "巳" };

/** 국 기준, 지지의 포태 (순행) */
export function potaeOf(guk: Guk, branch: string): Potae {
  const start = BRANCHES12.indexOf(GUK_JANGSAENG[guk] as (typeof BRANCHES12)[number]);
  const idx = BRANCHES12.indexOf(branch as (typeof BRANCHES12)[number]);
  if (start < 0 || idx < 0) throw new Error(`알 수 없는 지지: ${branch}`);
  return POTAE[((idx - start) % 12 + 12) % 12];
}

/** 국 기준, 쌍산 12조 전체의 포태 배열 */
export function ssangsanPotae(guk: Guk): { pair: string; branch: string; potae: Potae; grade: "길" | "평" | "흉" }[] {
  return SSANGSAN.map(([g, b]) => {
    const p = potaeOf(guk, b);
    return { pair: `${g}${b}`, branch: b, potae: p, grade: POTAE_GRADE[p] };
  });
}

/* 향 후보는 lib/hyang88.ts의 88향 표에서 조회한다.
   예전에는 여기서 포태 자리로 유도했는데, 정양향의 파구를 태궁으로 잡는 오류가 있었다
   (실제는 절궁). 변향 4종도 유파차가 커서 유도식으로는 맞출 수 없다. */
