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

/* ── 향 후보 판정 ──
   88향법은 파구가 어디냐에 따라 놓을 수 있는 향이 정해진다.
   여기서는 **정향(正向) 4종**만 낸다 — 이름 그대로 향의 포태 자리로 정의되어
   계산이 확정적이기 때문이다.

   변향(자생향·자왕향·문고소수·목욕소수)은 향상작국(向上作局)으로 국을 다시 세우는
   방식이라 유파에 따라 조건이 갈린다. 근거를 확보하기 전에는 이름과 개념만 알리고
   수치 판정은 내지 않는다(틀린 판정을 자신 있게 내놓는 것보다 낫다). */

export interface HyangCandidate {
  name: string;          // 정생향 등
  pair: string;          // 향 쌍산 (예: 坤申)
  potae: Potae;          // 향의 포태 자리
  flow: string;          // 물 흐름 조건
  note: string;
}

/** 포태 자리 → 쌍산 조 */
function pairAt(guk: Guk, potae: Potae): { pair: string; branch: string } {
  const i = POTAE.indexOf(potae);
  const start = BRANCHES12.indexOf(GUK_JANGSAENG[guk] as (typeof BRANCHES12)[number]);
  const b = BRANCHES12[(start + i) % 12];
  const ss = SSANGSAN.find(([, x]) => x === b)!;
  return { pair: `${ss[0]}${ss[1]}`, branch: b };
}

/**
 * 파구 자리별로 놓을 수 있는 정향.
 * 묘(고장)파구 → 정생향·정왕향 / 절파구 → 정묘향 / 태파구 → 정양향
 */
export function jeonghyang(sugu: string): HyangCandidate[] {
  const k = suguKind(sugu);
  if (!k) return [];
  const { guk, kind } = k;
  const mk = (name: string, potae: Potae, flow: string, note: string): HyangCandidate => {
    const { pair } = pairAt(guk, potae);
    return { name, pair, potae, flow, note };
  };
  if (kind === "묘") {
    return [
      mk("정생향(正生向)", "장생", "우수도좌(물이 오른쪽에서 왼쪽으로)", "향이 장생 자리 — 사람과 재물이 함께 이는 자리로 봅니다."),
      mk("정왕향(正旺向)", "제왕", "좌수도우(물이 왼쪽에서 오른쪽으로)", "향이 제왕 자리 — 기세가 가장 성한 자리로 봅니다."),
    ];
  }
  if (kind === "절") {
    return [mk("정묘향(正墓向)", "묘", "좌수도우", "향이 묘(고장) 자리 — 거두어 갈무리하는 향으로 봅니다.")];
  }
  return [mk("정양향(正養向)", "양", "우수도좌", "향이 양 자리 — 기르고 북돋우는 향으로 봅니다.")];
}

/** 변향 계열 — 이름과 개념만. 조건은 유파 차가 커서 판정하지 않는다. */
export const BYEONHYANG_NOTE = [
  { name: "자생향(自生向)", note: "향을 기준으로 국을 다시 세워(향상작국) 생향을 빌려 쓰는 방식. 차고소수라고도 합니다." },
  { name: "자왕향(自旺向)", note: "같은 방식으로 왕향을 빌려 쓰는 방식." },
  { name: "문고소수(文庫消水)", note: "태궁으로 파구되고 정국 포태로는 절향이 되는 자리." },
  { name: "목욕소수(沐浴消水)", note: "목욕 자리로 물이 빠지는 형태." },
];
