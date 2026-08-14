"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    starChart, periodOf, periodYears, STAR_NAMES, starMood, MOUNTAIN_INFO,
    mountainFromDeg, annualChart, monthlyChart, monthlyCenter, comboFor,
    fanFuYin, earthLuck, samBanGwa, chilseongTagyeop, cityGate, hapsip, kyemCheck, oppositeMountain,
    type Palace, type StarChart,
} from "@/lib/flyingStars";
import { mingGua, starFor, voidCheck, type Trigram, type Star } from "@/lib/eightMansions";
import { streamSSE } from "@/lib/analyzeStream";
import { ReportRenderer } from "@/components/ReportRenderer";
import { Button } from "@/components/ui/button";
import FloorPlanView from "@/components/FloorPlanView";
import AlignDiagram from "@/components/AlignDiagram";
import { exportAsImage } from "@/lib/exportImage";
import { notify } from "@/lib/useToast";

/** 진행 단계 — 재기 → 읽기 → 도면 → 풀이 */
const STEP_DEFS = [
    { n: 1, label: "좌향 재기" },
    { n: 2, label: "비성반 읽기" },
    { n: 3, label: "도면 적용" },
    { n: 4, label: "AI 풀이" },
] as const;

/** 좌향 후보 비교표의 행 정의 — 후보끼리 실제로 갈리는 항목만 고른다 */
const COMPARE_ROWS: { label: string; get: (c: StarChart, curPeriod: number, nowYear: number) => string }[] = [
    { label: "격국", get: (c) => c.structure },
    {
        label: "좌궁 산·향", get: (c) => {
            const p = MOUNTAIN_INFO[c.sitting].palace;
            return `${c.mountain[p]}·${c.water[p]}`;
        },
    },
    {
        label: "향궁 산·향", get: (c) => {
            const p = MOUNTAIN_INFO[c.facing].palace;
            return `${c.mountain[p]}·${c.water[p]}`;
        },
    },
    { label: "합십", get: (c) => hapsip(c) ?? "—" },
    { label: "삼반괘", get: (c) => samBanGwa(c) ?? "—" },
    {
        label: "반음·복음", get: (c) => {
            const f = fanFuYin(c);
            const parts = [f.mountain ? `산반 ${f.mountain}` : "", f.water ? `향반 ${f.water}` : ""].filter(Boolean);
            return parts.length ? parts.join(" · ") : "없음";
        },
    },
    { label: "칠성타겁", get: (c) => chilseongTagyeop(c)?.kind ?? "—" },
    {
        label: "성문", get: (c) => {
            const ok = cityGate(c).filter((g) => g.ok);
            return ok.length ? ok.map((g) => PALACE_DIR[g.palace]).join("·") : "없음";
        },
    },
    {
        label: "지운", get: (c, _cp, nowYear) => {
            const e = earthLuck(c, nowYear);
            return `${e.years}년${e.imprisoned ? " · 입수" : ""}${e.split ? " ⚠규칙분기" : ""}`;
        },
    },
];

/** STEP 1에서 확정해 다음 단계로 넘기는 값 — 언제 잰 값인지까지 남긴다 */
type Step1Save = { sitting: string; year: number; deg: number | null; at: string };
const STEP1_KEY = "destiny-hyeongong-step1";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:8001" : "https://saju-app-11.onrender.com")).replace(/\/$/, "");

// 현공비성(玄空飛星) 뷰 — 좌산·준공(건축)년도로 비성반을 산출해 9궁으로 보여준다.
// 계산은 lib/flyingStars.ts(문헌 표준 + 실전 감정 사례 대조 검증 완료)만 사용한다.

// 9궁 3×3 배치 — 남상(전통: 위=남, 동=왼쪽) / 북상(지도식: 위=북, 동=오른쪽)
const GRID_S: Palace[][] = [
    ["巽", "離", "坤"],
    ["震", "中", "兌"],
    ["艮", "坎", "乾"],
];
const GRID_N: Palace[][] = [
    ["乾", "坎", "艮"],
    ["兌", "中", "震"],
    ["坤", "離", "巽"],
];
const PALACE_DIR: Record<Palace, string> = {
    坎: "북", 艮: "북동", 震: "동", 巽: "남동", 離: "남", 坤: "남서", 兌: "서", 乾: "북서", 中: "중궁",
};
const MOUNTAINS_24 = Object.keys(MOUNTAIN_INFO);

const MOOD_COLOR: Record<string, string> = {
    왕기: "text-[#bf953f] font-bold",
    생기: "text-emerald-600 dark:text-emerald-400 font-semibold",
    퇴기: "text-slate-400",
    쇠살: "text-rose-500/80",
};
// 팔택 팔성 중 길성
const GOOD_STARS: Star[] = ["생기", "천의", "연년", "복위"];

// 저장된 집 프로필 — 좌향·준공년을 기억해 매번 실측·입력하지 않게 한다
interface HomeProfile { name: string; sitting: string; year: number; deg?: number }
const HOMES_KEY = "destiny-hyeongong-homes";
function loadHomes(): HomeProfile[] {
    try {
        const raw = window.localStorage.getItem(HOMES_KEY);
        const p = raw ? JSON.parse(raw) : [];
        return Array.isArray(p) ? p : [];
    } catch { return []; }
}
function saveHomes(list: HomeProfile[]) {
    try { window.localStorage.setItem(HOMES_KEY, JSON.stringify(list.slice(0, 10))); } catch { /* 무시 */ }
}

interface Props {
    birthYear?: number;            // 입춘 보정 연도(팔택 본명괘 통합용)
    gender?: "male" | "female";
}

