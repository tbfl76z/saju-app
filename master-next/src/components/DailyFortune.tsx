"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnalyzeButtons } from "@/components/AnalyzeButtons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/useToast";

// 운세 카드 공통 형태 (서버는 snake_case 키로 응답)
interface FortuneCard {
    ganzhi: string;
    stem_ten_god: string;
    branch_ten_god: string;
    twelve_growth: string;
    sinsal: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    relations: any;
}

interface DailyFortuneProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sajuData: any;
    terms?: Record<string, string>;
    apiBase: string;
}

type PeriodKey = "total" | "daeun" | "year" | "month" | "today";
type CategoryKey = "love" | "wealth" | "career" | "health";

// 올해(세운) 분야별 운세 칩
const CATEGORIES: { key: CategoryKey | null; label: string; icon: string }[] = [
    { key: null, label: "종합", icon: "🎍" },
    { key: "love", label: "연애운", icon: "💕" },
    { key: "wealth", label: "금전운", icon: "💰" },
    { key: "career", label: "진로운", icon: "🧭" },
    { key: "health", label: "건강운", icon: "🌿" },
];

function getTodayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

function relStr(value: unknown): string {
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    if (typeof value === "string" && value.trim()) return value;
    return "-";
}

// 현재 나이에 해당하는 대운을 고른다 (없으면 첫 대운)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickCurrentDaeun(sajuData: any): any | null {
    const list = sajuData?.fortune?.list;
    if (!Array.isArray(list) || !list.length) return null;
    const birthYear = parseInt(sajuData?.birth_date?.split("-")?.[0]);
    if (!birthYear) return list[0];
    const age = new Date().getFullYear() - birthYear + 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return list.find((d: any) => age >= d.age && age < d.age + 10) ?? list[0];
}

