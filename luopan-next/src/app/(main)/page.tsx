"use client";

import { useEffect, useState } from "react";
import Luopan from "@/components/Luopan";
import FlyingStarsView from "@/components/FlyingStarsView";
import SamhapView from "@/components/SamhapView";
import FloorPlanView from "@/components/FloorPlanView";

type Mode = "현공" | "팔택" | "삼합" | "도면";
type Gender = "male" | "female";
const BIRTH_KEY = "destiny-fengshui-birth"; // 풍수 앱 자체 생년 저장(팔택 본명괘용)

export default function LuopanHome() {
    const [ready, setReady] = useState(false);
    const [mode, setMode] = useState<Mode>("현공");   // 현공비성이 기본(실무 주력)
    const [birthYear, setBirthYear] = useState<number | undefined>(undefined);
    const [gender, setGender] = useState<Gender | undefined>(undefined);
    const [yearIn, setYearIn] = useState("");

    // 저장된 생년을 복원해 본명괘가 자동으로 잡히게 한다
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(BIRTH_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                if (p?.year) { setBirthYear(p.year); setYearIn(String(p.year)); }
                if (p?.gender === "male" || p?.gender === "female") setGender(p.gender);
            }
        } catch { /* 무시 */ }
        setReady(true);
    }, []);

    const saveBirth = (y?: number, g?: Gender) => {
        try { window.localStorage.setItem(BIRTH_KEY, JSON.stringify({ year: y, gender: g })); } catch { /* 무시 */ }
    };
    const applyYear = () => {
        const y = parseInt(yearIn, 10);
        if (y >= 1900 && y <= 2100) { setBirthYear(y); saveBirth(y, gender); }
    };
    const applyGender = (g: Gender) => { setGender(g); saveBirth(birthYear, g); };

    if (!ready) return null;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-2 py-5 md:py-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">🧭 풍수 나경</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm">휴대폰 방위 센서로 좌향을 재고 현공비성·팔택 길흉 방위를 확인합니다.</p>
            </div>

            {/* 본명괘용 생년·성별 (선택) — 입춘(2/4) 전 출생은 전년도로 입력 */}
            <div className="glass-card p-3 mb-4 flex items-center gap-2 flex-wrap text-sm text-slate-500 justify-center">
                <span>출생연도(입춘 기준)</span>
                <input type="number" value={yearIn} min={1900} max={2100} placeholder="예: 1983"
                    onChange={(e) => setYearIn(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyYear(); }}
                    onBlur={applyYear}
                    className="w-24 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                <select value={gender ?? ""} onChange={(e) => applyGender(e.target.value as Gender)}
                    className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm">
                    <option value="" disabled>성별</option>
                    <option value="male">남</option>
                    <option value="female">여</option>
                </select>
                <span className="text-[11px] text-slate-400">본명괘(팔택) 계산용 · 입춘(2/4) 전 출생은 전년도로</span>
            </div>

            {/* 유파 탭: 현공비성(기본) / 팔택 나경(센서) / 삼합수법 / 도면 방위 */}
            <div className="flex gap-1.5 mb-4 flex-wrap justify-center">
                {(["현공", "팔택", "삼합", "도면"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => setMode(m)}
                        className={"px-4 py-2 rounded-full text-sm font-semibold transition-colors " +
                            (mode === m ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                                : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60")}>
                        {m === "팔택" ? "팔택 나경" : m === "현공" ? "현공비성" : m === "삼합" ? "삼합수법" : "도면 방위"}
                    </button>
                ))}
            </div>

            {mode === "팔택" && (
                /* 나경은 어두운 배경 전제로 디자인돼 있어 짙은 배경 카드에 담는다 */
                <div style={{
                    background: "linear-gradient(160deg, #1b2233, #10151f)",
                    borderRadius: 20,
                    padding: "22px 10px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                }}>
                    <Luopan birthYear={birthYear} gender={gender} />
                </div>
            )}
            {mode === "현공" && <FlyingStarsView birthYear={birthYear} gender={gender} />}
            {mode === "삼합" && <SamhapView />}
            {mode === "도면" && <FloorPlanView birthYear={birthYear} gender={gender} />}
        </div>
    );
}