/* ── 사용 방법 가이드(팝업) — Portal로 body에 렌더해 transform에 갇히지 않게 ── */
const GUIDE_STEPS: [string, string][] = [
    ["뭘 하는 앱?", "우리 집이 \"어느 쪽을 등지고 앉았는지\"를 휴대폰으로 재면, 집안 기운의 지도(비성반)를 자동으로 그려주는 앱입니다. 방향 재기 → 표 읽기 → 도면에 얹기 → AI 설명, 네 단계면 끝납니다."],
    ["STEP 1 준비", "나침반이 정확하도록 휴대폰을 8자 모양으로 몇 번 흔들어 주세요. 자석이 붙은 케이스는 잠깐 빼는 게 좋습니다. 전에 저장한 집이 있다면 위의 🏠 칩만 누르면 측정 없이 바로 불러와집니다."],
    ["STEP 1 자세 잡기", "값을 만드는 건 '어디에 서느냐'가 아니라 '폰을 무엇에 맞추느냐'입니다. 나침반은 위치를 모르고 방향만 읽으니까요. 거실의 가장 큰 창(베란다) 앞에서 휴대폰을 손바닥에 수평으로 눕히고, 폰의 긴 변을 창면(벽면)과 나란히 맞추세요 — 자를 벽에 대듯이. 그 상태에서 폰 위쪽이 향(向), 등 뒤가 좌(坐)입니다. 창틀·방충망에는 붙이지 말고 30~50cm 띄우세요."],
    ["STEP 1 왜 실측이 먼저인가", "아파트는 같은 단지라도 동마다 배치각이 다릅니다. 도면이나 지도만으로는 우리 동이 몇 도로 앉았는지 알 수 없어서, 현장에서 재는 것이 1순위입니다. 철골·가전에서 떨어져 2~3곳에서 재고 값이 서로 비슷한지 확인하세요."],
    ["STEP 1 집 중앙에서 재라던데?", "맞습니다. 전통 실무는 나경을 집 중앙(입극점)에 놓고 봅니다. 다만 전통 나경에는 십자어자선이 있어서, 그 십자선을 건물의 중심축에 맞춘 뒤 눈금을 읽습니다. 즉 '창면을 바라본다'는 말은 어느 면을 향으로 삼는지를 가리키는 것이지, 눈으로 조준하라는 뜻이 아닙니다. 폰에는 십자선이 없으니 폰의 변을 자 삼아 벽면에 맞추는 것이 같은 일을 하는 방법입니다. 중앙에 서시되, 겨누지 말고 맞추세요."],
    ["STEP 1 중앙에서 잰다면 어디를 겨냥하나", "창면의 좌우 한가운데입니다. 창틀 왼쪽 끝도 오른쪽 끝도 아니고 개구부 전체 폭의 중점이며, 높이는 상관없습니다(수평 방위각만 읽습니다). 거실 창이 두세 짝으로 나뉘어 있으면 전체를 하나의 면으로 보고 그 중점이고, 발코니를 확장한 집이면 바깥쪽 창(실제 외벽면) 기준입니다."],
    ["STEP 1 겨냥할 때 서는 자리", "향은 원래 점이 아니라 벽면에 수직인 방향입니다. 창 중점을 겨눈 선이 그 수직선과 일치하려면 창의 정중앙 앞에 서 있어야 합니다. 창 왼쪽 끝과 오른쪽 끝까지의 거리가 같은 자리, 즉 창이 좌우 대칭으로 보이는 자리입니다. 창까지 5m인데 중심이 옆으로 1m 치우쳐 있으면 약 11도, 2m 치우치면 약 22도가 어긋납니다. 24산이 15도 단위라 산이 넘어가 버립니다."],
    ["STEP 1 중앙이 창 정중앙이 아니라면", "둘 중 하나를 택하세요. 각도를 정확히 얻으려면 창 정중앙 앞으로 옮겨 서면 됩니다. 나침반은 위치를 모르고 방향만 읽으므로 자리를 옮겨도 각도에 손해가 없습니다. 중심 자리를 지키고 싶으면 그 자리에서 폰을 창면과 평행하게 맞추세요. 그러면 겨눌 필요 자체가 없어집니다."],
    ["STEP 1 어느 값이 맞는지 확인", "중앙에서 겨눠 잰 값과 창가에서 벽면에 평행하게 맞춰 잰 값을 둘 다 재보세요. 제대로 했다면 3도 안에서 일치합니다. 많이 벌어지면 서는 자리가 창 중앙이 아니었을 가능성이 큽니다. 이때는 평행 정렬로 잰 값이 맞습니다 — 그쪽은 서는 위치와 무관하게 기준이 하나뿐이라 흔들릴 여지가 없습니다. 측정 이력 칩에 최근 값이 남으니 나란히 비교하세요."],
    ["STEP 1 현대 아파트에서 중앙이 유리한가", "전통에서 중앙을 권한 실질적 이유는 벽이 두꺼운 가옥에서 중앙이 철근·금속에서 가장 멀었기 때문입니다. 현대 아파트는 바닥 슬래브 전체에 철근이 깔려 있어 실내 중앙이 반드시 유리하지 않습니다. 오히려 발코니 바깥이나 건물 밖에서 정면 외벽과 평행하게 재는 쪽이 안정적일 때가 많습니다."],
    ["STEP 1 몇 번 재나", "집 전체에 좌향은 하나입니다. 방마다 다시 잴 필요가 없습니다. 같은 벽면에 난 옆방 창에서 재도 같은 값이 나와야 정상이고, 3도 이상 벌어지면 철근·가전 간섭이거나 벽면 정렬이 어긋난 것입니다. 오히려 2~3곳에서 재서 서로 비슷한지 검산하는 용도로 쓰세요."],
    ["STEP 1 재기", "'센서로 방위 재기'를 누르면 판이 돌기 시작합니다. 그 자세 그대로 '좌향 잡기(3초 평균)'를 누르고 3초만 가만히 계세요 — 방향이 자동으로 입력됩니다."],
    ["STEP 1 정확하게", "냉장고·TV·철문 근처에서는 나침반이 흔들립니다. 한두 걸음 떨어져 두세 번 재 보세요. 결과에 뜨는 편차(±숫자)가 8보다 크면 자리를 옮겨 다시 재고, '측정 이력' 칩으로 값들이 서로 비슷한지 확인하면 됩니다. ⚠ 공망 경고가 뜨면 그 값은 쓰지 말고 다시 재세요."],
    ["STEP 1 준공년", "이 집이 \"지어진 해(준공 연도)\"를 넣으세요. 건물이 완성되어 지붕이 덮이는 순간 그 시기의 운(기운)이 집에 고착되기 때문입니다. 뼈대만 남기고 크게 리모델링한 집은 공사가 끝난 해가 새 준공년입니다. 준공 연도는 등기부등본·건축물대장·부동산 앱에서 확인할 수 있습니다."],
    ["STEP 2 표 읽기", "9칸 표에서 각 칸의 왼쪽 숫자는 사람 운(건강·인간관계), 오른쪽 숫자는 재물 운입니다. 금색 숫자가 지금 가장 좋은 기운, 붉은 숫자는 힘 빠진 기운. 작은 年·月은 올해·이번 달의 기운입니다. 도면·지도와 비교할 땐 '북상(지도식)' 버튼을 켜면 방향이 지도와 같아집니다."],
    ["STEP 2 활용", "복잡하게 계산할 필요 없이 아래 '📋 용도별 추천 배치'를 보세요 — 현관·침실·공부방·금고를 어느 방향에 두면 좋은지 정리돼 있습니다. ⚠ 주의 방위에서는 올해/이달 공사·이사·침대 옮기기를 피하세요. 다 확인했으면 🏠 집으로 저장(다음부터 원탭), 📷 로 이미지 보관."],
    ["STEP 3 도면", "우리 집 평면도나 위성지도 캡처를 불러온 뒤, ① 사진 속 집 가운데를 콕 → ② 집 정면(베란다) 방향을 한 번 더 콕 찍으세요. 방금 잰 각도에 맞춰 도면이 자동으로 정렬되고 기운 지도가 얹힙니다. 도면을 먼저 올리고 나중에 각도를 재도 됩니다. 어긋나 보이면 슬라이더로 미세 조정하세요."],
    ["STEP 4 AI 풀이", "마지막으로 'AI 현공 풀이' 버튼을 누르면 지금까지의 결과를 사람 말로 풀어줍니다 — 어느 방에서 자고, 어디에 책상과 금고를 두면 좋은지, 올해 조심할 방향은 어디인지."],
    ["이사 진단", "이사를 고민 중이라면 상단 '🏡 이사할 집 진단' 메뉴에 후보 집의 좌향과 준공(건축) 연도를 넣어 보세요. 그 집에 고착된 운의 격국으로 좋은 집인지(🟢~🔴) 바로 판정해 주며, 입주 예정 해까지 넣으면 그 해의 흉성 방위(이사 시기)도 함께 점검합니다. 여러 후보를 저장해 나란히 비교할 수 있습니다."],
];

function GuideModal({ onClose }: { onClose: () => void }) {
    if (typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="glass-card !rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-3 bg-white/95 dark:bg-slate-900/95" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold font-noto-serif text-slate-900 dark:text-slate-100">📖 현공비성 사용 방법</h4>
                    <button onClick={onClose} aria-label="닫기" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">×</button>
                </div>
                {GUIDE_STEPS.map(([t, d]) => (
                    <div key={t} className="flex gap-2.5 text-[13px] leading-relaxed">
                        <span className="shrink-0 font-bold text-[#bf953f] w-[5.5rem]">{t}</span>
                        <span className="text-slate-600 dark:text-slate-300">{d}</span>
                    </div>
                ))}
                <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    좌(坐)=건물이 등지는 방위, 향(向)=정면이 바라보는 방위. 전통 나경은 자북 기준이며, 현공비성 판정은 유파에 따라 다를 수 있습니다.
                </p>
                <Button onClick={onClose} className="w-full rounded-full bg-slate-900 text-white dark:bg-[#d4af37] dark:text-slate-900">확인</Button>
            </div>
        </div>,
        document.body
    );
}

/* ── 회전 나경판(24산+8괘) 그리기 도우미 ── */
const BRANCH_SET = new Set(["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]);
const YUY_SET = new Set(["乾", "坤", "艮", "巽"]);
// 방위각(0=북, 시계방향) → SVG 좌표
function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}
function sectorPath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
    const [x1, y1] = pt(cx, cy, r2, a1); const [x2, y2] = pt(cx, cy, r2, a2);
    const [x3, y3] = pt(cx, cy, r1, a2); const [x4, y4] = pt(cx, cy, r1, a1);
    return `M${x1},${y1} A${r2},${r2} 0 0 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 0 0 ${x4},${y4} Z`;
}

