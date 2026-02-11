"use client";

import { useState, useEffect } from "react";
import { LuckCard } from "./LuckCard";
import { AnalysisTable } from "./AnalysisTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

    // 초기 대운 선택 (현재 나이에 맞는 대운)
    useEffect(() => {
        if (sajuData?.fortune?.list) {
            const birthYear = parseInt(sajuData.birth_date.split("-")[0]);
            const nowYear = new Date().getFullYear();
            const age = nowYear - birthYear + 1;

            const current = sajuData.fortune.list.find((d: any) => age >= d.age && age < d.age + 10);
            if (current) {
                handleDaeunSelect(current);
            }
        }
    }, [sajuData]);

    const handleDaeunSelect = async (daeun: any) => {
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
    };

    const handleSeyunSelect = async (seyun: any) => {
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
    };

    const handleWolunSelect = (wolun: any) => {
        setSelectedWolun(wolun);
    };

    const [analysisResult, setAnalysisResult] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [aiQuery, setAiQuery] = useState("");

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
                    query: aiQuery || (type === 'daeun' ? `${selectedDaeun?.age}세 대운 분석` :
                        type === 'seyun' ? `${selectedSeyun?.year}년 세운 분석` :
                            type === 'wolun' ? `${selectedWolun?.month}월 월운 분석` : "")
                }),
            });
            const data = await res.json();
            setAnalysisResult(data.result);

            // 결과창으로 부드럽게 스크롤
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
        <div className="space-y-12 pb-20">

            {/* 대운 섹션 */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">📅</span>
                        <h3 className="text-xl font-bold font-noto">대운(大運)의 흐름</h3>
                    </div>
                    <span className="text-sm text-amber-600 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-100">현재 대운수: {sajuData.fortune.num} ({sajuData.fortune.direction})</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {sajuData.fortune.list.map((item: any) => (
                        <LuckCard
                            key={item.age}
                            header={`${item.age}세 대운`}
                            ganzhi={item.ganzhi}
                            stemTenGod={item.stem_ten_god}
                            branchTenGod={item.branch_ten_god}
                            growth={item.twelve_growth}
                            sinsal={item.sinsal}
                            relations={item.relations}
                            isSelected={selectedDaeun?.age === item.age}
                            onClick={() => handleDaeunSelect(item)}
                        />
                    ))}
                </div>
            </section>

            {/* 대운 상세 분석 */}
            {selectedDaeun && (
                <div className="pt-8 border-t border-slate-100 animate-in fade-in duration-700">
                    <AnalysisTable
                        title={`${selectedDaeun.age}세 대운(${selectedDaeun.ganzhi}) 기둥별 상세 분석`}
                        description="선택하신 대운이 원국의 각 기둥(연,월,일,시)과 맺는 명리적 상호작용을 항목별로 풀이합니다."
                        headers={["시주(時)", "일주(Day)", "월주(Month)", "연주(Year)"]}
                        rowLabels={["간지", "원국 십성", "대운 적용 운성", "상호 관계 분석"]}
                        terms={terms}
                        data={[
                            ['hour', 'day', 'month', 'year'].map(k => sajuData.pillars[k].pillar),
                            ['hour', 'day', 'month', 'year'].map(k => `${sajuData.ten_gods[k] || '본인'} | ${sajuData.jiji_ten_gods[k]}`),
                            ['hour', 'day', 'month', 'year'].map(k => sajuData.twelve_growth[k]),
                            ['hour', 'day', 'month', 'year'].map(k => {
                                return selectedDaeun.relations?.split(',').filter((r: string) => r.includes(k === 'year' ? '년' : k === 'month' ? '월' : k === 'day' ? '일' : '시')).join(', ') || "평온";
                            })
                        ]}
                    />
                </div>
            )}

            {/* 세운 섹션 */}
            {selectedDaeun && (
                <section className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500 pt-8 border-t border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">⏳</span>
                        <h3 className="text-xl font-bold font-noto">{selectedDaeun.age}세 대운 내의 세운(年運) 흐름</h3>
                    </div>
                    {isLoadingSeyun ? (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {seyunList.map((item: any) => (
                                <LuckCard
                                    key={item.year}
                                    header={`${item.year}년`}
                                    ganzhi={item.ganzhi}
                                    stemTenGod={item.stem_ten_god}
                                    branchTenGod={item.branch_ten_god}
                                    growth={item.twelve_growth}
                                    sinsal={item.sinsal}
                                    relations={item.relations}
                                    isSelected={selectedSeyun?.year === item.year}
                                    onClick={() => handleSeyunSelect(item)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* 세운 상세 분석 */}
            {selectedSeyun && (
                <div className="pt-4 border-t border-slate-100 animate-in fade-in duration-700">
                    <AnalysisTable
                        title={`${selectedSeyun.year}년 세운(${selectedSeyun.ganzhi}) 상세 관계 분석`}
                        description="선택하신 세운이 원국(4주) 및 현재 대운과 맺는 복합 상호작용을 풀이합니다."
                        headers={["시주(時)", "일주(Day)", "월주(Month)", "연주(Year)", "대운"]}
                        rowLabels={["간지", "대상 십성", "세운 적용 운성", "상호 관계 분석"]}
                        terms={terms}
                        data={[
                            ['hour', 'day', 'month', 'year'].map(k => sajuData.pillars[k].pillar).concat([selectedDaeun.ganzhi]),
                            ['hour', 'day', 'month', 'year'].map(k => `${sajuData.ten_gods[k] || '본인'}`).concat([`${selectedDaeun.stem_ten_god}`]),
                            ['hour', 'day', 'month', 'year'].map(k => sajuData.twelve_growth[k]).concat([selectedDaeun.twelve_growth]),
                            ['hour', 'day', 'month', 'year'].map(k => {
                                return selectedSeyun.relations?.split(',').filter((r: string) => r.includes(k === 'year' ? '년' : k === 'month' ? '월' : k === 'day' ? '일' : '시')).join(', ') || "평온";
                            }).concat([selectedSeyun.relations?.split(',').filter((r: string) => r.includes('대운')).join(', ') || "평온"])
                        ]}
                    />
                </div>
            )}

            {/* 월운 섹션 */}
            {selectedSeyun && (
                <section className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500 pt-8 border-t border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🌙</span>
                        <h3 className="text-xl font-bold font-noto">{selectedSeyun.year}년 월별 운세 흐름</h3>
                    </div>
                    {isLoadingWolun ? (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {wolunList.map((item: any) => (
                                <LuckCard
                                    key={item.month}
                                    header={`${item.month}월`}
                                    ganzhi={item.ganzhi}
                                    stemTenGod={item.stem_ten_god}
                                    branchTenGod={item.branch_ten_god}
                                    growth={item.twelve_growth}
                                    sinsal={item.sinsal}
                                    relations={item.relations}
                                    isSelected={selectedWolun?.month === item.month}
                                    onClick={() => handleWolunSelect(item)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* 월운 상세 분석 */}
            {selectedWolun && (
                <div className="pt-4 border-t border-slate-100 animate-in fade-in duration-700">
                    <AnalysisTable
                        title={`${selectedSeyun?.year}년 ${selectedWolun.month}월 월운(${selectedWolun.ganzhi}) 상세 관계 분석`}
                        description="선택하신 월운이 원국(4주), 현재 대운, 그리고 세운과 맺는 다층적인 상호작용을 풀이합니다."
                        headers={["시주(時)", "일주(Day)", "월주(Month)", "연주(Year)", "대운", "세운"]}
                        rowLabels={["간지", "대상 십성", "월운 적용 운성", "상호 관계 분석"]}
                        terms={terms}
                        data={[
                            ['hour', 'day', 'month', 'year'].map(k => sajuData.pillars[k].pillar).concat([selectedDaeun.ganzhi, selectedSeyun.ganzhi]),
                            ['hour', 'day', 'month', 'year'].map(k => `${sajuData.ten_gods[k] || '본인'}`).concat([`${selectedDaeun.stem_ten_god}`, `${selectedSeyun.stem_ten_god}`]),
                            ['hour', 'day', 'month', 'year'].map(k => sajuData.twelve_growth[k]).concat([selectedDaeun.twelve_growth, selectedSeyun.twelve_growth]),
                            ['hour', 'day', 'month', 'year'].map(k => {
                                return selectedWolun.relations?.split(',').filter((r: string) => r.includes(k === 'year' ? '년' : k === 'month' ? '월' : k === 'day' ? '일' : '시')).join(', ') || "평온";
                            }).concat([
                                selectedWolun.relations?.split(',').filter((r: string) => r.includes('대운')).join(', ') || "평온",
                                selectedWolun.relations?.split(',').filter((r: string) => r.includes('년') || r.includes('세운')).join(', ') || "평온"
                            ])
                        ]}
                    />
                </div>
            )}
            {/* 하단 통합 AI 전용 분석 섹션 */}
            <section className="mt-20 pt-16 border-t-2 border-[#d4af37]/20">
                <div className="bg-white border-2 border-[#d4af37]/10 rounded-3xl p-8 md:p-12 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-[#d4af37]"></div>

                    <div className="text-center mb-10">
                        <div className="inline-block p-4 bg-amber-50 rounded-2xl mb-4">
                            <span className="text-4xl">🔮</span>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2 font-noto-serif">AI 명리 대가 심층 분석</h3>
                        <p className="text-slate-500 max-w-lg mx-auto">원국과 운세 데이터를 결합하여 당신의 삶에 지혜로운 조언을 건넵니다.</p>
                    </div>

                    <div className="max-w-3xl mx-auto space-y-8">
                        {/* 질문 입력창 추가 */}
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-600 ml-1 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37]"></span>
                                AI 대가에게 구체적으로 궁금한 점 (선택)
                            </label>
                            <input
                                type="text"
                                value={aiQuery}
                                onChange={(e) => setAiQuery(e.target.value)}
                                placeholder="예: 구체적인 건강운이나 직장운이 궁금합니다."
                                className="w-full p-4 md:p-5 rounded-2xl border-2 border-slate-100 focus:border-[#d4af37]/40 focus:outline-none transition-all shadow-sm text-lg"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Button
                                    onClick={() => handleAnalyze('total')}
                                    disabled={isAnalyzing}
                                    className="bg-slate-800 hover:bg-slate-900 text-white h-16 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-95"
                                >
                                    📜 인생 종합 분석
                                </Button>
                                <Button
                                    onClick={() => handleAnalyze('original')}
                                    disabled={isAnalyzing}
                                    className="bg-emerald-700 hover:bg-emerald-800 text-white h-16 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-95"
                                >
                                    🌿 사주 원국 해석
                                </Button>
                                <Button
                                    onClick={() => handleAnalyze('daeun')}
                                    disabled={!selectedDaeun || isAnalyzing}
                                    className="bg-blue-700 hover:bg-blue-800 text-white h-16 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-95"
                                >
                                    🌊 선택 대운 분석
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                                <Button
                                    onClick={() => handleAnalyze('seyun')}
                                    disabled={!selectedSeyun || isAnalyzing}
                                    className="bg-orange-700 hover:bg-orange-800 text-white h-14 rounded-2xl font-bold text-sm shadow-md transition-transform active:scale-95"
                                >
                                    📈 선택 세운 분석
                                </Button>
                                <Button
                                    onClick={() => handleAnalyze('wolun')}
                                    disabled={!selectedWolun || isAnalyzing}
                                    className="bg-indigo-700 hover:bg-indigo-800 text-white h-14 rounded-2xl font-bold text-sm shadow-md transition-transform active:scale-95"
                                >
                                    🗓️ 선택 월운 분석
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* AI 분석 결과 출력창 (카드 내부 배치) */}
                    {(isAnalyzing || analysisResult) && (
                        <div id="analysis-result" className="mt-12 p-8 md:p-10 bg-slate-50/80 rounded-3xl border border-slate-100 animate-in fade-in slide-in-from-bottom-6 duration-1000 shadow-inner">
                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-full flex items-center justify-center text-white text-xl shadow-lg">✨</div>
                                    <h4 className="text-xl font-bold text-slate-800 font-noto-serif">명리 대가 분석 리포트</h4>
                                </div>
                                {!isAnalyzing && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            navigator.clipboard.writeText(analysisResult);
                                            alert("분석 결과가 복사되었습니다.");
                                        }}
                                        className="text-[#d4af37] hover:bg-white"
                                    >
                                        📋 복사하기
                                    </Button>
                                )}
                            </div>

                            {isAnalyzing ? (
                                <div className="space-y-6">
                                    <Skeleton className="h-6 w-3/4 bg-slate-200" />
                                    <Skeleton className="h-48 w-full bg-slate-200" />
                                    <div className="flex justify-center text-slate-400 text-sm animate-pulse pt-4">인공지능 대가가 운명의 흐름을 읽는 중입니다...</div>
                                </div>
                            ) : (
                                <div className="premium-report prose prose-slate max-w-none text-slate-700 leading-relaxed font-noto whitespace-pre-wrap text-lg md:text-xl">
                                    {analysisResult}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
