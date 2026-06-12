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
import { getProfile, getPrimaryProfile, LOAD_PROFILE_KEY } from "@/lib/storage";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 히어로 우측 명식 미리보기 — 마지막 저장 명식이 있으면 그걸, 없으면 예시 명식 (시안 A 구성)
const SAMPLE_PILLARS = [
  { lab: "時", stem: "丙", branch: "寅", ss: "식신·편관", day: false },
  { lab: "日", stem: "甲", branch: "子", ss: "본인·정인", day: true },
  { lab: "月", stem: "辛", branch: "巳", ss: "정관·식신", day: false },
  { lab: "年", stem: "庚", branch: "午", ss: "편관·상관", day: false },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeroPillarsPreview({ onLoad, mounted }: { onLoad: (d: any) => void; mounted: boolean }) {
  const profile = mounted ? getPrimaryProfile() : undefined;
  const d = profile?.sajuData;
  const cards = d?.pillars
    ? (["hour", "day", "month", "year"] as const).map((k, i) => ({
        lab: ["時", "日", "月", "年"][i],
        stem: d.pillars[k]?.stem ?? "-",
        branch: d.pillars[k]?.branch ?? "-",
        ss: `${k === "day" ? "본인" : d.ten_gods?.[k] ?? "-"}·${d.jiji_ten_gods?.[k] ?? "-"}`,
        day: k === "day",
      }))
    : SAMPLE_PILLARS;

  return (
    <button
      type="button"
      onClick={() => d && onLoad(d)}
      className={`block w-full pt-3 ${d ? "cursor-pointer" : "cursor-default"}`}
      aria-label={d ? "저장된 명식 열기" : "예시 명식"}
    >
      <div className="grid grid-cols-4 gap-2">
        {cards.map((c) => (
          <div
            key={c.lab}
            className={`relative rounded-2xl border text-center px-1 py-3 md:py-4 backdrop-blur-sm transition-transform hover:scale-[1.03] ${
              c.day
                ? "border-[#d4af37] bg-[#fdf8ea]/90 dark:bg-[#262344]/90 shadow-[0_0_16px_rgba(212,175,55,0.3)]"
                : "border-[#e9e1cf] dark:border-[#323a6e] bg-white/85 dark:bg-[#1a1f44]/85 shadow-sm"
            }`}
          >
            {c.day && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white text-[8px] font-bold px-2 py-px rounded-full tracking-widest shadow">
                日主
              </span>
            )}
            <p className="text-[9px] md:text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{c.lab}</p>
            <p className="font-noto-serif text-2xl md:text-[34px] font-bold leading-tight text-slate-900 dark:text-slate-50 my-0.5">
              {c.stem}
              <br />
              <span className="text-[#8a6a24] dark:text-[#b7a5ff]">{c.branch}</span>
            </p>
            <p className="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 truncate px-0.5">{c.ss}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 text-center">
        {d ? `${profile?.label} — 탭하면 바로 열려요` : "예시 명식 — 내 사주를 계산하면 여기에 표시됩니다"}
      </p>
    </button>
  );
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sajuData, setSajuData] = useState<any | null>(null);
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [aiAnalysis] = useState<string>("");
  const [isMounted, setIsMounted] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null); // 히어로 CTA → 입력 폼 스크롤

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
            {/* 시안 A 히어로: 좌측 카피+CTA / 우측 명식 미리보기 2단 구성 */}
            <div className="hero-sky grid md:grid-cols-[1.15fr_1fr] gap-8 md:gap-10 items-center py-8 md:py-14 px-2 md:px-6 animate-in fade-in duration-1000">
              <div className="text-center md:text-left space-y-4">
                <p className="text-[10px] md:text-[11px] tracking-[0.35em] text-[#bf953f] dark:text-[#e6c35c] font-bold uppercase">Ancient Wisdom · Modern AI</p>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif leading-snug">당신의 운명을<br className="hidden md:block" /> 코드로 풀어보세요</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base leading-relaxed">정통 명리학의 깊은 지혜와 인공지능이 만나<br />당신의 삶에 따뜻한 지혜의 지도를 그려드립니다.</p>
                <div className="pt-1">
                  <Button
                    onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold px-8 py-5 shadow-lg shadow-[#d4af37]/30"
                  >
                    내 명식 살펴보기
                  </Button>
                </div>
              </div>
              <HeroPillarsPreview onLoad={(d) => setSajuData(d)} mounted={isMounted} />
            </div>

            <div ref={formRef} className="scroll-mt-24">
              <SajuForm onCalculate={handleCalculate} isLoading={isLoading} />
            </div>
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
