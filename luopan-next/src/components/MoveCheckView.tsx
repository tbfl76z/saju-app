"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/useToast";
import { starChart, periodOf, annualChart, MOUNTAIN_INFO, starMood, type StarChart, type Palace } from "@/lib/flyingStars";
import { mingGua, type Trigram } from "@/lib/eightMansions";

// 이사할 집 진단 — 반(비성반)은 "준공(건축) 연도"의 운으로 세운다(필수 기준).
// 건물이 완성되는 순간 그 시기의 운이 집에 고착된다는 현공의 원칙(대수선 시 완료 해가 새 준공년).
// 입주 예정 해는 선택 입력 — 넣으면 그 해 연자백 흉성(이사 시기)을 추가 점검하고,
// 왕쇠 재평가의 당운 기준으로 쓴다(미입력 시 올해 기준).
// 판정: ① 원운 격국 ② 실운 시 당운 기준 재평가 ③ (선택) 입주 해 흉성 ④ 동서사택 궁합 → 🟢추천~🔴재고.

const EAST_TRIGRAMS: Trigram[] = ["坎", "離", "震", "巽"];
const MOUNTAINS_24 = Object.keys(MOUNTAIN_INFO);
const PALACE_DIR: Record<string, string> = {
    坎: "북", 艮: "북동", 震: "동", 巽: "남동", 離: "남", 坤: "남서", 兌: "서", 乾: "북서",
};

