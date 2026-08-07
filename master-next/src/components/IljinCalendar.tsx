"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:8001" : "https://saju-app-11.onrender.com")).replace(/\/$/, "");

interface DayCell { day: number; 간지: string; 십성?: string; 지지십성?: string; 운성?: string }

// 일진 달력 — 달력에서 날짜별 일진을 보고, 내 일간 기준 십성·12운성을 대조한다(전문가용).
export function IljinCalendar({ dayGan }: { dayGan: string }) {
    const now = new Date();
    const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth() + 1]);
    const [days, setDays] = useState<DayCell[]>([]);
    const [firstWd, setFirstWd] = useState(0);
    const [sel, setSel] = useState<DayCell | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (y: number, m: number) => {
        setLoading(true); setSel(null);
        try {
            const r = await fetch(`${API_BASE}/classic/iljin-calendar?year=${y}&month=${m}&day_gan=${encodeURIComponent(dayGan)}`);
            const d = await r.json();
            setDays(d.days ?? []);
            setFirstWd(d.first_weekday ?? 0);
        } catch { setDays([]); }
        finally { setLoading(false); }
    }, [dayGan]);

    useEffect(() => { load(ym[0], ym[1]); }, [ym, load]);

    const move = (diff: number) => {
        const [y, m] = ym;
        const d = new Date(y, m - 1 + diff, 1);
        setYm([d.getFullYear(), d.getMonth() + 1]);
    };
    const today = now.getDate();
    const isThisMonth = ym[0] === now.getFullYear() && ym[1] === now.getMonth() + 1;
    // 월요일 시작 헤더
    const WD = ["월", "화", "수", "목", "금", "토", "일"];

    return (
        <section>
            <h3 className="section-title text-lg md:text-xl mb-4"><span>📅 일진 달력 — 일간 {dayGan} 기준</span></h3>
            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <button onClick={() => move(-1)} aria-label="이전 달" className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
                    <div className="font-bold text-slate-800 dark:text-slate-100">{ym[0]}년 {ym[1]}월</div>
                    <button onClick={() => move(1)} aria-label="다음 달" className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
                </div>
                {loading ? (
                    <div className="py-10 text-center text-sm text-slate-400">불러오는 중…</div>
                ) : (
                    <>
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
                            {WD.map((w) => <div key={w}>{w}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: firstWd }).map((_, i) => <div key={`e${i}`} />)}
                            {days.map((d) => (
                                <button key={d.day} onClick={() => setSel(d)}
                                    className={cn(
                                        "rounded-lg border px-0.5 py-1 text-center transition-colors",
                                        sel?.day === d.day ? "border-[#d4af37] bg-[#d4af37]/15"
                                            : isThisMonth && d.day === today ? "border-sky-400 bg-sky-50/60 dark:bg-sky-900/20"
                                                : "border-slate-200/70 dark:border-slate-700/70 bg-white/40 dark:bg-slate-800/40 hover:border-[#d4af37]/60"
                                    )}>
                                    <div className="text-[10px] text-slate-400">{d.day}</div>
                                    <div className="font-noto-serif text-[13px] leading-tight text-slate-800 dark:text-slate-100">{d.간지}</div>
                                    {d.십성 && <div className="text-[9px] text-slate-500 truncate">{d.십성}</div>}
                                </button>
                            ))}
                        </div>
                        {sel && (
                            <div className="rounded-xl border border-[#d4af37]/30 bg-white/60 dark:bg-slate-800/50 px-4 py-3 text-sm">
                                <b className="font-noto-serif text-[#bf953f]">{ym[1]}/{sel.day} {sel.간지}</b>
                                <span className="text-slate-600 dark:text-slate-300"> · 십성 {sel.십성}/{sel.지지십성} · 12운성 {sel.운성}</span>
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400">날짜를 누르면 일간 {dayGan} 기준 십성·12운성을 보여줍니다. 택일·일진 학습에 활용하세요.</p>
                    </>
                )}
            </div>
        </section>
    );
}
