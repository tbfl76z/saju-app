"use client";

import { useState, useEffect, useCallback } from "react";
import { LuckCard } from "./LuckCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyzeButtons } from "@/components/AnalyzeButtons";

interface LuckSectionProps {
    sajuData: any;
    terms?: any;
    apiBase: string;
}

export function LuckSection({ sajuData, apiBase }: LuckSectionProps) {
    const [selectedDaeun, setSelectedDaeun] = useState<any>(null);
    const [seyunList, setSeyunList] = useState<any[]>([]);
    const [selectedSeyun, setSelectedSeyun] = useState<any>(null);
    const [wolunList, setWolunList] = useState<any[]>([]);
    const [isLoadingSeyun, setIsLoadingSeyun] = useState(false);
    const [isLoadingWolun, setIsLoadingWolun] = useState(false);
    const [selectedWolun, setSelectedWolun] = useState<any>(null);

    // handleSeyunSelect를 handleDaeunSelect보다 먼저 선언하여 참조 에러 방지
    const handleSeyunSelect = useCallback(async (seyun: any) => {
        setSelectedSeyun(seyun);
        setSelectedWolun(null);
        setIsLoadingWolun(true);
        try {
            const res = await fetch(`${apiBase}/wolun`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    day_gan: sajuData.pillars.day.stem,
                    year_branch: sajuData.pillars.year.branch,
                    year_pillar: seyun.ganzhi,
                    pillars: sajuData.pillars,
                    day_branch: sajuData.pillars.day.branch
                }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `Wolun request failed with status ${res.status}`);
            }
            const data = await res.json();
            if (!Array.isArray(data)) {
                throw new Error("Invalid wolun response");
            }
            setWolunList(data);
        } catch (err) {
            console.error("Failed to fetch Wolun", err);
            setWolunList([]);
        } finally {
            setIsLoadingWolun(false);
        }
    }, [apiBase, sajuData]);

    const handleDaeunSelect = useCallback(async (daeun: any) => {
        setSelectedDaeun(daeun);
        setSelectedSeyun(null);
        setSelectedWolun(null);
        setWolunList([]);

        setIsLoadingSeyun(true);
        try {
            const birthYear = parseInt(sajuData.birth_date.split("-")[0]);
            const startYear = birthYear + daeun.age - 1;

            const res = await fetch(`${apiBase}/seyun`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    day_gan: sajuData.pillars.day.stem,
                    year_branch: sajuData.pillars.year.branch,
                    start_year: startYear,
                    pillars: sajuData.pillars,
                    day_branch: sajuData.pillars.day.branch
                }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `Seyun request failed with status ${res.status}`);
            }
            const data = await res.json();
            if (!Array.isArray(data)) {
                throw new Error("Invalid seyun response");
            }
            setSeyunList(data);

            const nowYear = new Date().getFullYear();
            const currentSeyun = data.find((s: any) => s.year === nowYear);
            if (currentSeyun) {
                handleSeyunSelect(currentSeyun);
            }
        } catch (err) {
            console.error("Failed to fetch Seyun", err);
            setSeyunList([]);
        } finally {
            setIsLoadingSeyun(false);
        }
    }, [apiBase, sajuData, handleSeyunSelect]);

    const handleWolunSelect = (wolun: any) => {
        setSelectedWolun(wolun);
    };

    // 초기 대운 선택 (현재 나이에 맞는 대운)
    useEffect(() => {
        if (sajuData?.fortune?.list?.length > 0) {
            try {
                const birthYearStr = sajuData.birth_date?.split("-")?.[0];
                if (!birthYearStr) return;
                const birthYear = parseInt(birthYearStr);
                const nowYear = new Date().getFullYear();
                const age = nowYear - birthYear + 1;

                const current = sajuData.fortune.list.find((d: any) => age >= d.age && age < d.age + 10);
                if (current) {
                    handleDaeunSelect(current);
                }
            } catch (err) {
                console.error("Error in automatic daeun selection", err);
            }
        }
    }, [sajuData, handleDaeunSelect]);

    return (
        <div className="space-y-12">
            <section className="fade-up">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif">
                    <span className="text-2xl">⏳</span>
                    <span className="border-b-2 border-[#d4af37]/30 pb-1">대운(大運) 흐름</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {sajuData?.fortune?.list?.map((d: any, idx: number) => (
                        <LuckCard
                            key={idx}
                            header={`${d.age}세`}
                            ganzhi={d.ganzhi}
                            stemTenGod={d.stem_ten_god}
                            branchTenGod={d.jiji_ten_god}
                            growth={d.twelve_growth}
                            sinsal={d.sinsal || "-"}
                            relations={d.relations || "-"}
                            isSelected={selectedDaeun?.age === d.age}
                            onClick={() => handleDaeunSelect(d)}
                        />
                    ))}
                </div>
                {selectedDaeun && (
                    <AnalyzeButtons
                        apiBase={apiBase}
                        className="mt-8"
                        title={`${selectedDaeun.age}세 대운`}
                        body={{ saju_data: sajuData, analysis_type: 'daeun', query: `${selectedDaeun.age}세 대운 분석` }}
                    />
                )}
            </section>

            {selectedDaeun && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif">
                        <span className="text-2xl">📅</span>
                        <span className="border-b-2 border-[#d4af37]/30 pb-1">{selectedDaeun.age}세 대운 내 세운(歲運)</span>
                    </h3>
                    {isLoadingSeyun ? (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {seyunList.map((s, idx) => (
                                <LuckCard
                                    key={idx}
                                    header={`${s.year}년`}
                                    ganzhi={s.ganzhi}
                                    stemTenGod={s.stem_ten_god}
                                    branchTenGod={s.jiji_ten_god}
                                    growth={s.twelve_growth}
                                    sinsal={s.sinsal || "-"}
                                    relations={s.relations || "-"}
                                    isSelected={selectedSeyun?.year === s.year}
                                    onClick={() => handleSeyunSelect(s)}
                                />
                            ))}
                        </div>
                    )}
                    {selectedSeyun && (
                        <AnalyzeButtons
                            apiBase={apiBase}
                            className="mt-8"
                            title={`${selectedSeyun.year}년 세운`}
                            body={{ saju_data: sajuData, analysis_type: 'seyun', query: `${selectedSeyun.year}년 세운 분석` }}
                        />
                    )}
                </section>
            )}

            {selectedSeyun && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif">
                        <span className="text-2xl">🌙</span>
                        <span className="border-b-2 border-[#d4af37]/30 pb-1">{selectedSeyun.year}년 월운(月運)</span>
                    </h3>
                    {isLoadingWolun ? (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {wolunList.map((w, idx) => (
                                <LuckCard
                                    key={idx}
                                    header={`${w.month}월`}
                                    ganzhi={w.ganzhi}
                                    stemTenGod={w.stem_ten_god}
                                    branchTenGod={w.jiji_ten_god}
                                    growth={w.twelve_growth}
                                    sinsal={w.sinsal || "-"}
                                    relations={w.relations || "-"}
                                    isSelected={selectedWolun?.month === w.month}
                                    onClick={() => handleWolunSelect(w)}
                                />
                            ))}
                        </div>
                    )}
                    {selectedWolun && (
                        <AnalyzeButtons
                            apiBase={apiBase}
                            className="mt-8"
                            title={`${selectedWolun.month}월 월운`}
                            body={{ saju_data: sajuData, analysis_type: 'wolun', query: `${selectedWolun.month}월 월운 분석` }}
                        />
                    )}
                </section>
            )}
        </div>
    );
}
