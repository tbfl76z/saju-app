"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuckCard } from "@/components/LuckCard";
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
    const periods: { key: PeriodKey; label: string; data: FortuneCard | null; title: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: any }[] = [
        {
            key: "total", label: "전체", data: totalCard, title: "나의 전체 운세",
            body: { saju_data: sajuData, analysis_type: "total", query: "타고난 사주 전체를 깊이 있게 풀이" },
        },
        {
            key: "daeun", label: daeun ? `${daeun.age}세 대운` : "대운", data: daeunCard, title: "대운 흐름",
            body: { saju_data: sajuData, analysis_type: "daeun", query: `${daeun?.age ?? ""}세 대운 분석` },
        },
        {
            key: "year", label: `${curYear}년`, data: year, title: "올해의 운세",
            body: { saju_data: sajuData, analysis_type: "newyear", target_year: curYear, query: `${curYear}년 신년운세` },
        },
        {
            key: "month", label: `${curMonth}월`, data: month, title: "이달의 운세",
            body: { saju_data: sajuData, analysis_type: "wolun", query: `${curYear}년 ${curMonth}월 월운 분석` },
        },
        {
            key: "today", label: "오늘", data: today, title: "오늘의 운세",
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
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif text-slate-900 dark:text-slate-100">
                <span className="border-b-2 border-[#d4af37]/30 pb-1">🔮 나의 운세 — 전체 · 대운 · 올해 · 이달 · 오늘</span>
            </h3>

            {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3 max-w-4xl">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-40 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3 max-w-4xl">
                    {periods.map((p) => (
                        <div key={p.key}>
                            <div className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{p.label}</div>
                            {p.data ? (
                                <LuckCard
                                    header={p.label}
                                    ganzhi={p.data.ganzhi}
                                    stemTenGod={p.data.stem_ten_god}
                                    branchTenGod={p.data.branch_ten_god}
                                    growth={p.data.twelve_growth}
                                    sinsal={p.data.sinsal || "-"}
                                    relations={relStr(p.data.relations)}
                                    isSelected={selected === p.key}
                                    onClick={() => setSelected(p.key)}
                                />
                            ) : (
                                <div className="rounded-2xl border border-[#d4af37]/20 bg-white/60 dark:bg-slate-800/40 p-4 text-center text-xs text-muted-foreground h-full flex items-center justify-center">
                                    정보 없음
                                </div>
                            )}
                        </div>
                    ))}
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
