"use client";

import { useState, useEffect, useRef } from "react";
import { SajuForm } from "@/components/SajuForm";
import { SajuPillars } from "@/components/SajuPillars";
import { FiveElements } from "@/components/FiveElements";
import { AnalysisTable } from "@/components/AnalysisTable";
import { LuckSection } from "@/components/LuckSection";
import { DailyFortune } from "@/components/DailyFortune";
import { NewYearSection } from "@/components/NewYearSection";
import { ImagePromptCard } from "@/components/ImagePromptCard";
import SaveShareBar from "@/components/SaveShareBar";
import SavedProfilesModal from "@/components/SavedProfilesModal";
import { Button } from "@/components/ui/button";
import { Bookmark } from "lucide-react";
import { notify } from "@/lib/useToast";
import { getProfile, LOAD_PROFILE_KEY } from "@/lib/storage";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sajuData, setSajuData] = useState<any | null>(null);
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [aiAnalysis] = useState<string>("");
  const [isMounted, setIsMounted] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetch(`${API_BASE}/terms`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Terms request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setTerms(data))
      .catch((err) => console.error("Failed to fetch terms", err));

    // /saved에서 '불러오기'로 넘어온 명식이 있으면 복원한다
    try {
      const loadId = window.sessionStorage.getItem(LOAD_PROFILE_KEY);
      if (loadId) {
        window.sessionStorage.removeItem(LOAD_PROFILE_KEY);
        const profile = getProfile(loadId);
        if (profile) setSajuData(profile.sajuData);
      }
    } catch {
      /* noop */
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleCalculate = async (formData: any) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Calculation failed with status ${res.status}`);
      }
      const data = await res.json();
      if (!data?.pillars) {
        throw new Error("Invalid calculate response");
      }
      setSajuData(data);
    } catch (err) {
      console.error("Calculation failed", err);
      notify.error("계산 중 오류가 발생했습니다", "서버가 실행 중인지 확인해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) return null;

  return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {!sajuData ? (
          <div className="space-y-6">
            <div className="text-center space-y-4 py-8 md:py-16 animate-in fade-in duration-1000">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif leading-tight">당신의 운명을 코드로 풀어보세요</h2>
              <p className="text-slate-600 dark:text-slate-400 text-base md:text-lg max-w-2xl mx-auto">정통 명리학의 심오한 지혜와 최신 인공지능 기술이 만나,<br />당신의 삶에 따뜻한 위로와 지혜의 지도를 그려드립니다.</p>
            </div>
            <SajuForm onCalculate={handleCalculate} isLoading={isLoading} />
            <div className="flex justify-center">
              <Button variant="ghost" onClick={() => setSavedOpen(true)} className="rounded-full text-slate-500 dark:text-slate-400 hover:text-[#bf953f]">
                <Bookmark className="h-4 w-4 mr-1.5" /> 저장된 명식 불러오기
              </Button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 space-y-8">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSajuData(null)} className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-5">← 다시 계산하기</Button>
                <Button variant="outline" onClick={() => setSavedOpen(true)} className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-5">
                  <Bookmark className="h-4 w-4 mr-1.5" /> 저장된 명식
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                <div className="text-base font-semibold text-[#d4af37]">
                  {sajuData?.name ? `${sajuData.name}님 · ` : ""}{sajuData?.birth_date} 출생 명식
                </div>
              </div>
            </div>

            <SaveShareBar sajuData={sajuData} aiAnalysis={aiAnalysis} captureRef={captureRef as React.RefObject<HTMLElement | null>} apiBase={API_BASE} />

            {sajuData?.unknown_time && (
              <div className="flex items-center gap-2 text-sm bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-slate-600 dark:text-slate-300">
                <span>⏱️</span>
                <span>태어난 시간을 모름으로 입력하셨습니다. <b>시주(時)</b>는 참고용이며, 년·월·일주 중심으로 풀이됩니다.</span>
              </div>
            )}

            <div ref={captureRef} className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <SajuPillars data={sajuData} terms={terms} />

              <DailyFortune sajuData={sajuData} apiBase={API_BASE} />

              <FiveElements elements={sajuData.five_elements} />

              <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                <ImagePromptCard sajuData={sajuData} apiBase={API_BASE} />
              </div>

              <AnalysisTable
                title="사주 4주 명식 상세"
                description="당신의 타고난 기운인 사주(4주 8자) 명식입니다. 각 항목을 클릭하여 상세한 풀이를 확인해보세요."
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

              {/* 공망·핵심 지지 관계 — 명식 상세표 바로 아래 배치 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-amber-50/70 dark:bg-amber-950/30 border-2 border-amber-200/50 dark:border-amber-800/40 rounded-2xl p-5 text-sm flex items-center gap-4 shadow-sm">
                  <span className="text-3xl">🕳️</span>
                  <div>
                    <div className="font-bold text-amber-900 dark:text-amber-300 text-base">공망 (Void)</div>
                    <div className="text-amber-800 dark:text-amber-400/90 font-medium">연주: {sajuData?.gongmang?.year || "-"} / 일주: {sajuData?.gongmang?.day || "-"}</div>
                  </div>
                </div>
                {sajuData?.relations?.length > 0 && (
                  <div className="bg-purple-50/70 dark:bg-purple-950/30 border-2 border-purple-200/50 dark:border-purple-800/40 rounded-2xl p-5 text-sm flex items-center gap-4 shadow-sm">
                    <span className="text-3xl">💡</span>
                    <div>
                      <div className="font-bold text-purple-900 dark:text-purple-300 text-base">핵심 지지 관계</div>
                      <div className="text-purple-800 dark:text-purple-400/90 font-medium">{sajuData.relations.join(", ")}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                <LuckSection sajuData={sajuData} terms={terms} apiBase={API_BASE} />
              </div>

              <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                <NewYearSection sajuData={sajuData} terms={terms} apiBase={API_BASE} />
              </div>

            </div>
          </div>
        )}

        <SavedProfilesModal
          open={savedOpen}
          onClose={() => setSavedOpen(false)}
          onSelect={(data) => { setSajuData(data); setSavedOpen(false); }}
        />
      </div>
  );
}