export function DailyFortune({ sajuData, apiBase }: DailyFortuneProps) {
    const [today, setToday] = useState<FortuneCard | null>(null);
    const [month, setMonth] = useState<FortuneCard | null>(null);
    const [year, setYear] = useState<FortuneCard | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<PeriodKey>("year");
    const [category, setCategory] = useState<CategoryKey | null>(null);

    const lastDateRef = useRef<string>("");

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    // 오늘/이달/올해 운세를 한 번에 불러온다
    const fetchAll = useCallback(async () => {
        const p = sajuData?.pillars;
        if (!p?.day?.stem) return;
        setIsLoading(true);
        const common = { day_gan: p.day.stem, year_branch: p.year.branch, pillars: p, day_branch: p.day.branch };
        try {
            // /ilun 응답에 오늘 일진 + 이달(절기 기준) 월주가 함께 온다
            const [ilunRes, yearRes] = await Promise.all([
                fetch(`${apiBase}/ilun`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(common),
                }).then((r) => (r.ok ? r.json() : null)),
                fetch(`${apiBase}/newyear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ saju_data: sajuData, target_year: curYear }),
                }).then((r) => (r.ok ? r.json() : null)),
            ]);

            setToday(ilunRes);
            setMonth(ilunRes?.month ?? null);  // 절기 기준 이달 월주
            setYear(yearRes);
            lastDateRef.current = getTodayISO();
        } catch (e) {
            console.error(e);
            notify.error("운세를 불러오지 못했습니다", "잠시 후 다시 시도해 주세요.");
        } finally {
            setIsLoading(false);
        }
    }, [apiBase, sajuData, curYear, curMonth]);

    useEffect(() => {
        lastDateRef.current = getTodayISO();
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        const check = () => {
            const t = getTodayISO();
            if (t !== lastDateRef.current) {
                lastDateRef.current = t;
                fetchAll();
            }
        };
        const timer = window.setInterval(check, 60_000);
        document.addEventListener("visibilitychange", check);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", check);
        };
    }, [fetchAll]);

    // '전체' 카드 = 원국 일주(본인)
    const dayP = sajuData?.pillars?.day;
    const totalCard: FortuneCard | null = dayP
        ? {
            ganzhi: dayP.pillar,
            stem_ten_god: "본인",
            branch_ten_god: sajuData?.jiji_ten_gods?.day || "-",
            twelve_growth: sajuData?.twelve_growth?.day || "-",
            sinsal: sajuData?.sinsal?.day || "-",
            relations: sajuData?.sinsal_details?.day?.relations || "-",
        }
        : null;

    // '대운' 카드 = 현재 나이 대운 (대운은 jiji_ten_god 키 사용)
    const daeun = pickCurrentDaeun(sajuData);
    const daeunCard: FortuneCard | null = daeun
        ? {
            ganzhi: daeun.ganzhi,
            stem_ten_god: daeun.stem_ten_god,
            branch_ten_god: daeun.jiji_ten_god ?? daeun.branch_ten_god ?? "-",
            twelve_growth: daeun.twelve_growth,
            sinsal: daeun.sinsal || "-",
            relations: daeun.relations || "-",
        }
        : null;

    // 기간별 메타 (위계순: 전체 → 대운 → 올해 → 이달 → 오늘)
    const periods: { key: PeriodKey; label: string; chip: string; data: FortuneCard | null; title: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: any }[] = [
        {
            key: "total", label: "전체", chip: "전체", data: totalCard, title: "나의 전체 운세",
            body: { saju_data: sajuData, analysis_type: "total", query: "타고난 사주 전체를 깊이 있게 풀이" },
        },
        {
            key: "daeun", label: daeun ? `${daeun.age}세 대운` : "대운", chip: "대운", data: daeunCard, title: "대운 흐름",
            body: { saju_data: sajuData, analysis_type: "daeun", query: `${daeun?.age ?? ""}세 대운 분석`, period_ganzhi: daeun?.ganzhi, period_label: daeun ? `${daeun.age}세 대운` : undefined },
        },
        {
            key: "year", label: `${curYear}년`, chip: "올해", data: year, title: "올해의 운세",
            body: { saju_data: sajuData, analysis_type: "newyear", target_year: curYear, query: `${curYear}년 신년운세` },
        },
        {
            key: "month", label: `${curMonth}월`, chip: "이달", data: month, title: "이달의 운세",
            body: { saju_data: sajuData, analysis_type: "wolun", query: `${curYear}년 ${curMonth}월 월운 분석`, period_ganzhi: month?.ganzhi, period_label: `${curYear}년 ${curMonth}월(절기 기준 ${month?.ganzhi ?? ""})` },
        },
        {
            key: "today", label: "오늘", chip: "오늘", data: today, title: "오늘의 운세",
            body: { saju_data: sajuData, analysis_type: "today", query: `${getTodayISO()} 일진 분석` },
        },
    ];

    const active = periods.find((p) => p.key === selected) ?? periods[0];

    // 올해 + 분야 선택 시 category 주입 (그 외엔 종합)
    const cat = selected === "year" ? category : null;
    const catMeta = CATEGORIES.find((c) => c.key === cat);
    const activeBody = cat
        ? { ...active.body, category: cat, query: `${curYear}년 ${catMeta?.label} 분석` }
        : active.body;
    const activeTitle = cat ? `올해의 ${catMeta?.label}` : active.title;

    return (
        <section className="fade-up">
            <h3 className="section-title text-lg md:text-xl mb-6">
                <span>🔮 나의 운세 — 전체 · 대운 · 올해 · 이달 · 오늘</span>
            </h3>

            {isLoading ? (
                <div className="max-w-2xl space-y-3">
                    <Skeleton className="h-14 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
                    <Skeleton className="h-20 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
                </div>
            ) : (
                <div className="max-w-2xl space-y-3">
                    {/* 한 줄 기간 선택 바 (모바일 포함 항상 5칸 한 줄) */}
                    <div className="grid grid-cols-5 gap-1.5">
                        {periods.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => p.data && setSelected(p.key)}
                                disabled={!p.data}
                                className={cn(
                                    "rounded-xl border px-1 py-2 flex flex-col items-center gap-0.5 transition-all",
                                    selected === p.key
                                        ? "border-[#d4af37] bg-[#d4af37]/15 ring-1 ring-[#d4af37]"
                                        : "border-[#d4af37]/25 bg-white/60 dark:bg-slate-800/40 hover:bg-[#d4af37]/10",
                                    !p.data && "opacity-40"
                                )}
                            >
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{p.chip}</span>
                                <span className={cn(
                                    "text-base font-bold font-noto-serif leading-none",
                                    selected === p.key ? "text-[#bf953f] dark:text-[#e6c35c]" : "text-slate-800 dark:text-slate-100"
                                )}>
                                    {p.data?.ganzhi ?? "-"}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* 선택한 기간의 상세 (슬림 한 장) */}
                    {active.data && (
                        <div className="rounded-2xl border border-[#d4af37]/30 bg-white/70 dark:bg-slate-800/50 px-4 py-3 text-sm">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-bold text-[#bf953f] dark:text-[#e6c35c]">{active.label}</span>
                                <span className="text-lg font-bold font-noto-serif text-slate-900 dark:text-slate-50">{active.data.ganzhi}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                                <span><b className="text-slate-400 dark:text-slate-500 font-semibold mr-1">십성</b>{active.data.stem_ten_god} · {active.data.branch_ten_god}</span>
                                <span><b className="text-slate-400 dark:text-slate-500 font-semibold mr-1">12운성</b>{active.data.twelve_growth}</span>
                                <span><b className="text-slate-400 dark:text-slate-500 font-semibold mr-1">신살</b>{active.data.sinsal || "-"}</span>
                                <span><b className="text-slate-400 dark:text-slate-500 font-semibold mr-1">관계</b>{relStr(active.data.relations)}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 올해 선택 시: 분야별 운세 칩 (연애/금전/진로/건강) */}
            {selected === "year" && (
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                    {CATEGORIES.map((c) => (
                        <button
                            key={c.label}
                            type="button"
                            onClick={() => setCategory(c.key)}
                            className={cn(
                                "rounded-full px-4 py-1.5 text-sm font-semibold border transition-all",
                                cat === c.key
                                    ? "bg-[#d4af37]/15 ring-1 ring-[#d4af37] text-[#bf953f] dark:text-[#e6c35c] border-[#d4af37]"
                                    : "bg-white/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-[#d4af37]/30 hover:bg-[#d4af37]/10"
                            )}
                        >
                            {c.icon} {c.label}
                        </button>
                    ))}
                </div>
            )}

            {/* 선택한 기간(+분야)의 AI 풀이 */}
            <p className="mt-6 mb-3 text-center text-sm text-slate-500 dark:text-slate-400">
                <span className="font-bold text-[#bf953f] dark:text-[#e6c35c]">{activeTitle}</span>를 AI로 풀어보세요
            </p>
            <AnalyzeButtons key={`${selected}-${cat ?? ""}`} apiBase={apiBase} body={activeBody} title={activeTitle} />
        </section>
    );
}

export default DailyFortune;
