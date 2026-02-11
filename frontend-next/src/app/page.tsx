"use client";

import { useState, useEffect } from "react";
import { SajuForm } from "@/components/SajuForm";
import { SajuPillars } from "@/components/SajuPillars";
import { FiveElements } from "@/components/FiveElements";
import { AnalysisTable } from "@/components/AnalysisTable";
import { LuckSection } from "@/components/LuckSection";
import { Button } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [sajuData, setSajuData] = useState<any>(null);
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/terms`)
      .then((res) => res.json())
      .then((data) => setTerms(data))
      .catch((err) => console.error("Failed to fetch terms", err));
  }, []);

  const handleCalculate = async (formData: any) => {
    setIsLoading(true);
    setAiAnalysis("");
    try {
      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setSajuData(data);
    } catch (err) {
      console.error("Calculation failed", err);
      alert("계산 중 오류가 발생했습니다. 서버가 실행 중인지 확인해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const [aiQuery, setAiQuery] = useState("");

  const handleAiAnalyze = async (type: string = "total") => {
    if (!sajuData) return;
    setIsAiLoading(true);
    setAiAnalysis("");
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saju_data: sajuData,
          query: aiQuery,
          analysis_type: type
        }),
      });
      const data = await res.json();
      setAiAnalysis(data.result);
    } catch (err) {
      console.error("AI analysis failed", err);
      setAiAnalysis("죄송합니다. AI 분석 중 오류가 발생했습니다. API 키가 만료되었거나 서버 설정에 문제가 있을 수 있습니다.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <main className="min-h-screen pb-20 bg-[#fafafa]">
      <header className="bg-white border-b border-slate-200 py-6 px-4 mb-8 sticky top-0 z-10 backdrop-blur-md bg-white/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔮</span>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight font-noto-serif">Destiny Code</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-sans">Your Life, Written in Code</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Premium AI 명리학
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4">
        {!sajuData ? (
          <div className="space-y-6">
            <div className="text-center space-y-4 py-16 animate-in fade-in duration-1000">
              <h2 className="text-4xl font-bold text-slate-900 font-noto-serif leading-tight">당신의 운명을 코드로 풀어보세요</h2>
              <p className="text-slate-600 text-lg max-w-2xl mx-auto">정통 명리학의 심오한 지혜와 최신 인공지능 기술이 만나,<br />당신의 삶에 따뜻한 위로와 지혜의 지도를 그려드립니다.</p>
            </div>
            <SajuForm onCalculate={handleCalculate} isLoading={isLoading} />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 space-y-8">
            <div className="flex justify-between items-center mb-6">
              <Button variant="outline" onClick={() => setSajuData(null)} className="hover:bg-slate-100 rounded-full px-6">← 다시 계산하기</Button>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                <div className="text-base font-semibold text-[#d4af37]">{sajuData.birth_date} 출생 명식</div>
              </div>
            </div>

            <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <SajuPillars data={sajuData} terms={terms} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-amber-50/70 border-2 border-amber-200/50 rounded-2xl p-5 text-sm flex items-center gap-4 shadow-sm">
                  <span className="text-3xl">🕳️</span>
                  <div>
                    <div className="font-bold text-amber-900 text-base">공망 (Void)</div>
                    <div className="text-amber-800 font-medium">연주: {sajuData.gongmang.year} / 일주: {sajuData.gongmang.day}</div>
                  </div>
                </div>
                {sajuData.relations?.length > 0 && (
                  <div className="bg-purple-50/70 border-2 border-purple-200/50 rounded-2xl p-5 text-sm flex items-center gap-4 shadow-sm">
                    <span className="text-3xl">💡</span>
                    <div>
                      <div className="font-bold text-purple-900 text-base">핵심 지지 관계</div>
                      <div className="text-purple-800 font-medium">{sajuData.relations.join(", ")}</div>
                    </div>
                  </div>
                )}
              </div>

              <FiveElements elements={sajuData.five_elements} />

              <AnalysisTable
                title="사주 4주 명식 상세"
                description="당신의 타고난 기운인 사주(4주 8자) 명식입니다. 각 항목을 클릭하여 상세한 풀이를 확인해보세요."
                headers={["시주(時)", "일주(Day)", "월주(Month)", "연주(Year)"]}
                rowLabels={["천간(Stem)", "지지(Branch)", "해당 기둥 십성", "기둥별 12운성"]}
                terms={terms}
                data={[
                  ['hour', 'day', 'month', 'year'].map(k => sajuData.pillars[k].stem),
                  ['hour', 'day', 'month', 'year'].map(k => sajuData.pillars[k].branch),
                  ['hour', 'day', 'month', 'year'].map(k => `${sajuData.ten_gods[k] || '본인'} | ${sajuData.jiji_ten_gods[k]}`),
                  ['hour', 'day', 'month', 'year'].map(k => sajuData.twelve_growth[k]),
                ]}
              />

              <div className="pt-8 border-t border-slate-200">
                <LuckSection sajuData={sajuData} terms={terms} apiBase={API_BASE} />
              </div>

            </div>
          </div>
        )}
      </div>

      <footer className="mt-20 border-t border-slate-200 py-12 text-center text-sm text-slate-400 font-sans">
        © 2026 Destiny Code. Premium Saju Analysis Platform.<br />
        Powered by Google Gemini AI & Sajupy Engine.
      </footer>
    </main>
  );
}
