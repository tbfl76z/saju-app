"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/useToast";
import { starChart, periodOf, annualChart, MOUNTAIN_INFO, starMood, type StarChart, type Palace } from "@/lib/flyingStars";
import { mingGua, type Trigram } from "@/lib/eightMansions";

// 이사할 집 진단 — 후보 집의 좌향과 입주 예정 해만으로
// ① 격국(왕산왕향~상산하수) ② 입주 해 연자백 흉성 ③ 동서사택 궁합을 점검해
// 좋은 집인지 등급(🟢추천~🔴재고)으로 판정한다. 계산은 검증된 flyingStars 엔진만 사용.

const EAST_TRIGRAMS: Trigram[] = ["坎", "離", "震", "巽"];
const MOUNTAINS_24 = Object.keys(MOUNTAIN_INFO);
const PALACE_DIR: Record<string, string> = {
    坎: "북", 艮: "북동", 震: "동", 巽: "남동", 離: "남", 坤: "남서", 兌: "서", 乾: "북서",
};

interface Candidate { name: string; sitting: string; year: number }
const CAND_KEY = "destiny-hyeongong-candidates";
function loadCands(): Candidate[] {
    try {
        const raw = window.localStorage.getItem(CAND_KEY);
        const p = raw ? JSON.parse(raw) : [];
        return Array.isArray(p) ? p : [];
    } catch { return []; }
}
function saveCands(list: Candidate[]) {
    try { window.localStorage.setItem(CAND_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* 무시 */ }
}

interface Note { good: boolean; text: string }
interface Verdict {
    grade: string; label: string; emoji: string; cls: string;
    structure: string; period: number; facing: string; notes: Note[];
}

function diagnose(sitting: string, moveYear: number, ming: Trigram | null): Verdict | null {
    let chart: StarChart;
    try { chart = starChart(sitting, periodOf(moveYear)); } catch { return null; }
    const notes: Note[] = [];
    let score = 0;

    // ① 격국 — 판의 골조(가장 큰 비중)
    const st = chart.structure;
    if (st === "왕산왕향") {
        score += 2;
        notes.push({ good: true, text: "왕산왕향 — 사람 운(산성)과 재물 운(향성)이 모두 제자리에 든 가장 좋은 격국입니다." });
    } else if (st === "쌍성회향") {
        score += 1;
        notes.push({ good: true, text: "쌍성회향 — 재물 운이 우세한 집입니다. 정면(향)이 도로·마당 등으로 트여 있으면 더 좋습니다." });
    } else if (st === "쌍성회좌") {
        score += 1;
        notes.push({ good: true, text: "쌍성회좌 — 건강·인간관계 운이 우세한 집입니다. 뒤(좌)가 든든히 받쳐주면 좋고, 재물 운은 보통입니다." });
    } else if (st === "상산하수") {
        score -= 2;
        notes.push({ good: false, text: "상산하수 — 산과 물이 뒤바뀐 흉국입니다. 가급적 피하고, 부득이하면 전문가의 비보(보완)가 필요합니다." });
    } else {
        notes.push({ good: true, text: "평국 — 뚜렷한 길흉이 없는 무난한 판입니다. 방 배치로 좋은 방위를 살려 쓰면 됩니다." });
    }

    const sitPal = MOUNTAIN_INFO[sitting].palace;
    const facePal = MOUNTAIN_INFO[chart.facing].palace;

    // ② 정면(향) 방위의 재물 기운 — 격국이 이미 회향·왕향이면 중복이라 생략
    if (st !== "왕산왕향" && st !== "쌍성회향") {
        const wm = starMood(chart.water[facePal], chart.period);
        if (wm === "왕기" || wm === "생기") {
            score += 0.5;
            notes.push({ good: true, text: `정면(向·${PALACE_DIR[facePal]}) 방위에 재물 기운(향성 ${chart.water[facePal]})이 살아 있습니다.` });
        }
    }

    // ③ 입주 예정 해의 연자백 — 좌·향 방위에 오황/이흑이 들면 감점
    const annual = annualChart(moveYear);
    const bad = (n: number) => n === 5 || n === 2;
    const hitFace = bad(annual[facePal as Palace]);
    const hitSit = bad(annual[sitPal as Palace]);
    if (hitFace || hitSit) {
        score -= 1;
        const where = [hitFace ? `정면(向·${PALACE_DIR[facePal]})` : "", hitSit ? `뒤(坐·${PALACE_DIR[sitPal]})` : ""].filter(Boolean).join("과 ");
        notes.push({ good: false, text: `입주 예정 해(${moveYear})의 연자백 흉성(오황·이흑)이 집의 ${where} 방위에 듭니다. 입주 시기를 한 해 조정하거나, 그 해 해당 방위의 공사·현관 교체를 피하세요.` });
    } else {
        notes.push({ good: true, text: `입주 예정 해(${moveYear})의 연자백 흉성(오황·이흑)이 좌·향 방위를 비켜갑니다.` });
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

    const g = score >= 2 ? { grade: "추천", label: "좋은 집입니다", emoji: "🟢", cls: "text-emerald-600 dark:text-emerald-400" }
        : score >= 1 ? { grade: "무난", label: "괜찮은 집입니다 — 아래 확인 사항을 보세요", emoji: "🟡", cls: "text-[#bf953f]" }
            : score >= 0 ? { grade: "보통", label: "무난하지만 배치로 보완이 필요합니다", emoji: "🟠", cls: "text-orange-500" }
                : { grade: "재고", label: "권하지 않는 집입니다", emoji: "🔴", cls: "text-rose-500" };
    return { ...g, structure: st, period: chart.period, facing: chart.facing, notes };
}

interface Props {
    birthYear?: number;
    gender?: "male" | "female";
    /** STEP 1에서 실측·선택된 현재 좌산 — '측정값 가져오기'에 사용 */
    currentSitting?: string;
    currentDeg?: number | null;
}

export default function MoveCheckView({ birthYear, gender, currentSitting, currentDeg }: Props) {
    const nowYear = new Date().getFullYear();
    const [sitting, setSitting] = useState("子");
    const [year, setYear] = useState(nowYear);
    const [name, setName] = useState("");
    const [cands, setCands] = useState<Candidate[]>([]);
    useEffect(() => { setCands(loadCands()); }, []);

    const ming: Trigram | null = useMemo(() => {
        if (!birthYear || !gender) return null;
        try { return mingGua(birthYear, gender); } catch { return null; }
    }, [birthYear, gender]);

    const res = useMemo(() => diagnose(sitting, year, ming), [sitting, year, ming]);

    const useMeasured = () => {
        if (!currentSitting || !MOUNTAIN_INFO[currentSitting]) return;
        setSitting(currentSitting);
        notify.success(
            `STEP 1 좌향 가져옴: ${currentSitting}坐` + (currentDeg != null ? ` (실측 ${currentDeg.toFixed(1)}°)` : ""),
            "후보 집 현장에서 실측한 값이면 가장 정확합니다."
        );
    };

    const addCand = () => {
        const nm = name.trim() || `${sitting}坐 ${year}`;
        const next = [{ name: nm, sitting, year }, ...cands.filter((c) => c.name !== nm)].slice(0, 8);
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
                후보 집의 <b>좌향</b>과 <b>입주 예정 해</b>만 넣으면 격국·그 해의 흉성 방위·나와의 궁합을 따져 판정합니다.
                후보 집에 방문했다면 위 STEP 1로 좌향을 실측한 뒤 아래 &lsquo;측정값 가져오기&rsquo;를 누르는 것이 가장 정확합니다.
            </p>

            {/* 입력 — 좌향 · 입주 예정 해 */}
            <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                <span>좌(坐)</span>
                <select value={sitting} onChange={(e) => setSitting(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                    {MOUNTAINS_24.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <Button onClick={useMeasured} variant="outline" className="h-8 rounded-full text-xs">🧭 STEP 1 측정값 가져오기</Button>
                <span>입주 예정</span>
                <input type="number" value={year} min={1900} max={2100}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-20 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                <span className="text-xs text-slate-400">년 · {periodOf(year)}운 기준</span>
            </div>

            {/* 판정 결과 */}
            {res && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-2xl">{res.emoji}</span>
                        <span className={"text-base font-bold " + res.cls}>{res.grade}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{res.label}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                            {res.period}운 <b className="font-noto-serif text-slate-600 dark:text-slate-300">{sitting}山{res.facing}向</b> · {res.structure}
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
                                <th className="font-semibold">입주(운)</th>
                                <th className="font-semibold">격국</th>
                                <th className="font-semibold">판정</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cands.map((c) => {
                                const v = diagnose(c.sitting, c.year, ming);
                                return (
                                    <tr key={c.name} className="border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                                        <td className="py-1.5 font-semibold text-left">{c.name}</td>
                                        <td className="text-center font-noto-serif">{c.sitting}山{v?.facing ?? ""}向</td>
                                        <td className="text-center">{c.year} ({v?.period ?? "-"}운)</td>
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
                ※ 좌향·입주 시기 기반의 골조 판정입니다. 실제 길흉은 주변 지형(도로·물·높은 건물)과 내부 구조를 함께 봐야 합니다.
                연초(입춘, 2월 4일경 이전) 입주 예정이면 전년도를 입력하세요.
            </p>
        </div>
    );
}
