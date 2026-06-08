"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuckCard } from "@/components/LuckCard";
import { AnalyzeButtons } from "@/components/AnalyzeButtons";
import { Skeleton } from "@/components/ui/skeleton";
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

type PeriodKey = "total" | "today" | "month" | "year";

// 표준 JS 날짜 객체로 오늘 날짜를 YYYY-MM-DD로 구한다
function getTodayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

// relations 값을 카드용 문자열로 정규화
function relStr(value: unknown): string {
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    if (typeof value === "string" && value.trim()) return value;
    return "-";
}

export function DailyFortune({ sajuData, apiBase }: DailyFortuneProps) {
    const [today, setToday] = useState<FortuneCard | null>(null);
    const [month, setMonth] = useState<FortuneCard | null>(null);
    const [year, setYear] = useState<FortuneCard | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<PeriodKey>("total");

    // 자정 갱신 비교용
    const lastDateRef = useRef<string>("");

    // 현재 연/월 (클라이언트 기준)
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
            // 1) 오늘 일진
            const ilunReq = fetch(`${apiBase}/ilun`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(common),
            }).then((r) => (r.ok ? r.json() : null));

            // 2) 올해 세운 (ganzhi = 올해 연주 → 이달 월운 계산에도 사용)
            const yearRes = await fetch(`${apiBase}/newyear`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ saju_data: sajuData, target_year: curYear }),
            }).then((r) => (r.ok ? r.json() : null));

            // 3) 이달 월운 (올해 연주 기준 12개월 중 이번 달)
            let monthRes: FortuneCard | null = null;
            if (yearRes?.ganzhi) {
                const list = await fetch(`${apiBase}/wolun`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...common, year_pillar: yearRes.ganzhi }),
                }).then((r) => (r.ok ? r.json() : null));
                if (Array.isArray(list)) monthRes = list[curMonth - 1] ?? null;
            }

            const ilunRes = await ilunReq;
            setToday(ilunRes);
            setYear(yearRes);
            setMonth(monthRes);
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

    // 자정 경과 / 탭 복귀 시 갱신
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

    // '전체' 카드는 원국 일주(본인)를 대표로 표시 (별도 호출 없이 명식에서 구성)
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

    // 기간별 메타 (라벨 / 카드데이터 / 분석 요청)
    const periods: { key: PeriodKey; label: string; data: FortuneCard | null; title: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: any }[] = [
        {
            key: "total", label: "전체", data: totalCard, title: "나의 전체 운세",
            body: { saju_data: sajuData, analysis_type: "total", query: "타고난 사주 전체를 깊이 있게 풀이" },
        },
        {
            key: "today", label: "오늘", data: today, title: "오늘의 운세",
            body: { saju_data: sajuData, analysis_type: "today", query: `${getTodayISO()} 일진 분석` },
        },
        {
            key: "month", label: `${curMonth}월`, data: month, title: "이달의 운세",
            body: { saju_data: sajuData, analysis_type: "wolun", query: `${curYear}년 ${curMonth}월 월운 분석` },
        },
        {
            key: "year", label: `${curYear}년`, data: year, title: "올해의 운세",
            body: { saju_data: sajuData, analysis_type: "newyear", target_year: curYear, query: `${curYear}년 신년운세` },
        },
    ];

    const active = periods.find((p) => p.key === selected) ?? periods[0];

    return (
        <section className="fade-up">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif text-slate-900 dark:text-slate-100">
                <span className="border-b-2 border-[#d4af37]/30 pb-1">🔮 나의 운세 — 전체 · 오늘 · 이달 · 올해</span>
            </h3>

            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 max-w-3xl">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-40 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 max-w-3xl">
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

            {/* 선택한 기간의 AI 풀이 (쉬운 설명 / 고급 풀이) */}
            <p className="mt-6 mb-3 text-center text-sm text-slate-500 dark:text-slate-400">
                <span className="font-bold text-[#bf953f] dark:text-[#e6c35c]">{active.title}</span>를 AI로 풀어보세요
            </p>
            <AnalyzeButtons key={selected} apiBase={apiBase} body={active.body} title={active.title} />
        </section>
    );
}

export default DailyFortune;