interface Candidate { name: string; sitting: string; built: number; year: number | null; ent?: string | null }
const CAND_KEY = "destiny-hyeongong-candidates";
function loadCands(): Candidate[] {
    try {
        const raw = window.localStorage.getItem(CAND_KEY);
        const p = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(p)) return [];
        // 구버전(준공년 없이 저장) 호환 — 당시 판정에 쓰인 연도를 준공년으로 승계
        return p.map((c) => ({ ...c, built: Number(c.built ?? c.year), year: c.year ?? null, ent: c.ent ?? null }));
    } catch { return []; }
}
function saveCands(list: Candidate[]) {
    try { window.localStorage.setItem(CAND_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* 무시 */ }
}

interface Note { good: boolean; text: string }
interface Verdict {
    grade: string; label: string; emoji: string; cls: string;
    structure: string; builtPeriod: number; curPeriod: number; facing: string; notes: Note[];
    /** 방위 배치 힌트 — 당운 기준 향성·산성 왕/생 방위와 5·2 회피 방위 */
    goodWater: string[]; goodMountain: string[]; avoidDirs: string[];
}

const GUA8: Palace[] = ["坎", "艮", "震", "巽", "離", "坤", "兌", "乾"];

function diagnose(sitting: string, builtYear: number, moveYear: number | null, nowYear: number, entrance: Palace | null, ming: Trigram | null): Verdict | null {
    const builtPeriod = periodOf(builtYear);            // 원운 — 반의 골조를 결정
    const curPeriod = periodOf(moveYear ?? nowYear);    // 당운(입주 시점, 미입력 시 올해) — 왕쇠 판정 기준
    let chart: StarChart;
    try { chart = starChart(sitting, builtPeriod); } catch { return null; }
    const notes: Note[] = [];
    let score = 0;
    const inPeriod = builtPeriod === curPeriod;   // 원운이 아직 유효한가(실운 여부)

    // ① 원운 격국 — 집의 선천 골조. 원운이 지나면(실운) 힘이 줄어든 것으로 감점
    const st = chart.structure;
    if (st === "왕산왕향") {
        score += inPeriod ? 2 : 1;
        notes.push({ good: true, text: `왕산왕향 — 사람 운(산성)과 재물 운(향성)이 모두 제자리에 든 가장 좋은 격국입니다.${inPeriod ? "" : ` 다만 ${builtPeriod}운에 지어진 집이라 지금(${curPeriod}운)은 전성기가 지났습니다(실운).`}` });
    } else if (st === "쌍성회향") {
        score += inPeriod ? 1 : 0.5;
        notes.push({ good: true, text: `쌍성회향 — 재물 운이 우세한 집입니다. 정면(향)이 도로·마당 등으로 트여 있으면 더 좋습니다.${inPeriod ? "" : " 원운이 지나 그 힘은 줄었습니다."}` });
    } else if (st === "쌍성회좌") {
        score += inPeriod ? 1 : 0.5;
        notes.push({ good: true, text: `쌍성회좌 — 건강·인간관계 운이 우세한 집입니다. 뒤(좌)가 든든히 받쳐주면 좋습니다.${inPeriod ? "" : " 원운이 지나 그 힘은 줄었습니다."}` });
    } else if (st === "상산하수") {
        score += inPeriod ? -2 : -1;
        notes.push({ good: false, text: `상산하수 — 산과 물이 뒤바뀐 흉국입니다. 가급적 피하고, 부득이하면 전문가의 비보(보완)가 필요합니다.${inPeriod ? "" : " 원운이 지나 흉의 힘도 다소 줄었지만 골조 자체는 불리합니다."}` });
    } else {
        notes.push({ good: true, text: "평국 — 뚜렷한 길흉이 없는 무난한 판입니다. 방 배치로 좋은 방위를 살려 쓰면 됩니다." });
    }

    const sitPal = MOUNTAIN_INFO[sitting].palace;
    const facePal = MOUNTAIN_INFO[chart.facing].palace;
    const vital = (n: number) => { const m = starMood(n, curPeriod); return m === "왕기" || m === "생기"; };

    // ② 당운 기준 왕쇠 재평가 — 반의 숫자는 원운 것이지만, 어느 숫자가 왕한지는 지금 운이 정한다
    if (inPeriod) {
        // 당운 건물: 격국이 이미 왕쇠를 담고 있어 회향·왕향이 아닐 때만 정면 기운을 가점
        if (st !== "왕산왕향" && st !== "쌍성회향") {
            const wm = starMood(chart.water[facePal], curPeriod);
            if (wm === "왕기" || wm === "생기") {
                score += 0.5;
                notes.push({ good: true, text: `정면(向·${PALACE_DIR[facePal]}) 방위에 재물 기운(향성 ${chart.water[facePal]})이 살아 있습니다.` });
            }
        }
    } else {
        const wm = starMood(chart.water[facePal], curPeriod);
        if (wm === "왕기" || wm === "생기") {
            score += 1;
            notes.push({ good: true, text: `현재 ${curPeriod}운 기준으로도 정면(向·${PALACE_DIR[facePal]})에 재물 기운(향성 ${chart.water[facePal]}·${wm})이 살아 있어 실운을 상당 부분 만회합니다.` });
        } else if (wm === "쇠살") {
            score -= 0.5;
            notes.push({ good: false, text: `정면(向·${PALACE_DIR[facePal]})의 향성 ${chart.water[facePal]}이 현재 ${curPeriod}운 기준 힘을 잃었습니다(쇠살). 재물 기운이 약한 편입니다.` });
        }
        const mm = starMood(chart.mountain[sitPal], curPeriod);
        if (mm === "왕기" || mm === "생기") {
            score += 0.5;
            notes.push({ good: true, text: `뒤(坐·${PALACE_DIR[sitPal]})의 산성 ${chart.mountain[sitPal]}이 현재 운 기준 살아 있어 건강·인간관계 운은 받쳐줍니다.` });
        }
    }

    // ③ (선택) 현관 방위 — 기운의 입구(氣口). 향성 왕/생이면 재물 길, 5·2가 들면 흉
    if (entrance) {
        const ew = chart.water[entrance];
        if ([5, 2].includes(ew) || [5, 2].includes(chart.mountain[entrance])) {
            score -= 1;
            notes.push({ good: false, text: `현관(${PALACE_DIR[entrance]}) 방위의 성요에 오황(5)·이흑(2)이 들어 있습니다. 기운의 입구가 흉방이라 재물 누수·질병이 우려됩니다(부득이하면 현관 비보 필요).` });
        } else if (vital(ew)) {
            score += 1;
            notes.push({ good: true, text: `현관(${PALACE_DIR[entrance]})에 재물 기운(향성 ${ew}·${starMood(ew, curPeriod)})이 임했습니다 — 기운의 입구(氣口)가 길방입니다.` });
        } else {
            notes.push({ good: true, text: `현관(${PALACE_DIR[entrance]}) 방위는 뚜렷한 길흉 없이 무난합니다.` });
        }
    }

    // ④ (선택) 입주 예정 해의 연자백 — 좌·향·현관 방위에 오황/이흑이 들면 감점(이사 시기 조정 신호)
    if (moveYear != null) {
        const annual = annualChart(moveYear);
        const bad = (n: number) => n === 5 || n === 2;
        const hitFace = bad(annual[facePal as Palace]);
        const hitSit = bad(annual[sitPal as Palace]);
        const hitEnt = entrance != null && bad(annual[entrance]);
        if (hitFace || hitSit || hitEnt) {
            score -= 1;
            const where = [
                hitFace ? `정면(向·${PALACE_DIR[facePal]})` : "",
                hitSit ? `뒤(坐·${PALACE_DIR[sitPal]})` : "",
                hitEnt ? `현관(${PALACE_DIR[entrance!]})` : "",
            ].filter(Boolean).join("과 ");
            notes.push({ good: false, text: `입주 예정 해(${moveYear})의 연자백 흉성(오황·이흑)이 집의 ${where} 방위에 듭니다. 입주 시기를 한 해 조정하거나, 그 해 해당 방위의 공사·현관 교체를 피하세요.` });
        } else {
            notes.push({ good: true, text: `입주 예정 해(${moveYear})의 연자백 흉성(오황·이흑)이 좌·향${entrance ? "·현관" : ""} 방위를 비켜갑니다.` });
        }
    }

    // ④ 동서사택 — 본명괘와 집 괘(좌 궁)의 그룹 일치 여부(참고)
    if (ming) {
        const houseEast = EAST_TRIGRAMS.includes(sitPal as Trigram);
        const mingEast = EAST_TRIGRAMS.includes(ming);
        if (houseEast === mingEast) {
            score += 0.5;
            notes.push({ good: true, text: `팔택 참고 — 본명괘(${ming})와 집(${sitPal}宅)이 같은 ${mingEast ? "동사택" : "서사택"} 그룹이라 나와 잘 맞는 편입니다.` });
        } else {
            notes.push({ good: false, text: `팔택 참고 — 본명괘(${ming})와 집(${sitPal}宅)의 동·서사택 그룹이 다릅니다. 침실·현관을 내 길방에 두어 보완하세요(판정 감점 없음, 참고용).` });
        }
    }

    // ⑥ 방위 배치 힌트 — 현관·거실 창은 향성(재물) 왕/생 방위, 침실은 산성(건강) 왕/생 방위,
    //    향성·산성에 5(오황)·2(이흑)가 든 방위는 현관·침실로 피한다
    const goodWater = GUA8.filter((p) => vital(chart.water[p])).map((p) => `${PALACE_DIR[p]}(향성 ${chart.water[p]})`);
    const goodMountain = GUA8.filter((p) => vital(chart.mountain[p])).map((p) => `${PALACE_DIR[p]}(산성 ${chart.mountain[p]})`);
    const avoidDirs = GUA8.filter((p) => [5, 2].includes(chart.water[p]) || [5, 2].includes(chart.mountain[p])).map((p) => PALACE_DIR[p]);

    const g = score >= 2 ? { grade: "추천", label: "좋은 집입니다", emoji: "🟢", cls: "text-emerald-600 dark:text-emerald-400" }
        : score >= 1 ? { grade: "무난", label: "괜찮은 집입니다 — 아래 확인 사항을 보세요", emoji: "🟡", cls: "text-[#bf953f]" }
            : score >= 0 ? { grade: "보통", label: "무난하지만 배치로 보완이 필요합니다", emoji: "🟠", cls: "text-orange-500" }
                : { grade: "재고", label: "권하지 않는 집입니다", emoji: "🔴", cls: "text-rose-500" };
    return { ...g, structure: st, builtPeriod, curPeriod, facing: chart.facing, notes, goodWater, goodMountain, avoidDirs };
}

interface Props {
    birthYear?: number;
    gender?: "male" | "female";
    /** '우리집 진단' 탭에서 실측·선택된 좌산 — 미전달 시 localStorage에서 읽는다 */
    currentSitting?: string;
    currentDeg?: number | null;
}

export default function MoveCheckView({ birthYear, gender, currentSitting, currentDeg }: Props) {
    const nowYear = new Date().getFullYear();
    const [sitting, setSitting] = useState("子");
    const [builtIn, setBuiltIn] = useState("");   // 준공 연도 — 기본값 없이 직접 입력(임의 추정 방지)
    const [yearIn, setYearIn] = useState("");     // 입주 예정 해(선택)
    const [ent, setEnt] = useState<Palace | "">("");   // 현관 방위(선택) — 집 중심에서 본 8방위
    const [name, setName] = useState("");
    const [cands, setCands] = useState<Candidate[]>([]);
    useEffect(() => { setCands(loadCands()); }, []);

    const ming: Trigram | null = useMemo(() => {
        if (!birthYear || !gender) return null;
        try { return mingGua(birthYear, gender); } catch { return null; }
    }, [birthYear, gender]);

    const builtYear = useMemo(() => {
        const v = parseInt(builtIn, 10);
        return v >= 1864 && v <= 2100 ? v : null;
    }, [builtIn]);
    const moveYear = useMemo(() => {
        const v = parseInt(yearIn, 10);
        return v >= 1900 && v <= 2100 ? v : null;
    }, [yearIn]);

    const res = useMemo(
        () => (builtYear != null ? diagnose(sitting, builtYear, moveYear, nowYear, ent || null, ming) : null),
        [sitting, builtYear, moveYear, nowYear, ent, ming]
    );

    const useMeasured = () => {
        // 별도 탭에서 쓰이므로 props가 없으면 '우리집 진단' 탭의 실측값을 localStorage에서 읽는다
        let sit = currentSitting;
        let deg = currentDeg ?? null;
        if (!sit) {
            try {
                sit = window.localStorage.getItem("destiny-luopan-sitting") ?? undefined;
                const d = parseFloat(window.localStorage.getItem("destiny-luopan-deg") || "");
                deg = Number.isFinite(d) ? d : null;
            } catch { /* 무시 */ }
        }
        if (!sit || !MOUNTAIN_INFO[sit]) {
            notify.error("가져올 실측값이 없습니다", "'우리집 진단' 메뉴의 STEP 1에서 좌향을 먼저 재세요.");
            return;
        }
        setSitting(sit);
        notify.success(
            `실측 좌향 가져옴: ${sit}坐` + (deg != null ? ` (${deg.toFixed(1)}°)` : ""),
            "후보 집 현장에서 실측한 값이면 가장 정확합니다."
        );
    };

    const addCand = () => {
        if (builtYear == null) { notify.error("준공 연도를 먼저 입력하세요", "반(운)을 세우는 기준이라 꼭 필요합니다."); return; }
        const nm = name.trim() || `${sitting}坐 ${builtYear}년 준공`;
        const next = [{ name: nm, sitting, built: builtYear, year: moveYear, ent: ent || null }, ...cands.filter((c) => c.name !== nm)].slice(0, 8);
        setCands(next); saveCands(next); setName("");
        notify.success(`'${nm}' 비교 목록에 담았습니다`);
    };
    const removeCand = (nm: string) => {
        const next = cands.filter((c) => c.name !== nm);
        setCands(next); saveCands(next);
    };

    return (
        <div className="glass-card p-4 space-y-3">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                🏡 이사할 집 진단 <span className="font-normal text-[11px] text-slate-400">— 후보 집이 좋은지 계약 전에 미리 확인</span>
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
                후보 집의 <b>좌향</b>과 <b>준공(건축) 연도</b>만 넣으면 그 집에 고착된 운의 반을 세워 판정합니다.
                <b> 현관 방위</b>와 <b>입주 예정 해</b>는 선택 — 넣으면 기운의 입구(현관) 길흉과 그 해의 흉성 방위(이사 시기)까지 함께 점검합니다.
                후보 집에 방문했다면 &lsquo;우리집 진단&rsquo; 메뉴의 STEP 1로 좌향을 실측한 뒤 아래 &lsquo;실측값 가져오기&rsquo;를 누르는 것이 가장 정확합니다.
            </p>

            {/* 입력 — 좌향 · 준공 연도 · 입주 예정 해 */}
            <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                <span>좌(坐)</span>
                <select value={sitting} onChange={(e) => setSitting(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                    {MOUNTAINS_24.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <Button onClick={useMeasured} variant="outline" className="h-8 rounded-full text-xs">🧭 실측값 가져오기</Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                <span>준공(건축) 연도</span>
                <input type="number" value={builtIn} placeholder="예: 1995" min={1864} max={2100}
                    onChange={(e) => setBuiltIn(e.target.value)}
                    className="w-24 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                {builtYear != null && <span className="text-xs text-[#bf953f] font-semibold">{periodOf(builtYear)}운 건물</span>}
                <span>입주 예정<span className="text-[10px] text-slate-400">(선택)</span></span>
                <input type="number" value={yearIn} placeholder={`예: ${nowYear}`} min={1900} max={2100}
                    onChange={(e) => setYearIn(e.target.value)}
                    className="w-24 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                {moveYear != null
                    ? <span className="text-xs text-slate-400">그 해 흉성 방위까지 점검</span>
                    : <span className="text-xs text-slate-400">비우면 올해({nowYear}) 운 기준</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                <span>현관 방위<span className="text-[10px] text-slate-400">(선택)</span></span>
                <select value={ent} onChange={(e) => setEnt(e.target.value as Palace | "")}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm">
                    <option value="">모름·선택 안 함</option>
                    {GUA8.map((p) => <option key={p} value={p}>{PALACE_DIR[p]}</option>)}
                </select>
                <span className="text-xs text-slate-400">집 중심에서 봤을 때 현관문이 있는 방위 — 기운의 입구(氣口)라 재물운 판정에 중요합니다</span>
            </div>
            <p className="text-[11px] text-slate-400">
                준공 연도 = 건물이 완성된(지붕이 덮인) 해. 뼈대만 남기고 대수리(리모델링)한 집은 공사가 끝난 해가 새 준공년입니다.
            </p>

            {/* 판정 결과 — 준공 연도를 넣어야 표시(임의 기본값으로 판정하지 않음) */}
            {builtYear == null ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3 text-center text-xs text-slate-400">
                    준공(건축) 연도를 입력하면 판정이 표시됩니다. 등기부등본·건축물대장이나 부동산 앱에서 확인할 수 있습니다.
                </div>
            ) : res && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-2xl">{res.emoji}</span>
                        <span className={"text-base font-bold " + res.cls}>{res.grade}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{res.label}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                            {res.builtPeriod}운 반 <b className="font-noto-serif text-slate-600 dark:text-slate-300">{sitting}山{res.facing}向</b> · {res.structure}
                            {res.builtPeriod !== res.curPeriod && <> · 현재 {res.curPeriod}운(실운)</>}
                        </span>
                    </div>
                    <ul className="space-y-1 text-xs leading-relaxed">
                        {res.notes.map((n, i) => (
                            <li key={i} className="flex gap-1.5">
                                <span className="shrink-0">{n.good ? "✅" : "⚠️"}</span>
                                <span className={n.good ? "text-slate-600 dark:text-slate-300" : "text-rose-600 dark:text-rose-400"}>{n.text}</span>
                            </li>
                        ))}
                    </ul>
                    {/* 방위 배치 힌트 — 현관·거실 창(향성 재물)과 침실(산성 건강), 5·2 회피 방위 */}
                    <div className="rounded-lg bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-2.5 space-y-1 text-xs">
                        <div className="font-bold text-slate-700 dark:text-slate-200">📋 이 집에서의 방위 체크 <span className="font-normal text-[10px] text-slate-400">(당운 {res.curPeriod}운 기준)</span></div>
                        <div className="flex items-start gap-1.5">
                            <span className="shrink-0 w-32 font-semibold text-slate-600 dark:text-slate-300">현관·거실 창 좋은 곳</span>
                            <span className="flex-1">{res.goodWater.length > 0 ? <b className="text-emerald-600 dark:text-emerald-400">{res.goodWater.join(" · ")}</b> : <span className="text-slate-400">뚜렷한 적방 없음</span>}<span className="text-slate-400"> — 재물 기운이 드나드는 방위</span></span>
                        </div>
                        <div className="flex items-start gap-1.5">
                            <span className="shrink-0 w-32 font-semibold text-slate-600 dark:text-slate-300">침실·안방 좋은 곳</span>
                            <span className="flex-1">{res.goodMountain.length > 0 ? <b className="text-emerald-600 dark:text-emerald-400">{res.goodMountain.join(" · ")}</b> : <span className="text-slate-400">뚜렷한 적방 없음</span>}<span className="text-slate-400"> — 건강·화목의 방위</span></span>
                        </div>
                        <div className="flex items-start gap-1.5">
                            <span className="shrink-0 w-32 font-semibold text-rose-600 dark:text-rose-400">현관·침실 피할 곳</span>
                            <span className="flex-1">{res.avoidDirs.length > 0 ? <b className="text-rose-600 dark:text-rose-400">{res.avoidDirs.join(" · ")}</b> : <span className="text-slate-400">없음</span>}<span className="text-slate-400"> — 향성·산성에 오황(5)·이흑(2)이 든 방위</span></span>
                        </div>
                        <p className="text-[10px] text-slate-400">현관·거실 큰 창이 좋은 방위에 있는 집이면 가점 요인입니다. 입주 후 세부 배치는 &lsquo;우리집 진단&rsquo; 메뉴에서 확인하세요.</p>
                    </div>
                </div>
            )}

            {/* 후보 저장 → 비교 */}
            <div className="flex items-center gap-2 flex-wrap">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: A아파트 102동"
                    className="w-36 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-xs" />
                <Button onClick={addCand} variant="outline" className="h-8 rounded-full text-xs">＋ 비교 목록에 담기</Button>
            </div>
            {cands.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left py-1 font-semibold">후보</th>
                                <th className="font-semibold">좌향</th>
                                <th className="font-semibold">준공(운)</th>
                                <th className="font-semibold">입주</th>
                                <th className="font-semibold">현관</th>
                                <th className="font-semibold">격국</th>
                                <th className="font-semibold">판정</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cands.map((c) => {
                                const v = diagnose(c.sitting, c.built, c.year, nowYear, (c.ent as Palace) || null, ming);
                                return (
                                    <tr key={c.name} className="border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                                        <td className="py-1.5 font-semibold text-left">{c.name}</td>
                                        <td className="text-center font-noto-serif">{c.sitting}山{v?.facing ?? ""}向</td>
                                        <td className="text-center">{c.built} ({v?.builtPeriod ?? "-"}운)</td>
                                        <td className="text-center">{c.year ?? "-"}</td>
                                        <td className="text-center">{c.ent ? PALACE_DIR[c.ent] : "-"}</td>
                                        <td className="text-center">{v?.structure ?? "-"}</td>
                                        <td className="text-center whitespace-nowrap">{v ? `${v.emoji} ${v.grade}` : "-"}</td>
                                        <td className="text-center">
                                            <button onClick={() => removeCand(c.name)} aria-label="삭제" className="text-slate-400 hover:text-rose-500">×</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed">
                ※ 좌향·준공 시기 기반의 골조 판정입니다. 실제 길흉은 주변 지형(도로·물·높은 건물)과 내부 구조를 함께 봐야 합니다.
                연초(입춘, 2월 4일경 이전) 입주 예정이면 입주 해는 전년도를 입력하세요. 운 기준은 유파에 따라 입주년으로 보는 견해도 있습니다.
            </p>
        </div>
    );
}
