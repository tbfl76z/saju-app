"use client";

import { useState, useEffect, useCallback } from "react";
import { LuckCard } from "./LuckCard";
import { AnalysisTable } from "./AnalysisTable";
import { Button } from "@/components/ui/button";

interface LuckSectionProps {
    sajuData: any;
    terms: any;
    apiBase: string;
}

export function LuckSection({ sajuData, terms, apiBase }: LuckSectionProps) {
    const [selectedDaeun, setSelectedDaeun] = useState<any>(null);
    const [seyunList, setSeyunList] = useState<any[]>([]);
    const [selectedSeyun, setSelectedSeyun] = useState<any>(null);
    const [wolunList, setWolunList] = useState<any[]>([]);
    const [isLoadingSeyun, setIsLoadingSeyun] = useState(false);
    const [isLoadingWolun, setIsLoadingWolun] = useState(false);
    const [selectedWolun, setSelectedWolun] = useState<any>(null);

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
            const data = await res.json();
            setSeyunList(data);

            const nowYear = new Date().getFullYear();
            const currentSeyun = data.find((s: any) => s.year === nowYear);
            if (currentSeyun) {
                handleSeyunSelect(currentSeyun);
            }
        } catch (err) {
            console.error("Failed to fetch Seyun", err);
        } finally {
            setIsLoadingSeyun(false);
        }
    }, [apiBase, sajuData]);

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
            const data = await res.json();
            setWolunList(data);
        } catch (err) {
            console.error("Failed to fetch Wolun", err);
        } finally {
            setIsLoadingWolun(false);
        }
    }, [apiBase, sajuData]);

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

    const [analysisResult, setAnalysisResult] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<string | null>(null);

    const handleAnalyze = async (type: string) => {
        setIsAnalyzing(true);
        setAnalysisResult("");
        setActiveTab(type);
        try {
            const res = await fetch(`${apiBase}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    saju_data: sajuData,
                    analysis_type: type,
                    query: (type === 'daeun' ? `${selectedDaeun?.age}세 대운 분석` :
                        type === 'seyun' ? `${selectedSeyun?.year}년 세운 분석` :
                            type === 'wolun' ? `${selectedWolun?.month}월 월운 분석` : "")
                }),
            });
            const data = await res.json();
            setAnalysisResult(data.result);

            setTimeout(() => {
                document.getElementById('analysis-result')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (err) {
            console.error("Analysis failed", err);
            setAnalysisResult("분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
        } finally {
            setIsAnalyzing(false);
        }
    };

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
                            data={d}
                            isSelected={selectedDaeun?.age === d.age}
                            onClick={() => handleDaeunSelect(d)}
                        />
                    ))}
                </div>
                {selectedDaeun && (
                    <div className="mt-8 flex justify-center">
                        <Button
                            onClick={() => handleAnalyze('daeun')}
                            disabled={isAnalyzing}
                            className="rounded-full px-8 bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {isAnalyzing && activeTab === 'daeun' ? "분석 중..." : `${selectedDaeun.age}세 대운 AI 분석`}
                        </Button>
                    </div>
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
                                    data={s}
                                    isSelected={selectedSeyun?.year === s.year}
                                    onClick={() => handleSeyunSelect(s)}
                                    type="seyun"
                                />
                            ))}
                        </div>
                    )}
                    {selectedSeyun && (
                        <div className="mt-8 flex justify-center">
                            <Button
                                onClick={() => handleAnalyze('seyun')}
                                disabled={isAnalyzing}
                                className="rounded-full px-8 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {isAnalyzing && activeTab === 'seyun' ? "분석 중..." : `${selectedSeyun.year}년 세운 AI 분석`}
                            </Button>
                        </div>
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
                                    data={w}
                                    isSelected={selectedWolun?.month === w.month}
                                    onClick={() => setSelectedWolun(w)}
                                    type="wolun"
                                />
                            ))}
                        </div>
                    )}
                    {selectedWolun && (
                        <div className="mt-8 flex justify-center">
                            <Button
                                onClick={() => handleAnalyze('wolun')}
                                disabled={isAnalyzing}
                                className="rounded-full px-8 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {isAnalyzing && activeTab === 'wolun' ? "분석 중..." : `${selectedWolun.month}월 월운 AI 분석`}
                            </Button>
                        </div>
                    )}
                </section>
            )}

            {analysisResult && (
                <div id="analysis-result" className="glass-card p-8 border-amber-200/50 bg-amber-50/30 animate-in zoom-in-95 duration-500">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl">✨</div>
                        <h4 className="text-xl font-bold text-slate-900 font-noto-serif">AI 프리미엄 운세 분석</h4>
                    </div>
                    <div className="premium-report whitespace-pre-wrap text-slate-700 leading-relaxed text-lg">
                        {analysisResult}
                    </div>
                </div>
            )}
        </div>
    );
}
