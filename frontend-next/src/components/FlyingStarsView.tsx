"use client";

import { useMemo, useState } from "react";
import { starChart, periodOf, periodYears, STAR_NAMES, starMood, MOUNTAIN_INFO, type Palace } from "@/lib/flyingStars";

// 현공비성(玄空飛星) 뷰 — 좌산·조성(입주)년도로 비성반을 산출해 9궁으로 보여준다.
// 계산은 lib/flyingStars.ts(문헌 표준 대조 검증 완료)만 사용한다.

// 낙서 3×3 배치 (위=남 아님 — 통상 표기: 위가 남쪽인 지도식 대신 낙서 표준 사용)
const GRID: Palace[][] = [
    ["巽", "離", "坤"],
    ["震", "中", "兌"],
    ["艮", "坎", "乾"],
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

export default function FlyingStarsView() {
    const nowYear = new Date().getFullYear();
    const [sitting, setSitting] = useState("子");
    const [year, setYear] = useState(nowYear);

    const chart = useMemo(() => {
        try {
            return starChart(sitting, periodOf(year));
        } catch {
            return null;
        }
    }, [sitting, year]);
    const period = periodOf(year);
    const [py0, py1] = periodYears(period);

    return (
        <div className="space-y-3">
            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>좌(坐)</span>
                    <select value={sitting} onChange={(e) => setSitting(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                        {MOUNTAINS_24.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="text-slate-400">→ 향(向) <b className="font-noto-serif text-[#bf953f]">{chart?.facing}</b></span>
                    <span className="ml-2">조성·입주년</span>
                    <input type="number" value={year} min={1864} max={2100}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-20 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <span className="text-xs text-slate-400">{period}운 ({py0}~{py1})</span>
                </div>
                <p className="text-[11px] text-slate-400">
                    건물이 지어진(또는 입주한) 시기의 운(運)과 좌향으로 비성반을 세웁니다. 좌(坐)는 건물이 등지는 방위, 향(向)은 정면이 바라보는 방위입니다.
                </p>
            </div>

            {chart && (
                <div className="glass-card p-4 space-y-3">
                    <div className="text-center">
                        <span className="text-sm text-slate-500">{chart.period}운 <b className="font-noto-serif text-slate-800 dark:text-slate-100">{chart.sitting}山{chart.facing}向</b> · </span>
                        <span className={"text-sm font-bold " + (chart.structure === "왕산왕향" ? "text-emerald-600 dark:text-emerald-400" : chart.structure === "상산하수" ? "text-rose-500" : "text-[#bf953f]")}>{chart.structure}</span>
                    </div>
                    {/* 9궁 비성반 */}
                    <div className="grid grid-cols-3 gap-1.5 max-w-sm mx-auto">
                        {GRID.flat().map((p) => {
                            const isSit = p !== "中" && MOUNTAIN_INFO[chart.sitting].palace === p;
                            const isFace = p !== "中" && MOUNTAIN_INFO[chart.facing].palace === p;
                            return (
                                <div key={p} className={"rounded-xl border p-2 text-center " +
                                    (isSit ? "border-[#d4af37] bg-[#d4af37]/10" : isFace ? "border-sky-400 bg-sky-50/60 dark:bg-sky-900/20" : "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40")}>
                                    <div className="flex justify-between text-base font-noto-serif px-1">
                                        <span className={MOOD_COLOR[starMood(chart.mountain[p], chart.period)]}>{chart.mountain[p]}</span>
                                        <span className={MOOD_COLOR[starMood(chart.water[p], chart.period)]}>{chart.water[p]}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{chart.base[p]}</div>
                                    <div className="text-[10px] text-slate-500">{PALACE_DIR[p]}{isSit ? " · 坐" : isFace ? " · 向" : ""}</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-[11px] text-slate-400 text-center">각 궁: 좌=산성(인정) · 우=향성(재물) · 아래 작은 수=운반</div>
                    <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        <b className="text-[#bf953f]">{chart.structure}</b> — {chart.structureNote}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                        <span className={MOOD_COLOR["왕기"]}>{STAR_NAMES[chart.period]}</span>=당운 왕기 ·
                        <span className={MOOD_COLOR["생기"]}> 생기</span>(다음 운) ·
                        <span className={MOOD_COLOR["퇴기"]}> 퇴기</span> ·
                        <span className={MOOD_COLOR["쇠살"]}> 쇠살</span>.
                        향성 왕기·생기 방위에 물(도로·출입구), 산성 왕기·생기 방위에 산(높은 가구·벽)이 이상적입니다. 현공비성 기준이며 유파에 따라 해석이 다를 수 있습니다.
                    </div>
                </div>
            )}
        </div>
    );
}
