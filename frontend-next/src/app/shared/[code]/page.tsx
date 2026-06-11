"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SajuPillars } from "@/components/SajuPillars";
import { FiveElements } from "@/components/FiveElements";
import { AnalysisTable } from "@/components/AnalysisTable";
import { ReportRenderer } from "@/components/ReportRenderer";
import { Button } from "@/components/ui/button";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 공유 코드로 저장된 명식을 읽기전용으로 보여주는 페이지 ((main) 레이아웃 밖)
export default function SharedPage() {
    const params = useParams();
    const code = Array.isArray(params.code) ? params.code[0] : params.code;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sajuData, setSajuData] = useState<any | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<string>("");
    const [terms, setTerms] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

    useEffect(() => {
        fetch(`${API_BASE}/terms`)
            .then((res) => (res.ok ? res.json() : {}))
            .then(setTerms)
            .catch(() => { });

        fetch(`${API_BASE}/share/${code}`)
            .then((res) => {
                if (!res.ok) throw new Error(`share ${res.status}`);
                return res.json();
            })
            .then((data) => {
                const payload = data?.payload;
                if (!payload?.saju_data?.pillars) throw new Error("invalid");
                setSajuData(payload.saju_data);
                setAiAnalysis(payload.ai_analysis || "");
                setStatus("ok");
            })
            .catch(() => setStatus("error"));
    }, [code]);

    return (
        <main className="min-h-screen pb-20 selection:bg-amber-100">
            <header className="glass-card !rounded-none border-t-0 border-x-0 border-b-white/20 dark:border-b-white/10 py-3 md:py-5 px-4 md:px-6 mb-5 md:mb-12">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="w-11 h-11 bg-gradient-to-tr from-[#d4af37] to-[#f9eeba] rounded-2xl flex items-center justify-center shadow-lg">
                            <span className="text-2xl">🔮</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight font-noto-serif">Destiny Code</h1>
                            <p className="text-[10px] text-[#d4af37] uppercase tracking-[0.3em] font-semibold mt-0.5">공유된 명식</p>
                        </div>
                    </Link>
                    <Link href="/">
                        <Button variant="outline" className="rounded-full">내 명식 보기 →</Button>
                    </Link>
                </div>
            </header>

            <div className="max-w-4xl mx-auto px-6">
                {status === "loading" && (
                    <div className="text-center py-24 text-slate-500 dark:text-slate-400">불러오는 중...</div>
                )}

                {status === "error" && (
                    <div className="glass-card p-10 text-center space-y-4">
                        <p className="text-slate-600 dark:text-slate-300">공유된 명식을 찾을 수 없습니다. 링크가 만료되었거나 잘못되었습니다.</p>
                        <Link href="/">
                            <Button className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white">처음으로 →</Button>
                        </Link>
                    </div>
                )}

                {status === "ok" && sajuData && (
                    <div className="space-y-16">
                        <SajuPillars data={sajuData} terms={terms} />

                        <FiveElements elements={sajuData.five_elements} />

                        <AnalysisTable
                            title="사주 4주 명식 상세"
                            description="공유된 명식입니다."
                            headers={["시주(時)", "일주(Day)", "월주(Month)", "연주(Year)"]}
                            rowLabels={["천간(Stem)", "지지(Branch)", "해당 기둥 십성", "기둥별 12운성"]}
                            terms={terms}
                            data={[
                                ['hour', 'day', 'month', 'year'].map(k => sajuData?.pillars?.[k]?.stem || "-"),
                                ['hour', 'day', 'month', 'year'].map(k => sajuData?.pillars?.[k]?.branch || "-"),
                                ['hour', 'day', 'month', 'year'].map(k => `${sajuData?.ten_gods?.[k] || (k === 'day' ? '본인' : '-')} | ${sajuData?.jiji_ten_gods?.[k] || '-'}`),
                                ['hour', 'day', 'month', 'year'].map(k => sajuData?.twelve_growth?.[k] || "-"),
                            ]}
                        />

                        {aiAnalysis && (
                            <div className="glass-card p-8">
                                <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-noto-serif mb-6">✨ AI 운세 분석</h4>
                                <ReportRenderer text={aiAnalysis} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