// 현공용 회전 나경판 — heading만큼 판이 돌아 위쪽 붉은 포인터가 '지금 향한 방위(向)'를 가리킨다.
function RotatingPlate({ heading, sitting, facing }: { heading: number | null; sitting: string; facing: string }) {
    const rot = -(heading ?? 0);
    const gua: [Trigram, string][] = [["坎", "북"], ["艮", "북동"], ["震", "동"], ["巽", "남동"], ["離", "남"], ["坤", "남서"], ["兌", "서"], ["乾", "북서"]];
    return (
        <div className="relative max-w-sm mx-auto select-none">
            <svg viewBox="0 0 400 400" className="w-full block" role="img"
                aria-label={`현공 나경판, 현재 ${heading == null ? "정지" : heading.toFixed(0) + "도"}`}>
                {/* 바탕 */}
                <circle cx={200} cy={200} r={192} fill="#f6efdc" stroke="#b09b62" strokeWidth={2} />
                <g transform={`rotate(${rot} 200 200)`}>
                    {/* 눈금 링: 5° 간격, 30° 굵게 + 숫자 */}
                    {Array.from({ length: 72 }, (_, i) => i * 5).map((a) => {
                        const major = a % 30 === 0;
                        const [x1, y1] = pt(200, 200, major ? 178 : 183, a);
                        const [x2, y2] = pt(200, 200, 190, a);
                        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a744a" strokeWidth={major ? 1.6 : 0.7} />;
                    })}
                    {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => {
                        const [x, y] = pt(200, 200, 170, a);
                        return <text key={a} x={x} y={y + 3} fontSize={9} fill="#7a6435" textAnchor="middle"
                            transform={`rotate(${a} ${x} ${y})`}>{a}</text>;
                    })}
                    {/* 24산 링 */}
                    {Object.entries(MOUNTAIN_INFO).map(([m, info]) => {
                        const a1 = info.deg - 7.5, a2 = info.deg + 7.5;
                        const isSit = m === sitting, isFace = m === facing;
                        const fill = isSit ? "#d4af37" : isFace ? "#9cc7e8" : "#faf4e4";
                        const color = BRANCH_SET.has(m) ? "#2b2b2b" : YUY_SET.has(m) ? "#a5303c" : "#1d4f8f";
                        const [tx, ty] = pt(200, 200, 138, info.deg);
                        return (
                            <g key={m}>
                                <path d={sectorPath(200, 200, 112, 163, a1, a2)} fill={fill} stroke="#b09b62" strokeWidth={0.8} />
                                <text x={tx} y={ty + 6} fontSize={19} fontWeight={700} fill={isSit ? "#fff" : color}
                                    textAnchor="middle" fontFamily="'Noto Serif KR',serif"
                                    transform={`rotate(${info.deg} ${tx} ${ty})`}>{m}</text>
                            </g>
                        );
                    })}
                    {/* 8괘 링 */}
                    {gua.map(([g, ko], i) => {
                        const mid = i * 45, a1 = mid - 22.5, a2 = mid + 22.5;
                        const [tx, ty] = pt(200, 200, 88, mid);
                        return (
                            <g key={g}>
                                <path d={sectorPath(200, 200, 62, 112, a1, a2)} fill="#f1e6c8" stroke="#b09b62" strokeWidth={0.8} />
                                <text x={tx} y={ty} fontSize={17} fontWeight={700} fill="#6b532a" textAnchor="middle"
                                    fontFamily="'Noto Serif KR',serif" transform={`rotate(${mid} ${tx} ${ty})`}>{g}</text>
                                <text x={tx} y={ty + 13} fontSize={8.5} fill="#8a744a" textAnchor="middle"
                                    transform={`rotate(${mid} ${tx} ${ty})`}>{ko}</text>
                            </g>
                        );
                    })}
                    {/* 중심 */}
                    <circle cx={200} cy={200} r={62} fill="#efe3c2" stroke="#b09b62" />
                    <line x1={200} y1={142} x2={200} y2={258} stroke="#c33" strokeWidth={0.8} opacity={0.6} />
                    <line x1={142} y1={200} x2={258} y2={200} stroke="#c33" strokeWidth={0.8} opacity={0.6} />
                </g>
                {/* 고정 포인터: 위=向(붉음), 아래=坐(파랑) */}
                <polygon points="200,6 193,26 207,26" fill="#c0392b" />
                <text x={214} y={22} fontSize={13} fontWeight={700} fill="#c0392b">向</text>
                <polygon points="200,394 193,374 207,374" fill="#1d4f8f" />
                <text x={214} y={386} fontSize={13} fontWeight={700} fill="#1d4f8f">坐</text>
                {/* 중앙 방위 표시 */}
                <text x={200} y={195} fontSize={16} fontWeight={700} fill="#6b532a" textAnchor="middle">
                    {heading == null ? "—" : `${heading.toFixed(0)}°`}
                </text>
                <text x={200} y={214} fontSize={11} fill="#8a744a" textAnchor="middle">
                    {heading == null ? "센서 대기" : `向 ${mountainFromDeg(heading)} · 坐 ${mountainFromDeg(heading + 180)}`}
                </text>
            </svg>
        </div>
    );
}

