"use client";

import { useMemo, useState } from "react";
import {
    starChart, periodOf, periodYears, STAR_NAMES, starMood, MOUNTAIN_INFO,
    mountainFromDeg, annualChart, comboFor, type Palace,
} from "@/lib/flyingStars";
import { mingGua, starFor, type Trigram, type Star } from "@/lib/eightMansions";
import { streamSSE } from "@/lib/analyzeStream";
import { ReportRenderer } from "@/components/ReportRenderer";
import { Button } from "@/components/ui/button";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 현공비성(玄空飛星) 뷰 — 좌산·조성(입주)년도로 비성반을 산출해 9궁으로 보여준다.
// 계산은 lib/flyingStars.ts(문헌 표준 + 실전 감정 사례 대조 검증 완료)만 사용한다.

// 낙서 3×3 배치
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
// 팔택 팔성 중 길성
const GOOD_STARS: Star[] = ["생기", "천의", "연년", "복위"];

interface Props {
    birthYear?: number;            // 입춘 보정 연도(팔택 본명괘 통합용)
    gender?: "male" | "female";
}

export default function FlyingStarsView({ birthYear, gender }: Props) {
    const now = new Date();
    const nowYear = now.getFullYear();
    // 연자백은 입춘(2/4경) 기준 연도
    const annualYear = now.getMonth() + 1 < 2 || (now.getMonth() + 1 === 2 && now.getDate() < 4) ? nowYear - 1 : nowYear;

    const [sitting, setSitting] = useState("子");
    const [year, setYear] = useState(nowYear);
    const [degInput, setDegInput] = useState("");   // 좌향 각도(도) 직접 입력
    const [interp, setInterp] = useState("");
    const [interpreting, setInterpreting] = useState(false);

    const chart = useMemo(() => {
        try { return starChart(sitting, periodOf(year)); } catch { return null; }
    }, [sitting, year]);
    const annual = useMemo(() => annualChart(annualYear), [annualYear]);
    const period = periodOf(year);
    const [py0, py1] = periodYears(period);

    // 팔택 본명괘(있으면 궁별 팔성 표시 + 교집합 추천)
    const ming: Trigram | null = useMemo(() => {
        if (!birthYear || !gender) return null;
        try { return mingGua(birthYear, gender); } catch { return null; }
    }, [birthYear, gender]);

    // 각도 입력 → 좌산 자동 설정 (팔택 나경 탭에서 잰 값을 옮겨 적는 용도)
    const applyDeg = () => {
        const d = parseFloat(degInput);
        if (Number.isFinite(d)) setSitting(mountainFromDeg(d));
    };

    // 궁별 표시 데이터 — 조합·팔택까지 합성
    const cells = useMemo(() => {
        if (!chart) return [];
        return GRID.flat().map((p) => {
            const combo = p === "中" ? null : comboFor(chart.mountain[p], chart.water[p]);
            const palTri = p === "中" ? null : (p as Trigram);
            const palStar = ming && palTri ? starFor(ming, palTri) : null;
            return { p, combo, palStar };
        });
    }, [chart, ming]);

    // 교집합 추천: 팔택 길성 ∩ 향성 왕/생기
    const bestDirs = useMemo(() => {
        if (!chart || !ming) return [];
        return GRID.flat().filter((p) => {
            if (p === "中") return false;
            const mood = starMood(chart.water[p], chart.period);
            const ps = starFor(ming, p as Trigram);
            return (mood === "왕기" || mood === "생기") && GOOD_STARS.includes(ps);
        }).map((p) => `${PALACE_DIR[p]}(향성 ${chart.water[p]}·팔택 ${starFor(ming, p as Trigram)})`);
    }, [chart, ming]);

    // 올해 주의 방위(연자백 오황·이흑)
    const warnDirs = useMemo(() => {
        const w: string[] = [];
        (Object.entries(annual) as [Palace, number][]).forEach(([p, n]) => {
            if (p === "中") return;
            if (n === 5) w.push(`${PALACE_DIR[p]}(오황)`);
            if (n === 2) w.push(`${PALACE_DIR[p]}(이흑)`);
        });
        return w;
    }, [annual]);

    async function interpret() {
        if (!chart) return;
        setInterpreting(true); setInterp("");
        const body = {
            sitting: chart.sitting, facing: chart.facing, period: chart.period,
            structure: chart.structure, annual_year: annualYear,
            ming_gua: ming ?? "",
            cells: GRID.flat().filter((p) => p !== "中").map((p) => ({
                방위: PALACE_DIR[p], 산성: chart.mountain[p], 향성: chart.water[p], 운반: chart.base[p],
                연성: annual[p], 조합: comboFor(chart.mountain[p], chart.water[p])?.name ?? "",
                팔택: ming ? starFor(ming, p as Trigram) : "",
            })),
        };
        try {
            await streamSSE(`${API_BASE}/classic/hyeongong/analyze`, body, setInterp);
        } catch {
            setInterp("해석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally { setInterpreting(false); }
    }

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
                {/* 팔택 나경 측정값 연동: 잰 각도를 입력하면 좌산 자동 선택 */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>좌향 각도(도)</span>
                    <input type="number" value={degInput} placeholder="예: 187.5"
                        onChange={(e) => setDegInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyDeg(); }}
                        className="w-24 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <Button onClick={applyDeg} variant="outline" className="h-8 rounded-full text-xs">각도 → 좌산</Button>
                    <span className="text-[11px] text-slate-400">팔택 나경 탭에서 잰 좌 방위각을 그대로 입력</span>
                </div>
                <p className="text-[11px] text-slate-400">
                    건물이 지어진(입주한) 시기의 운(運)과 좌향으로 비성반을 세웁니다. 좌(坐)는 건물이 등지는 방위, 향(向)은 정면이 바라보는 방위입니다.
                </p>
            </div>

            {chart && (
                <div className="glass-card p-4 space-y-3">
                    <div className="text-center">
                        <span className="text-sm text-slate-500">{chart.period}운 <b className="font-noto-serif text-slate-800 dark:text-slate-100">{chart.sitting}山{chart.facing}向</b> · </span>
                        <span className={"text-sm font-bold " + (chart.structure === "왕산왕향" ? "text-emerald-600 dark:text-emerald-400" : chart.structure === "상산하수" ? "text-rose-500" : "text-[#bf953f]")}>{chart.structure}</span>
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
                                        <span className={MOOD_COLOR[starMood(chart.mountain[p], chart.period)]}>{chart.mountain[p]}</span>
                                        <span className={MOOD_COLOR[starMood(chart.water[p], chart.period)]}>{chart.water[p]}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">{chart.base[p]} <span className={an === 5 || an === 2 ? "text-rose-500 font-bold" : ""}>年{an}</span></div>
                                    <div className="text-[10px] text-slate-500">{PALACE_DIR[p]}{isSit ? " · 坐" : isFace ? " · 向" : ""}</div>
                                    {combo && <div className={"text-[9px] " + (combo.grade === "길" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>{combo.name}</div>}
                                    {palStar && <div className={"text-[9px] " + (GOOD_STARS.includes(palStar) ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-slate-400")}>택 {palStar}</div>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-[11px] text-slate-400 text-center">각 궁: 좌=산성(인정) · 우=향성(재물) · 아래=운반·年연자백{ming ? " · 택=팔택 팔성" : ""}</div>

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

                    {/* 올해의 연자백 주의·추천 */}
                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <div><b className="text-rose-500">⚠ {annualYear}년 주의 방위</b> — {warnDirs.join(", ") || "없음"} <span className="text-slate-400">(연자백 오황·이흑: 공사·침상 배치 회피)</span></div>
                        {ming && bestDirs.length > 0 && (
                            <div><b className="text-emerald-600 dark:text-emerald-400">✦ 추천 방위(팔택 {ming}명 × 향성 왕·생기)</b> — {bestDirs.join(", ")}</div>
                        )}
                    </div>

                    <div className="text-[11px] text-slate-400 leading-relaxed">
                        <span className={MOOD_COLOR["왕기"]}>{STAR_NAMES[chart.period]}</span>=당운 왕기 ·
                        <span className={MOOD_COLOR["생기"]}> 생기</span>(다음 운) ·
                        <span className={MOOD_COLOR["퇴기"]}> 퇴기</span> ·
                        <span className={MOOD_COLOR["쇠살"]}> 쇠살</span>.
                        향성 왕·생기 방위에 물(도로·출입구), 산성 왕·생기 방위에 산(높은 가구·벽)이 이상적입니다. 현공비성 기준이며 유파에 따라 해석이 다를 수 있습니다.
                    </div>

                    <Button onClick={interpret} disabled={interpreting} className="w-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900">
                        {interpreting ? "풀이 중..." : "✨ AI 현공 풀이"}
                    </Button>
                </div>
            )}

            {interp && (
                <div className="glass-card p-5">
                    <ReportRenderer text={interp} streaming={interpreting} />
                </div>
            )}
        </div>
    );
}
