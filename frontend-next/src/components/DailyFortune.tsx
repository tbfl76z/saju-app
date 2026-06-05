"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuckCard } from "@/components/LuckCard";
import { AnalyzeButtons } from "@/components/AnalyzeButtons";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/useToast";

// 일진 응답 타입 (서버는 snake_case 키로 응답)
interface IlunResponse {
    ganzhi: string;
    stem_ten_god: string;
    branch_ten_god: string;
    twelve_growth: string;
    sinsal: string;
    relations: string;
    date: string;
}

interface DailyFortuneProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sajuData: any;
    terms?: Record<string, string>;
    apiBase: string;
}

// 표준 JS 날짜 객체로 오늘 날짜를 YYYY-MM-DD로 구한다
function getTodayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

export function DailyFortune({ sajuData, apiBase }: DailyFortuneProps) {
    // 일진 데이터 / 로딩 상태
    const [ilun, setIlun] = useState<IlunResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // 자정 갱신 비교용으로 마지막 요청 날짜를 기억한다
    const lastDateRef = useRef<string>("");

    // /ilun 호출 — AI 한마디와 분리되어 독립 동작한다
    const fetchIlun = useCallback(async () => {
        if (!sajuData?.pillars?.day?.stem) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${apiBase}/ilun`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    day_gan: sajuData.pillars.day.stem,
                    year_branch: sajuData.pillars.year.branch,
                    pillars: sajuData.pillars,
                    day_branch: sajuData.pillars.day.branch,
                    // target_date 생략 → 서버가 오늘 날짜 사용
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: IlunResponse = await res.json();
            setIlun(data);
            // 응답에 날짜가 있으면 그 값을, 없으면 현재 날짜를 기준값으로 저장한다
            lastDateRef.current = data.date?.slice(0, 10) || getTodayISO();
        } catch (e) {
            notify.error("오늘의 운세를 불러오지 못했습니다", "잠시 후 다시 시도해 주세요.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [apiBase, sajuData]);

    // 마운트 및 sajuData 변경 시 재요청
    useEffect(() => {
        lastDateRef.current = getTodayISO();
        fetchIlun();
    }, [fetchIlun]);

    // 자정 자동 갱신 + 탭 복귀 시 갱신
    useEffect(() => {
        // 현재 날짜가 직전 값과 다르면 재요청한다
        const checkAndRefresh = () => {
            const now = getTodayISO();
            if (now !== lastDateRef.current) {
                lastDateRef.current = now;
                fetchIlun();
            }
        };

        // 1분마다 날짜 변경 감지
        const timer = window.setInterval(checkAndRefresh, 60_000);
        // 백그라운드에서 돌아왔을 때도 확인
        document.addEventListener("visibilitychange", checkAndRefresh);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", checkAndRefresh);
        };
    }, [fetchIlun]);

    return (
        <section className="fade-up">
            {/* 섹션 제목 — LuckSection 헤더 톤 차용 */}
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif text-slate-900 dark:text-slate-100">
                <span className="border-b-2 border-[#d4af37]/30 pb-1">🌅 오늘의 운세</span>
            </h3>

            {/* 일진 카드 1장 (단일 카드라 max-w-xs) */}
            <div className="max-w-xs">
                {isLoading ? (
                    <Skeleton className="h-40 w-full rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
                ) : ilun ? (
                    <LuckCard
                        header={ilun.date || "오늘"}
                        ganzhi={ilun.ganzhi}
                        stemTenGod={ilun.stem_ten_god}
                        branchTenGod={ilun.branch_ten_god}
                        growth={ilun.twelve_growth}
                        sinsal={ilun.sinsal}
                        relations={ilun.relations}
                    />
                ) : (
                    <div className="rounded-2xl border border-[#d4af37]/20 bg-white/60 dark:bg-slate-800/40 p-4 text-center text-sm text-muted-foreground">
                        일진 정보를 표시할 수 없습니다.
                    </div>
                )}
            </div>

            {/* AI 오늘의 한마디 — 쉬운 설명 / 고급 풀이 */}
            <AnalyzeButtons
                apiBase={apiBase}
                className="mt-8"
                body={{ saju_data: sajuData, analysis_type: "today", query: `${getTodayISO()} 일진 분석` }}
            />
        </section>
    );
}

export default DailyFortune;