export default function FlyingStarsView({ birthYear, gender }: Props) {
    const now = new Date();
    const nowYear = now.getFullYear();
    // 연자백은 입춘(2/4경) 기준 연도
    const annualYear = now.getMonth() + 1 < 2 || (now.getMonth() + 1 === 2 && now.getDate() < 4) ? nowYear - 1 : nowYear;

    // 탭 전환(언마운트) 후에도 실측값이 유지되도록 localStorage에서 복원한다
    const [sitting, setSittingRaw] = useState(() => {
        try { const v = window.localStorage.getItem("destiny-luopan-sitting"); return v && MOUNTAIN_INFO[v] ? v : "子"; } catch { return "子"; }
    });
    const [year, setYearRaw] = useState(() => {
        try { const v = parseInt(window.localStorage.getItem("destiny-luopan-year") || "", 10); return v >= 1864 && v <= 2100 ? v : nowYear; } catch { return nowYear; }
    });
    const setYear = (y: number) => {
        setYearRaw(y);
        try { window.localStorage.setItem("destiny-luopan-year", String(y)); } catch { /* 무시 */ }
    };
    const [degInput, setDegInput] = useState("");   // 좌향 각도(도) 직접 입력
    const [mapView, setMapView] = useState(false);  // 9궁 배치: false=남상(전통) / true=북상(지도식)
    const [interp, setInterp] = useState("");
    const [interpreting, setInterpreting] = useState(false);
    const [measuredDeg, setMeasuredDegRaw] = useState<number | null>(() => {
        try { const v = parseFloat(window.localStorage.getItem("destiny-luopan-deg") || ""); return Number.isFinite(v) ? v : null; } catch { return null; }
    }); // 실측 좌향 각도 유지(공망 판정용) — 탭 전환에도 보존
    const setMeasuredDeg = (d: number | null) => {
        setMeasuredDegRaw(d);
        try {
            if (d == null) window.localStorage.removeItem("destiny-luopan-deg");
            else window.localStorage.setItem("destiny-luopan-deg", String(d));
        } catch { /* 무시 */ }
    };
    // STEP 1 → STEP 2 인계. 내부적으로는 상태를 공유하지만, 저장 시각을 남겨
    // "언제 잰 값으로 이 반을 세웠는지"가 다음 단계에서 눈에 보이게 한다.
    const [step1Saved, setStep1Saved] = useState<Step1Save | null>(() => {
        try { const raw = window.localStorage.getItem(STEP1_KEY); return raw ? JSON.parse(raw) as Step1Save : null; } catch { return null; }
    });
    const [homes, setHomes] = useState<HomeProfile[]>([]);
    const [homeName, setHomeName] = useState("");
    const [saving, setSaving] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false); // 사용 방법 팝업
    // 진행 단계 — 한 화면에 STEP 1~4를 다 쌓으면 길고 복잡해서 한 번에 하나만 보인다.
    // 비활성 단계는 언마운트하지 않고 hidden으로만 감춘다(감췄다 돌아와도 상태가 살아 있게).
    const [step, setStep] = useState(1);
    const topRef = useRef<HTMLDivElement>(null);     // 단계 이동 시 스크롤 기준
    const chartRef = useRef<HTMLDivElement>(null);   // 비성반 이미지 저장용
    useEffect(() => {
        setHomes(loadHomes()); // 저장된 집 프로필 로드
        try { const raw = window.localStorage.getItem("destiny-luopan-history"); if (raw) setHistory(JSON.parse(raw)); } catch { /* 무시 */ }
    }, []);

    // 좌산 설정 — 도면 방위 탭이 이어받을 수 있게 저장해 둔다(실측 우선 플로우 연동)
    const setSitting = (m: string) => {
        setSittingRaw(m);
        try { window.localStorage.setItem("destiny-luopan-sitting", m); } catch { /* 무시 */ }
    };

    // ── 나침반: 센서로 현재 방위를 읽어 좌산을 잡는다 (자북 기준) ──
    const [sensorOn, setSensorOn] = useState(false);
    const [heading, setHeading] = useState<number | null>(null);
    const [capturing, setCapturing] = useState(false);   // 3초 평균 측정 중
    const [capNote, setCapNote] = useState("");           // 측정 결과 안내(평균·편차)
    const [history, setHistory] = useState<{ deg: number; std: number; sit: string; t: string }[]>([]);
    const headingRef = useRef<number | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => () => { cleanupRef.current?.(); }, []); // 언마운트 시 리스너 해제

    async function startSensor() {
        // iOS는 사용자 제스처 안에서 권한 요청이 필요하다
        const DOE = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<PermissionState>;
        }) | undefined;
        if (DOE && typeof DOE.requestPermission === "function") {
            try { if ((await DOE.requestPermission()) !== "granted") return; } catch { return; }
        }
        const onOrient = (e: DeviceOrientationEvent) => {
            const compass = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
            let h: number | null = null;
            if (typeof compass === "number") h = compass;                    // iOS
            else if (e.absolute && e.alpha != null) h = 360 - e.alpha;       // 절대 방위
            else if (e.alpha != null) h = 360 - e.alpha;                     // 상대(참고용)
            if (h != null) {
                const norm = ((h % 360) + 360) % 360;
                headingRef.current = norm;   // 평균 측정용 최신값
                setHeading(norm);
            }
        };
        // deviceorientationabsolute 우선, 없으면 deviceorientation
        const evName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
        window.addEventListener(evName as "deviceorientation", onOrient as EventListener);
        cleanupRef.current = () => window.removeEventListener(evName as "deviceorientation", onOrient as EventListener);
        setSensorOn(true);
    }

    // 휴대폰 위쪽을 집 정면(향)으로 향한 상태에서 3초간 표본을 모아 원형 평균으로
    // 좌(반대 방위)를 잡는다. 손떨림·자기 간섭에 의한 순간값 오차를 줄인다.
    const captureSitting = () => {
        if (headingRef.current == null || capturing) return;
        setCapturing(true); setCapNote("");
        const samples: number[] = [];
        const iv = setInterval(() => {
            if (headingRef.current != null) samples.push(headingRef.current);
        }, 100);
        setTimeout(() => {
            clearInterval(iv);
            setCapturing(false);
            if (samples.length < 5) { setCapNote("표본이 부족합니다. 다시 측정해 주세요."); return; }
            // 원형 평균(각도는 0/360 경계가 있어 산술 평균 불가)
            const sx = samples.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0);
            const sy = samples.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0);
            const mean = ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
            const R = Math.hypot(sx, sy) / samples.length;          // 집중도(1=완전 일치)
            const stdDeg = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-9)))) * (180 / Math.PI);
            const sitDeg = (mean + 180) % 360;
            const sit = mountainFromDeg(sitDeg);
            setSitting(sit);
            setMeasuredDeg(sitDeg);   // 실측 각도를 유지해 공망(경계) 여부를 함께 판정
            setCapNote(
                `✅ 측정값 적용 완료 — 평균 向 ${mean.toFixed(1)}° (편차 ±${stdDeg.toFixed(1)}°) → 坐 ${sit} ${sitDeg.toFixed(1)}°. 아래 STEP 2 비성반과 STEP 3 도면에 자동 반영되었습니다.`
                + (stdDeg > 8 ? " ⚠ 값이 많이 흔들립니다. 철골·가전에서 떨어져 다른 지점에서 다시 재보세요." : "")
            );
            notify.success(`좌향 적용: ${sit}坐 (${sitDeg.toFixed(1)}°)`, "STEP 2 비성반과 STEP 3 도면에 자동 반영되었습니다.");
            // 측정 이력(최근 3건) — 여러 지점 실측값 비교용
            try {
                const raw = window.localStorage.getItem("destiny-luopan-history");
                const hist = raw ? JSON.parse(raw) : [];
                hist.unshift({ deg: Math.round(sitDeg * 10) / 10, std: Math.round(stdDeg * 10) / 10, sit, t: new Date().toISOString().slice(5, 16).replace("T", " ") });
                window.localStorage.setItem("destiny-luopan-history", JSON.stringify(hist.slice(0, 3)));
                setHistory(hist.slice(0, 3));
            } catch { /* 무시 */ }
        }, 3000);
    };

    // 겸향 판정 — 실측 각도가 산 중앙 9°를 벗어났는지, 그 유형이 체괘를 쓰는지
    const kyem = useMemo(() => (measuredDeg == null ? null : kyemCheck(measuredDeg)), [measuredDeg]);
    // 체괘 사용 여부. 판정을 기본값으로 쓰되, 체괘 무용론(유훈승 계열)도 있어 수동으로 덮을 수 있게 한다.
    const [tiOverride, setTiOverride] = useState<boolean | null>(null);
    const useTi = tiOverride ?? kyem?.useTi ?? false;
    // 좌향 후보 비교 — 최대 3개까지 나란히 세워 본다
    const [cands, setCands] = useState<string[]>([]);
    const [candPick, setCandPick] = useState("子");

    const chart = useMemo(() => {
        try { return starChart(sitting, periodOf(year), useTi); } catch { return null; }
    }, [sitting, year, useTi]);
    const annual = useMemo(() => annualChart(annualYear), [annualYear]);
    const period = periodOf(year);          // 원운 — 반의 골조(준공년 기준)
    const [py0, py1] = periodYears(period, year);   // 준공년이 속한 삼원 주기로
    const curPeriod = periodOf(nowYear);    // 당운 — 왕쇠(왕기·생기·쇠살) 판정 기준

    // 팔택 본명괘(있으면 궁별 팔성 표시 + 교집합 추천)
    const ming: Trigram | null = useMemo(() => {
        if (!birthYear || !gender) return null;
        try { return mingGua(birthYear, gender); } catch { return null; }
    }, [birthYear, gender]);

    // 각도 입력 → 좌산 자동 설정 (팔택 나경 탭에서 잰 값을 옮겨 적는 용도)
    const applyDeg = () => {
        const d = parseFloat(degInput);
        if (Number.isFinite(d)) {
            const norm = ((d % 360) + 360) % 360;
            const sit = mountainFromDeg(norm);
            setSitting(sit);
            setMeasuredDeg(norm);   // 실측 각도 유지 → 공망 판정
            notify.success(`좌향 적용: ${sit}坐 (${norm.toFixed(1)}°)`, "STEP 2 비성반과 STEP 3 도면에 자동 반영되었습니다.");
        }
    };

    // 실측 각도가 있으면 공망(산 경계) 여부 판정 — 경계에 걸치면 좌향 판정 자체가 흔들린다
    const voidRes = useMemo(() => (measuredDeg != null ? voidCheck(measuredDeg) : null), [measuredDeg]);

    // 집 프로필 저장/불러오기 — 실측을 한 번 해두면 다음부터 원탭
    const saveHome = () => {
        const name = homeName.trim() || `${sitting}坐 ${year}`;
        const next = [{ name, sitting, year, deg: measuredDeg ?? undefined },
        ...homes.filter((h) => h.name !== name)];
        setHomes(next); saveHomes(next); setHomeName("");
        notify.success(`'${name}' 저장 완료`, "다음부터 칩을 누르면 바로 불러옵니다.");
    };
    const loadHome = (h: HomeProfile) => {
        setSitting(h.sitting); setYear(h.year);
        setMeasuredDeg(h.deg ?? null);
        setInterp("");
    };
    const removeHome = (name: string) => {
        const next = homes.filter((h) => h.name !== name);
        setHomes(next); saveHomes(next);
    };

    // 9궁 배치(남상/북상 토글 반영)
    const grid = mapView ? GRID_N : GRID_S;

    // 궁별 표시 데이터 — 조합·팔택까지 합성
    const cells = useMemo(() => {
        if (!chart) return [];
        return grid.flat().map((p) => {
            const combo = p === "中" ? null : comboFor(chart.mountain[p], chart.water[p]);
            const palTri = p === "中" ? null : (p as Trigram);
            const palStar = ming && palTri ? starFor(ming, palTri) : null;
            return { p, combo, palStar };
        });
    }, [chart, ming, grid]);

    // 교집합 추천: 팔택 길성 ∩ 향성 왕/생기
    const bestDirs = useMemo(() => {
        if (!chart || !ming) return [];
        return GRID_S.flat().filter((p) => {
            if (p === "中") return false;
            const mood = starMood(chart.water[p], curPeriod);
            const ps = starFor(ming, p as Trigram);
            return (mood === "왕기" || mood === "생기") && GOOD_STARS.includes(ps);
        }).map((p) => `${PALACE_DIR[p]}(향성 ${chart.water[p]}·팔택 ${starFor(ming, p as Trigram)})`);
    }, [chart, ming]);

    // 월자백(이달의 유월 비성) — 절입일 근사(±1일 오차 가능)
    const monthly = useMemo(() => monthlyChart(now), [now]);
    const monthInfo = useMemo(() => monthlyCenter(now), [now]);

    // 주의 방위 — 연·월 오황/이흑을 구분해 표기
    const warnDirs = useMemo(() => {
        const w: string[] = [];
        (Object.entries(annual) as [Palace, number][]).forEach(([p, n]) => {
            if (p === "中") return;
            if (n === 5) w.push(`${PALACE_DIR[p]}(년오황)`);
            if (n === 2) w.push(`${PALACE_DIR[p]}(년이흑)`);
        });
        (Object.entries(monthly) as [Palace, number][]).forEach(([p, n]) => {
            if (p === "中") return;
            if (n === 5) w.push(`${PALACE_DIR[p]}(월오황)`);
            if (n === 2) w.push(`${PALACE_DIR[p]}(월이흑)`);
        });
        return w;
    }, [annual, monthly]);

    // 용도별 배치표 — 산성(정적)·향성(동적)·조합·연월 흉성 기반의 실무 추천
    const usage = useMemo(() => {
        if (!chart) return [];
        const pals = GRID_S.flat().filter((p) => p !== "中");
        const info = (p: Palace) => ({
            wm: starMood(chart.water[p], curPeriod),   // 향성 기운(당운 기준)
            mm: starMood(chart.mountain[p], curPeriod), // 산성 기운(당운 기준)
            combo: comboFor(chart.mountain[p], chart.water[p]),
            danger: annual[p] === 5 || annual[p] === 2 || monthly[p] === 5, // 연오황·연이흑·월오황
        });
        const pick = (score: (p: Palace) => number, min = 1) => {
            const ranked = pals.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s);
            return ranked.filter((r) => r.s >= min).slice(0, 2).map((r) => PALACE_DIR[r.p]);
        };
        const moodPt = (m: string) => (m === "왕기" ? 3 : m === "생기" ? 2 : m === "퇴기" ? 0.5 : 0);
        const comboPt = (p: Palace) => { const c = info(p).combo; return c ? (c.grade === "길" ? 1 : -2) : 0; };
        return [
            {
                use: "현관·출입구", dirs: pick((p) => moodPt(info(p).wm) + comboPt(p) - (info(p).danger ? 2 : 0), 2),
                why: "향성(재물) 왕·생기가 드나드는 곳",
            },
            {
                use: "침실·안방", dirs: pick((p) => moodPt(info(p).mm) + comboPt(p) - (info(p).danger ? 2 : 0), 2),
                why: "산성(인정·건강) 왕·생기의 정적인 공간",
            },
            {
                use: "서재·공부방", dirs: pick((p) => (info(p).combo?.name === "문창" ? 4 : 0) + moodPt(info(p).mm) - (info(p).danger ? 2 : 0), 2),
                why: "1·4 문창 조합 우선, 다음 산성 생기",
            },
            {
                use: "금고·재물 자리", dirs: pick((p) => (info(p).wm === "왕기" ? 4 : info(p).wm === "생기" ? 2 : 0) + comboPt(p), 2),
                why: "향성 당운 왕기 방위",
            },
        ];
    }, [chart, annual, monthly]);

    // 고급 이기(理氣) 판정 — 반음복음·지운입수·삼반괘·칠성타겁·성문결·합십
    // 전부 216국 전수 검산 + 외부 정본 성반 대조를 마친 계산만 노출한다.
    // 비교표 열 — 현재 반 + 후보들. 모두 같은 운·같은 반종류로 세워야 비교가 성립한다.
    const compareCols = useMemo(() => {
        if (!chart) return [];
        const cols = [{ key: "cur", current: true, chart }];
        for (const c of cands) {
            if (c === chart.sitting) continue;
            try { cols.push({ key: c, current: false, chart: starChart(c, periodOf(year), useTi) }); } catch { /* 무시 */ }
        }
        return cols;
    }, [chart, cands, year, useTi]);

    const adv = useMemo(() => {
        if (!chart) return null;
        return {
            // 체괘반 216국 전수 검산 결과:
            //   반음복음·삼반괘·타겁·성문·합십은 성반 자체만 보는 정의 기반이라 반 종류와 무관하게 성립한다.
            //   (성문은 운반과 대응산 음양에만 의존해 하괘와 성립 건수 146으로 동일)
            //   지운만 입수 판정 두 규칙이 체괘에서 104/216 갈린다 → el.split으로 표면화한다.
            ff: fanFuYin(chart),
            el: earthLuck(chart, nowYear),
            sam: samBanGwa(chart),
            tag: chilseongTagyeop(chart),
            gate: cityGate(chart),
            hap: hapsip(chart),
        };
    }, [chart, nowYear]);

    // 비성반 카드 이미지 저장
    const saveImage = async () => {
        if (!chartRef.current) return;
        setSaving(true);
        try { await exportAsImage(chartRef.current, `현공-${sitting}坐-${year}`); notify.success("이미지를 저장했습니다"); }
        catch { notify.error("저장에 실패했습니다"); }
        finally { setSaving(false); }
    };

    async function interpret() {
        if (!chart) return;
        setInterpreting(true); setInterp("");
        const body = {
            sitting: chart.sitting, facing: chart.facing, period: chart.period,
            cur_period: curPeriod,   // 당운 — AI가 원운 숫자를 현재 왕기로 착각하지 않게
            structure: chart.structure, annual_year: annualYear,
            plate: chart.replaced ? "체괘" : "하괘",   // 겸향이면 체괘반 — 알려주지 않으면 하괘 전제로 서술한다
            ming_gua: ming ?? "",
            cells: GRID_S.flat().filter((p) => p !== "中").map((p) => ({
                방위: PALACE_DIR[p], 산성: chart.mountain[p], 향성: chart.water[p], 운반: chart.base[p],
                연성: annual[p], 월성: monthly[p], 조합: comboFor(chart.mountain[p], chart.water[p])?.name ?? "",
                팔택: ming ? starFor(ming, p as Trigram) : "",
            })),
        };
        try {
            await streamSSE(`${API_BASE}/classic/hyeongong/analyze`, body, setInterp);
        } catch {
            setInterp("해석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally { setInterpreting(false); }
    }

    // 단계 이동 — 화면을 위로 올려 새 단계의 머리부터 보이게 한다
    const goStep = (n: number) => {
        setStep(Math.min(4, Math.max(1, n)));
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // STEP 1 확정 — 이 값으로 이후 단계를 세운다
    const saveStep1 = () => {
        const rec: Step1Save = {
            sitting, year, deg: measuredDeg,
            at: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        };
        setStep1Saved(rec);
        try { window.localStorage.setItem(STEP1_KEY, JSON.stringify(rec)); } catch { /* 무시 */ }
        notify.success("좌향을 저장했습니다", `坐 ${rec.sitting} · 준공 ${rec.year}년 — 이 값으로 비성반을 세웁니다.`);
        goStep(2);
    };
    // STEP 2에서 저장값을 다시 끌어오기(도중에 값을 건드렸을 때 되돌리는 용도)
    const applyStep1 = () => {
        if (!step1Saved) return;
        setSitting(step1Saved.sitting);
        setYear(step1Saved.year);
        setMeasuredDeg(step1Saved.deg);
        notify.success("STEP 1 저장값을 불러왔습니다", `坐 ${step1Saved.sitting} · 준공 ${step1Saved.year}년`);
    };
    // 저장값과 지금 값이 어긋났는지 — 어긋나면 배너에서 알려 준다
    const step1Stale = !!step1Saved && (step1Saved.sitting !== sitting || step1Saved.year !== year);

    return (
        <div className="space-y-3" ref={topRef}>
            {/* 상단 바 — 이달의 비성(시점 정보) + 사용 방법 */}
            {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
            <div className="flex items-start gap-2">
                <div className="flex-1 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300">
                    🗓 <b>{now.getMonth() + 1}월의 비성</b> — 이달 오황 <b className="text-rose-500">{(Object.entries(monthly) as [Palace, number][]).find(([p2, n]) => p2 !== "中" && n === 5)?.[0] ? PALACE_DIR[(Object.entries(monthly) as [Palace, number][]).find(([p2, n]) => p2 !== "中" && n === 5)![0]] : "-"}</b>
                    · 이흑 <b className="text-rose-500">{(Object.entries(monthly) as [Palace, number][]).find(([p2, n]) => p2 !== "中" && n === 2)?.[0] ? PALACE_DIR[(Object.entries(monthly) as [Palace, number][]).find(([p2, n]) => p2 !== "中" && n === 2)![0]] : "-"}</b>
                    <span className="text-slate-400"> 방위 — 이달 공사·이사·침상 이동은 피하세요{monthInfo.nearBoundary ? " (절기 경계일 ±1일 오차 가능)" : ""}</span>
                </div>
                <button onClick={() => setGuideOpen(true)}
                    className="shrink-0 text-xs font-semibold text-[#bf953f] border border-[#d4af37]/40 rounded-full px-3 py-2 hover:bg-[#d4af37]/10 whitespace-nowrap">
                    📖 사용 방법
                </button>
            </div>

            {/* 진행 단계 표시 — 지금 어디인지, 어디까지 왔는지 */}
            <div className="glass-card px-3 py-2.5">
                <div className="flex items-center">
                    {STEP_DEFS.map((s, i) => (
                        <Fragment key={s.n}>
                            <button onClick={() => goStep(s.n)} className="flex flex-col items-center gap-1 shrink-0 px-0.5">
                                <span className={"w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-colors "
                                    + (step === s.n ? "border-[#d4af37] bg-[#d4af37] text-white dark:text-slate-900"
                                        : step > s.n ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                                            : "border-slate-300 dark:border-slate-600 text-slate-400")}>
                                    {step > s.n ? "✓" : s.n}
                                </span>
                                <span className={"text-[10px] whitespace-nowrap "
                                    + (step === s.n ? "font-bold text-[#bf953f]" : "text-slate-400")}>{s.label}</span>
                            </button>
                            {i < STEP_DEFS.length - 1 && (
                                <span className={"flex-1 h-0.5 mx-1 mb-4 rounded " + (step > s.n ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700")} />
                            )}
                        </Fragment>
                    ))}
                </div>
            </div>

            {/* ═ STEP 1. 좌향 재기 ═ */}
            <div className={"glass-card p-4 space-y-3 " + (step === 1 ? "" : "hidden")}>
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200">STEP 1 · 좌향 재기 <span className="font-normal text-[11px] text-slate-400">— 집이 등진 방위(坐)를 실측합니다</span></div>
                {/* 저장된 집 — 실측을 한 번 해두면 다음부터 원탭 로드 */}
                {homes.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-slate-400">🏠 저장된 집</span>
                        {homes.map((h) => (
                            <span key={h.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#d4af37]/35 bg-white/60 dark:bg-slate-800/60">
                                <button onClick={() => loadHome(h)} className="font-semibold text-slate-600 dark:text-slate-300 hover:text-[#bf953f]">
                                    {h.name}
                                </button>
                                <button onClick={() => removeHome(h.name)} aria-label="삭제" className="text-slate-400 hover:text-rose-500">×</button>
                            </span>
                        ))}
                    </div>
                )}
                {/* 재는 법 — 화면에는 요약과 그림만. 자세한 설명·유파 이야기는 '사용 방법'으로 뺐다. */}
                <div className="rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/40 px-3 py-2.5 text-[12px] text-sky-800 dark:text-sky-300 space-y-2">
                    <p>
                        🧭 거실 큰 창 앞에서 폰을 <b>수평으로 눕히고</b>, 폰 <b>위쪽 끝을 창면과 나란히</b> 맞추세요.
                        화살표가 가리키는 쪽이 <b>향(向)</b>입니다.
                    </p>
                    <AlignDiagram />
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            창틀에서 30~50cm 띄우고, 2~3곳에서 재보세요.
                        </span>
                        <button onClick={() => setGuideOpen(true)}
                            className="ml-auto text-[11px] font-semibold text-[#bf953f] underline whitespace-nowrap">
                            📖 자세한 방법
                        </button>
                    </div>
                </div>
                {/* 회전 나경판 — 센서 heading에 따라 판이 돌고, 위 포인터가 지금 향한 방위(向) */}
                <RotatingPlate heading={heading} sitting={sitting} facing={chart?.facing ?? ""} />
                {/* 센서 제어 — 3초 평균 측정으로 좌산 자동 설정 */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    {!sensorOn ? (
                        <Button onClick={startSensor} variant="outline" className="h-8 rounded-full text-xs">🧭 센서로 방위 재기</Button>
                    ) : heading == null ? (
                        <span className="text-xs text-slate-400">센서 신호 대기 중… (실제 휴대폰에서만 동작)</span>
                    ) : (
                        <>
                            <span className="text-xs">지금 향한 방위 <b className="text-[#bf953f]">{heading.toFixed(1)}°</b> (<b className="font-noto-serif">{mountainFromDeg(heading)}</b>)</span>
                            <Button onClick={captureSitting} disabled={capturing} className="h-8 rounded-full text-xs bg-slate-900 text-white dark:bg-[#d4af37] dark:text-slate-900">
                                {capturing ? "측정 중(3초)…" : "폰을 창면에 맞추고 → 좌향 잡기(3초 평균)"}
                            </Button>
                        </>
                    )}
                    <span className="text-[11px] text-slate-400">폰 위쪽 끝(짧은 변)을 창면과 나란히 맞춘 채 3초간 유지하세요</span>
                </div>
                {capNote && (
                    capNote.startsWith("✅")
                        ? <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300/60 dark:border-emerald-800/50 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">{capNote}</div>
                        : <p className="text-[11px] text-rose-500">{capNote}</p>
                )}
                {history.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                        <span>측정 이력</span>
                        {history.map((h, i) => (
                            <button key={i} onClick={() => { setSitting(h.sit); setMeasuredDeg(h.deg); }}
                                className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 hover:border-[#d4af37] hover:text-[#bf953f]">
                                {h.t} · 坐{h.sit} {h.deg}°(±{h.std}°)
                            </button>
                        ))}
                        <span className="text-slate-300 dark:text-slate-600">— 값이 비슷하면 신뢰해도 좋습니다</span>
                    </div>
                )}
                {/* ② 각도 직접 입력(다른 나경으로 실측한 값 옮겨 적기) */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>실측 각도 입력(도)</span>
                    <input type="number" value={degInput} placeholder="예: 187.5"
                        onChange={(e) => setDegInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyDeg(); }}
                        className="w-24 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <Button onClick={applyDeg} variant="outline" className="h-8 rounded-full text-xs">각도 → 좌산</Button>
                    <span className="text-[11px] text-slate-400">팔택 나경 탭이나 실물 패철로 잰 좌 방위각을 그대로 입력</span>
                </div>
                {/* ③ 수동 선택(실측값이 이미 확실할 때) */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>좌(坐) 직접 선택</span>
                    <select value={sitting} onChange={(e) => setSitting(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                        {MOUNTAINS_24.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="text-slate-400">→ 향(向) <b className="font-noto-serif text-[#bf953f]">{chart?.facing}</b></span>
                    <span className="ml-2">준공(건축)년</span>
                    <input type="number" value={year} min={1864} max={2100}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-20 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <span className="text-xs text-slate-400">{period}운 ({py0}~{py1})</span>
                </div>
                {/* 실측 각도의 공망(산 경계) 경고 — 경계에 걸치면 좌향 판정 자체가 흔들린다 */}
                {voidRes?.level && (
                    <div className="rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-300/60 dark:border-rose-800/50 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
                        ⚠ <b>{voidRes.level}</b> — 실측 좌향 {measuredDeg?.toFixed(1)}°가 {voidRes.between[0]}·{voidRes.between[1]} 경계(공망 폭 ±{voidRes.halfWidth}°)에 걸쳤습니다.
                        비성반 판정이 흔들리는 자리이니 측정 위치를 옮기거나 다시 재보세요.
                    </div>
                )}
                <p className="text-[11px] text-slate-400">
                    건물이 지어진(준공) 시기의 운(運)과 좌향으로 비성반을 세웁니다. 뼈대만 남긴 대수선을 했다면 공사 완료 해가 새 준공년입니다. 좌(坐)는 건물이 등지는 방위, 향(向)은 정면이 바라보는 방위입니다.
                </p>
            </div>

            {chart && (
                <div ref={chartRef} className={"glass-card p-4 space-y-3 " + (step === 2 ? "" : "hidden")}>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        STEP 2 · 비성반 읽기
                        {measuredDeg != null && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/60 dark:border-emerald-800/50 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">실측 {measuredDeg.toFixed(1)}° 적용됨</span>
                        )}
                    </div>
                    {/* STEP 1에서 넘어온 값 — 어느 측정으로 이 반을 세웠는지 밝힌다 */}
                    {step1Saved ? (
                        <div className={"rounded-xl px-3 py-2 text-[12px] border "
                            + (step1Stale
                                ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-800/50 text-amber-800 dark:text-amber-300"
                                : "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300")}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span>
                                    {step1Stale ? "⚠" : "🔗"} <b>STEP 1 저장값</b> — 坐 <b className="font-noto-serif">{step1Saved.sitting}</b>
                                    {step1Saved.deg != null ? ` (실측 ${step1Saved.deg.toFixed(1)}°)` : " (직접 선택)"}
                                    · 준공 {step1Saved.year}년 · {step1Saved.at} 저장
                                </span>
                                {step1Stale && (
                                    <Button onClick={applyStep1} variant="outline" className="h-7 rounded-full text-[11px] ml-auto">↻ 저장값으로 되돌리기</Button>
                                )}
                            </div>
                            {step1Stale && <p className="mt-1">지금 화면은 저장값과 다릅니다 — 현재 坐 <b className="font-noto-serif">{sitting}</b> · 준공 {year}년으로 계산 중입니다.</p>}
                        </div>
                    ) : (
                        <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
                            <span>아직 STEP 1에서 저장한 값이 없습니다 — 지금은 직접 선택한 坐 <b className="font-noto-serif">{sitting}</b>로 계산 중입니다.</span>
                            <Button onClick={() => goStep(1)} variant="outline" className="h-7 rounded-full text-[11px] ml-auto">← 좌향 재러 가기</Button>
                        </div>
                    )}
                    {/* 겸향(兼向)·체괘(替卦) — 실측 각도가 산 중앙을 벗어났는지, 어느 반으로 볼지 */}
                    {kyem && (
                        <div className={"rounded-xl px-3 py-2 text-[12px] border space-y-1.5 "
                            + (kyem.kyem
                                ? "bg-violet-50/70 dark:bg-violet-950/30 border-violet-300/60 dark:border-violet-800/50 text-violet-800 dark:text-violet-300"
                                : "bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300")}>
                            <div>
                                {kyem.kyem ? "⟡" : "•"} <b>{kyem.kyem ? `겸향 — ${kyem.type}` : "정향(하괘)"}</b>
                                <span className="text-slate-500 dark:text-slate-400"> · {kyem.mountain} 중심에서 {kyem.offset > 0 ? "+" : ""}{kyem.offset.toFixed(1)}°</span>
                            </div>
                            <p>{kyem.note}</p>
                            {kyem.kyem && (
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    <span className="text-[11px]">이 반은</span>
                                    {([false, true] as boolean[]).map((t) => (
                                        <button key={String(t)} onClick={() => setTiOverride(t)}
                                            className={"px-3 py-1 rounded-full text-[11px] font-semibold border "
                                                + (useTi === t
                                                    ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                                                    : "border-slate-300 dark:border-slate-600 text-slate-400")}>
                                            {t ? "체괘(替卦)" : "하괘(下卦)"}
                                        </button>
                                    ))}
                                    {tiOverride != null && (
                                        <button onClick={() => setTiOverride(null)} className="text-[11px] text-slate-400 underline">판정값으로</button>
                                    )}
                                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                                        판정: {kyem.useTi ? "체괘" : "하괘"}
                                    </span>
                                </div>
                            )}
                            {kyem.kyem && (
                                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                                    ⚠ 체괘는 유파가 갈립니다 — 쓰지 않고 각도 적중률 감쇠만 인정하는 계열(유훈승)도 있고,
                                    <b> 체괘는 당운만 관장하고 운이 지나면 효력을 잃는다</b>고 봅니다. 어느 반으로 봤는지 기록에 남기세요.
                                </p>
                            )}
                        </div>
                    )}
                    <div className="text-center">
                        <span className="text-sm text-slate-500">{chart.period}운 {chart.replaced ? "체괘" : "하괘"}반{chart.period !== curPeriod ? ` (현재 ${curPeriod}운)` : ""} <b className="font-noto-serif text-slate-800 dark:text-slate-100">{chart.sitting}山{chart.facing}向</b> · </span>
                        <span className={"text-sm font-bold " + (chart.structure === "왕산왕향" ? "text-emerald-600 dark:text-emerald-400" : chart.structure === "상산하수" ? "text-rose-500" : "text-[#bf953f]")}>{chart.structure}</span>
                    </div>
                    {/* 배치 토글 — 남상(전통 서적·필기와 동일) / 북상(지도·도면과 동일) */}
                    <div className="flex items-center justify-center gap-1.5 text-xs">
                        <button onClick={() => setMapView(false)}
                            className={"px-3 py-1 rounded-full font-semibold " + (!mapView ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>
                            남상(전통)
                        </button>
                        <button onClick={() => setMapView(true)}
                            className={"px-3 py-1 rounded-full font-semibold " + (mapView ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>
                            북상(지도식)
                        </button>
                        <span className="text-[10px] text-slate-400">{mapView ? "위=북 · 동=오른쪽 (도면과 같은 방향)" : "위=남 · 동=왼쪽 (전통 반 표기)"}</span>
                    </div>
                    {/* 9궁 비성반 (+연자백·조합·팔택) */}
                    <div className="grid grid-cols-3 gap-1.5 max-w-sm mx-auto">
                        {cells.map(({ p, combo, palStar }) => {
                            const isSit = p !== "中" && MOUNTAIN_INFO[chart.sitting].palace === p;
                            const isFace = p !== "中" && MOUNTAIN_INFO[chart.facing].palace === p;
                            const an = annual[p];
                            return (
                                <div key={p} className={"rounded-xl border p-2 text-center " +
                                    (isSit ? "border-[#d4af37] bg-[#d4af37]/10" : isFace ? "border-sky-400 bg-sky-50/60 dark:bg-sky-900/20" : "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40")}>
                                    <div className="flex justify-between text-base font-noto-serif px-1">
                                        <span className={MOOD_COLOR[starMood(chart.mountain[p], curPeriod)]}>{chart.mountain[p]}</span>
                                        <span className={MOOD_COLOR[starMood(chart.water[p], curPeriod)]}>{chart.water[p]}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                        {chart.base[p]} <span className={an === 5 || an === 2 ? "text-rose-500 font-bold" : ""}>年{an}</span>
                                        {p !== "中" && <span className={monthly[p] === 5 || monthly[p] === 2 ? " text-rose-500 font-bold" : ""}> 月{monthly[p]}</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-500">{PALACE_DIR[p]}{isSit ? " · 坐" : isFace ? " · 向" : ""}</div>
                                    {combo && <div className={"text-[9px] " + (combo.grade === "길" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>{combo.name}</div>}
                                    {palStar && <div className={"text-[9px] " + (GOOD_STARS.includes(palStar) ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-slate-400")}>택 {palStar}</div>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        <b className="text-[#bf953f]">{chart.structure}</b> — {chart.structureNote}
                    </div>

                    {/* 궁별 주요 조합 해설 */}
                    {cells.some((c) => c.combo) && (
                        <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                            {cells.filter((c) => c.combo).map(({ p, combo }) => (
                                <div key={p}>
                                    <b className={combo!.grade === "길" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>{PALACE_DIR[p]} {combo!.name}</b>
                                    <span className="text-slate-500"> — {combo!.note}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 연·월 자백 주의·추천 */}
                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <div>
                            <b className="text-rose-500">⚠ 주의 방위(연·월 오황/이흑)</b> — {warnDirs.join(", ") || "없음"}
                            <span className="text-slate-400"> · 공사·이사·침상 배치 회피{monthInfo.nearBoundary ? " · 절기 경계일(±1일)이라 월 판정에 오차 가능" : ""}</span>
                        </div>
                        {ming && bestDirs.length > 0 && (
                            <div><b className="text-emerald-600 dark:text-emerald-400">✦ 추천 방위(팔택 {ming}명 × 향성 왕·생기)</b> — {bestDirs.join(", ")}</div>
                        )}
                    </div>

                    {/* 고급 이기 판정 — 반음복음·입수·삼반괘·타겁·성문·합십 */}
                    {adv && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 p-3 space-y-1.5">
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">🔬 이 판의 특수 격국 <span className="font-normal text-[10px] text-slate-400">(현공비성 고급 판정)</span></div>
                            {/* 입수 — 지금 가장 실무적인 항목 */}
                            <div className="flex items-start gap-2 text-xs">
                                <span className="w-20 shrink-0 font-semibold text-slate-600 dark:text-slate-300">지운·입수</span>
                                <span className={"flex-1 " + (adv.el.imprisoned ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-600 dark:text-slate-300")}>
                                    지운 {adv.el.years}년 · {adv.el.note}
                                    {adv.el.split && (
                                        <span className="block mt-0.5 text-amber-700 dark:text-amber-400">
                                            ⚠ 체괘반이라 입수 판정 두 규칙이 갈립니다 — <b>중궁 향성 기준 {adv.el.waterPeriod}운</b> ↔
                                            <b> 향수궁 운성 기준 {adv.el.waterPeriodByBase}운</b>. 하괘에서는 둘이 늘 같지만 체괘에서는 어긋납니다.
                                            어느 규칙을 따르는 유파인지 확인하고 판단하세요.
                                        </span>
                                    )}
                                </span>
                            </div>
                            {(adv.ff.mountain || adv.ff.water) && (
                                <div className="flex items-start gap-2 text-xs">
                                    <span className="w-20 shrink-0 font-semibold text-rose-600 dark:text-rose-400">반음·복음</span>
                                    <span className="flex-1 text-rose-600 dark:text-rose-400">{adv.ff.note}</span>
                                </div>
                            )}
                            {adv.hap && (
                                <div className="flex items-start gap-2 text-xs">
                                    <span className="w-20 shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">전국 합십</span>
                                    <span className="flex-1 text-emerald-600 dark:text-emerald-400">
                                        운반과 {adv.hap === "왕정" ? "산성" : "향성"}이 전 궁에서 합 10 — <b>{adv.hap === "왕정" ? "사람이 왕성한 판(왕정)" : "재물이 왕성한 판(왕재)"}</b>입니다.
                                    </span>
                                </div>
                            )}
                            {adv.sam && (
                                <div className="flex items-start gap-2 text-xs">
                                    <span className="w-20 shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">삼반괘</span>
                                    <span className="flex-1 text-slate-600 dark:text-slate-300">
                                        <b className="text-emerald-600 dark:text-emerald-400">{adv.sam}</b> — 운이 바뀌어도 기운이 끊기지 않습니다(삼원불패). 단 뒤가 낮고 앞이 높은 지형(좌공조만)이라야 제 힘을 냅니다.
                                    </span>
                                </div>
                            )}
                            {adv.tag && (
                                <div className="flex items-start gap-2 text-xs">
                                    <span className="w-20 shrink-0 font-semibold text-slate-600 dark:text-slate-300">칠성타겁</span>
                                    <span className="flex-1 text-slate-600 dark:text-slate-300">
                                        <b className={adv.tag.usable ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>{adv.tag.kind}</b> — {adv.tag.note}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-start gap-2 text-xs">
                                <span className="w-20 shrink-0 font-semibold text-slate-600 dark:text-slate-300">성문결</span>
                                <span className="flex-1 text-slate-600 dark:text-slate-300">
                                    {adv.gate.filter((g) => g.ok).length > 0
                                        ? <>물·출입구를 두면 좋은 방위 — <b className="text-emerald-600 dark:text-emerald-400">{adv.gate.filter((g) => g.ok).map((g) => `${PALACE_DIR[g.palace]}(${g.kind})`).join(" · ")}</b></>
                                        : <span className="text-slate-400">성립하는 성문 없음</span>}
                                    {adv.gate.some((g) => g.ok === null) && <span className="text-slate-400"> · 일부는 운반 오황이라 판단 보류</span>}
                                </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                                ※ 전부 현공비성 계산이며 <b>하괘·체괘 각 216국 전수 검산</b>을 마친 항목입니다.
                                반음복음·삼반괘·타겁·성문·합십은 성반 자체만 보는 계산이라 반 종류와 무관하게 성립합니다.
                                유파에 따라 판정이 다를 수 있습니다.
                            </div>
                        </div>
                    )}

                    {/* 좌향 후보 비교 — 코너 세대처럼 창이 두 방향인 집은 향이 하나로 안 정해진다.
                        두 후보로 반을 각각 세워 놓고, 실제로 겪은 일과 어느 쪽이 맞는지 역검증하는 것이 실무 방법이다. */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 p-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">⚖ 좌향 후보 비교</span>
                            <span className="text-[10px] text-slate-400">코너 세대·창이 두 방향인 집에서 어느 면을 향으로 볼지 못 정할 때</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                            <select value={candPick} onChange={(e) => setCandPick(e.target.value)}
                                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                                {MOUNTAINS_24.map((m) => <option key={m} value={m}>{m}坐 → {oppositeMountain(m)}向</option>)}
                            </select>
                            <Button onClick={() => setCands((p) => (p.includes(candPick) || p.length >= 3 ? p : [...p, candPick]))}
                                variant="outline" className="h-7 rounded-full text-[11px]">+ 후보 추가</Button>
                            {cands.map((c) => (
                                <span key={c} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-violet-300 dark:border-violet-700 text-[11px] text-violet-700 dark:text-violet-300">
                                    <span className="font-noto-serif">{c}坐</span>
                                    <button onClick={() => setCands((p) => p.filter((x) => x !== c))} className="text-slate-400 hover:text-rose-500">×</button>
                                </span>
                            ))}
                        </div>
                        {cands.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px] border-collapse">
                                    <thead>
                                        <tr className="text-slate-500">
                                            <th className="text-left font-semibold py-1 pr-2 whitespace-nowrap">항목</th>
                                            {compareCols.map((c) => (
                                                <th key={c.key} className={"text-left font-semibold py-1 px-2 whitespace-nowrap " + (c.current ? "text-[#bf953f]" : "text-violet-600 dark:text-violet-400")}>
                                                    <span className="font-noto-serif">{c.chart.sitting}山{c.chart.facing}向</span>{c.current ? " (현재)" : ""}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-600 dark:text-slate-300">
                                        {COMPARE_ROWS.map((row) => (
                                            <tr key={row.label} className="border-t border-slate-200 dark:border-slate-700">
                                                <td className="py-1 pr-2 font-semibold whitespace-nowrap">{row.label}</td>
                                                {compareCols.map((c) => (
                                                    <td key={c.key} className="py-1 px-2">{row.get(c.chart, curPeriod, nowYear)}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-[10px] text-slate-400 mt-1.5">
                                    모두 <b>{useTi ? "체괘" : "하괘"}반 · {period}운</b> 기준입니다.
                                    어느 쪽이 맞는지는 <b>이 집에서 실제로 겪은 일</b>(재물 흐름, 아팠던 방위, 힘들었던 가족)과 대조해 정하세요.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 용도별 배치표 — 실무용 요약 */}
                    {usage.length > 0 && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 p-3 space-y-1.5">
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">📋 용도별 추천 배치</div>
                            {usage.map((u) => (
                                <div key={u.use} className="flex items-start gap-2 text-xs">
                                    <span className="w-24 shrink-0 font-semibold text-slate-600 dark:text-slate-300">{u.use}</span>
                                    <span className="flex-1">
                                        {u.dirs.length > 0
                                            ? <b className="text-emerald-600 dark:text-emerald-400">{u.dirs.join(" · ")}</b>
                                            : <span className="text-slate-400">뚜렷한 적방 없음</span>}
                                        <span className="text-slate-400"> — {u.why}</span>
                                    </span>
                                </div>
                            ))}
                            <div className="text-[10px] text-slate-400">※ 연·월 오황/이흑이 든 방위는 자동 감점됐습니다. 실제 배치는 구조·채광과 함께 판단하세요.</div>
                        </div>
                    )}

                    <div className="text-[11px] text-slate-400 leading-relaxed">
                        각 궁: 좌=산성(인정·건강) · 우=향성(재물) · 아래=운반·年연자백·月월자백{ming ? " · 택=팔택 팔성" : ""}.<br />
                        <span className={MOOD_COLOR["왕기"]}>{STAR_NAMES[curPeriod]}</span>=당운({curPeriod}운) 왕기 ·
                        <span className={MOOD_COLOR["생기"]}> 생기</span>(다음 운) ·
                        <span className={MOOD_COLOR["퇴기"]}> 퇴기</span> ·
                        <span className={MOOD_COLOR["쇠살"]}> 쇠살</span>.
                        향성 왕·생기 방위에 물(도로·출입구), 산성 왕·생기 방위에 산(높은 가구·벽)이 이상적입니다. 현공비성 기준이며 유파에 따라 해석이 다를 수 있습니다.
                    </div>

                    {/* 확인이 끝났으면 집으로 저장(재사용) / 이미지 보관 */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                        <input value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="예: 우리집, 사무실"
                            className="w-32 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-xs" />
                        <Button onClick={saveHome} variant="outline" className="h-8 rounded-full text-xs">🏠 집으로 저장</Button>
                        <Button onClick={saveImage} disabled={saving} variant="outline" className="h-8 rounded-full text-xs ml-auto">
                            {saving ? "저장 중..." : "📷 이미지 저장"}
                        </Button>
                    </div>
                </div>
            )}

            {/* ═ STEP 3. 도면에 적용 — 실측한 좌향·준공년을 그대로 물려받아 오버레이 ═ */}
            {chart && (
                <div className={"pt-1 " + (step === 3 ? "" : "hidden")}>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">STEP 3 · 도면에 적용 <span className="font-normal text-[11px] text-slate-400">— 도면을 먼저 올려도 됩니다. 중심 탭 → 정면 탭이면 잰 각도에 자동 정렬</span></div>
                    <FloorPlanView birthYear={birthYear} gender={gender} sitting={sitting} year={year} measuredDeg={measuredDeg} useTi={useTi}
                        onMapFacing={(face) => {
                            // 위성지도로 산출한 좌향 — 실측을 덮지 않고 확인을 받는다(지도는 교차검증용)
                            const sitDeg = (face + 180) % 360;
                            const m = mountainFromDeg(sitDeg);
                            if (measuredDeg != null && Math.abs(((sitDeg - measuredDeg + 540) % 360) - 180) > 3) {
                                notify.error(
                                    `지도값과 실측이 ${Math.abs(((sitDeg - measuredDeg + 540) % 360) - 180).toFixed(1)}° 차이납니다`,
                                    `실측 坐 ${measuredDeg.toFixed(1)}° ↔ 지도 坐 ${sitDeg.toFixed(1)}°(${m}). 실측값을 유지했습니다 — 바꾸려면 STEP 1에서 각도를 직접 입력하세요.`,
                                );
                                return;
                            }
                            setSitting(m);
                            setMeasuredDeg(sitDeg);
                            notify.success(`지도 좌향 적용 — 坐 ${m}`, `${sitDeg.toFixed(1)}° · STEP 2 비성반에 반영했습니다.`);
                        }}
                        embedded />
                </div>
            )}

            {/* ═ STEP 4. AI 풀이 ═ */}
            {chart && (
                <div className={"glass-card p-4 space-y-3 " + (step === 4 ? "" : "hidden")}>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">STEP 4 · AI 풀이 <span className="font-normal text-[11px] text-slate-400">— 격국·배치·올해 주의 방위를 종합 해석</span></div>
                    {/* 무엇을 근거로 푸는지 먼저 보여 준다 — 결과만 던지면 신뢰가 안 선다 */}
                    <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11.5px] text-slate-600 dark:text-slate-300 space-y-1">
                        <div className="font-semibold text-slate-700 dark:text-slate-200">이 값으로 풀이합니다</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>坐 <b className="font-noto-serif">{chart.sitting}</b>·向 <b className="font-noto-serif">{chart.facing}</b></span>
                            <span>{chart.period}운 <b>{chart.replaced ? "체괘" : "하괘"}반</b>{chart.period !== curPeriod ? ` (당운 ${curPeriod}운)` : ""}</span>
                            <span>격국 <b>{chart.structure}</b></span>
                            <span>{measuredDeg != null ? `실측 ${measuredDeg.toFixed(1)}°` : "직접 선택값"}</span>
                            {kyem?.kyem && <span className="text-violet-600 dark:text-violet-400">겸향 {kyem.type}</span>}
                            {ming && <span>본명괘 <b className="font-noto-serif">{ming}</b></span>}
                            <span>연자백 {annualYear}년</span>
                        </div>
                        {measuredDeg == null && (
                            <p className="text-amber-700 dark:text-amber-400">
                                아직 실측 전입니다 — STEP 1에서 좌향을 재면 풀이 정확도가 올라갑니다.
                            </p>
                        )}
                    </div>
                    <Button onClick={interpret} disabled={interpreting} className="w-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900">
                        {interpreting ? "풀이 중..." : interp ? "✨ 다시 풀이하기" : "✨ AI 현공 풀이 받기"}
                    </Button>
                    {!interp && !interpreting && (
                        <p className="text-[11px] text-slate-400 text-center">
                            방위별 기운, 침실·공부방·금고 자리, 올해 피할 방위와 보완법을 정리해 드립니다.
                        </p>
                    )}
                    {interp && <ReportRenderer text={interp} streaming={interpreting} />}
                </div>
            )}

            {/* 단계 이동 — 화면 아래에 고정해 스크롤 끝까지 내려가지 않아도 넘어갈 수 있게 */}
            <div className="sticky bottom-2 z-30 flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-2.5 py-2 shadow-lg">
                {step > 1 ? (
                    <Button onClick={() => goStep(step - 1)} variant="outline" className="h-9 rounded-full text-xs px-4">← 이전</Button>
                ) : <span />}
                {step === 1 && measuredDeg == null && (
                    <span className="text-[10.5px] leading-tight text-amber-600 dark:text-amber-400">
                        아직 실측 전입니다<br />직접 선택한 좌({sitting})로 진행됩니다
                    </span>
                )}
                {step === 1 ? (
                    /* STEP 1은 '저장'이 곧 다음 단계로 넘기는 행위 — 값이 확정돼 넘어간다는 걸 버튼으로 보이게 */
                    <Button onClick={saveStep1}
                        className="h-9 rounded-full text-xs px-5 font-bold ml-auto bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900 dark:hover:bg-[#c9a648]">
                        💾 저장하고 다음 →
                    </Button>
                ) : step < 4 ? (
                    <Button onClick={() => goStep(step + 1)}
                        className="h-9 rounded-full text-xs px-5 font-bold ml-auto bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900 dark:hover:bg-[#c9a648]">
                        {STEP_DEFS[step].label} →
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
