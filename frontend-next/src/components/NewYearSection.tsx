"use client";

import { useState, useEffect, useCallback } from "react";
import { LuckCard } from "@/components/LuckCard";
import { AnalyzeButtons } from "@/components/AnalyzeButtons";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/useToast";

// 신년 종합 운세 섹션 props 타입
interface NewYearSectionProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sajuData: any;
    terms: Record<string, string>;
    apiBase: string;
}

// 세운(신년) 명식 응답 타입
interface NewYearResult {
    ganzhi: string;
    stem_ten_god: string;
    branch_ten_god: string;
    twelve_growth: string;
    sinsal: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    relations: any;
    year: number;
}

// 선택 가능한 연도 목록 (2024~2030)
const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
// 오늘(2026-06-05) 기준 기본 연도
const DEFAULT_YEAR = 2026;

export function NewYearSection({ sajuData, apiBase }: NewYearSectionProps) {
    const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_YEAR);
    const [result, setResult] = useState<NewYearResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // relations 값을 문자열로 정규화 (배열/문자열 모두 대응)
    const formatRelations = useCallback((value: unknown): string => {
        if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
        if (typeof value === "string" && value.trim()) return value;
        return "-";
    }, []);

    // 선택 연도 세운 명식 조회
    const fetchNewYear = useCallback(
        async (year: number) => {
            setIsLoading(true);
            setResult(null);
            try {
                const res = await fetch(`${apiBase}/newyear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ saju_data: sajuData, target_year: year }),
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `요청 실패 (상태 ${res.status})`);
                }
                const data: NewYearResult = await res.json();
                setResult(data);
            } catch (err) {
                console.error("신년 운세 조회 실패", err);
                notify.error("신년 운세 조회 실패", "잠시 후 다시 시도해 주세요.");
            } finally {
                setIsLoading(false);
            }
        },
        [apiBase, sajuData]
    );

    // 마운트 시 기본 연도로 1회 자동 조회
    useEffect(() => {
        if (sajuData) {
            fetchNewYear(DEFAULT_YEAR);
        }
    }, [sajuData, fetchNewYear]);

    // 연도 선택 핸들러
    const handleYearChange = (value: string) => {
        const year = parseInt(value, 10);
        setSelectedYear(year);
        fetchNewYear(year);
    };

    return (
        <section className="fade-up space-y-8">
            {/* 섹션 제목 (LuckSection 헤더 톤) */}
            <h3 className="section-title text-lg md:text-xl">
                <span className="text-2xl">🎍</span>
                <span className="border-b-2 border-[#d4af37]/30 dark:border-[#d4af37]/40 pb-1">
                    신년 종합 운세
                </span>
            </h3>

            {/* 연도 선택 */}
            <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600 dark:text-slate-400">연도 선택</span>
                <Select value={String(selectedYear)} onValueChange={handleYearChange}>
                    <SelectTrigger className="w-32 rounded-2xl border-[#d4af37]/30 dark:border-[#d4af37]/40 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                        <SelectValue placeholder="연도" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-[#d4af37]/30 dark:border-[#d4af37]/40">
                        {YEAR_OPTIONS.map((year) => (
                            <SelectItem key={year} value={String(year)}>
                                {year}년
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* 세운 명식 카드 */}
            {isLoading ? (
                <Skeleton className="h-44 max-w-xs rounded-2xl dark:bg-slate-800" />
            ) : result ? (
                <div className="max-w-xs">
                    <LuckCard
                        header={`${result.year}년`}
                        ganzhi={result.ganzhi}
                        stemTenGod={result.stem_ten_god}
                        branchTenGod={result.branch_ten_god}
                        growth={result.twelve_growth}
                        sinsal={result.sinsal || "-"}
                        relations={formatRelations(result.relations)}
                    />
                </div>
            ) : null}

            {/* AI 신년운세 — 쉬운 설명 / 고급 풀이 */}
            {result && (
                <AnalyzeButtons
                    apiBase={apiBase}
                    title={`${selectedYear}년 신년운세`}
                    body={{ saju_data: sajuData, analysis_type: "newyear", target_year: selectedYear, query: `${selectedYear}년 신년운세` }}
                />
            )}
        </section>
    );
}
