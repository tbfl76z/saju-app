"use client";

import { useEffect, useState } from "react";
import Luopan from "@/components/Luopan";
import FlyingStarsView from "@/components/FlyingStarsView";
import SamhapView from "@/components/SamhapView";
import MoveCheckView from "@/components/MoveCheckView";

type Mode = "현공" | "이사" | "팔택" | "삼합";
// 메뉴 이름은 쉬운 말 우선, 괄호에 유파 병기(공부 탭과 연결)
const TABS: { key: Mode; label: string }[] = [
    { key: "현공", label: "🏠 우리집 진단" },
    { key: "이사", label: "🏡 이사할 집 진단" },
    { key: "팔택", label: "🧭 나침반 길방" },
    { key: "삼합", label: "💧 물길 좌향" },
];
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
                <p className="text-slate-600 dark:text-slate-400 text-sm">휴대폰으로 집 방향을 재서 우리 집 기운 지도를 그리고, 이사할 집도 미리 진단합니다.</p>
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

            {/* 메뉴 탭: 우리집 진단(현공, 기본) / 이사할 집 진단 / 나침반 길방(팔택) / 물길 좌향(삼합) */}
            <div className="flex gap-1.5 mb-4 flex-wrap justify-center">
                {TABS.map(({ key, label }) => (
                    <button key={key} onClick={() => setMode(key)}
                        className={"px-4 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap " +
                            (mode === key ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                                : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60")}>
                        {label}
                    </button>
                ))}
            </div>
            <p className="text-center text-[11px] text-slate-400 -mt-2 mb-4">
                {mode === "현공" ? "현공비성 — 지금 사는 집의 기운 지도" : mode === "이사" ? "현공비성 — 이사 후보 집을 계약 전에 판정" : mode === "팔택" ? "팔택 — 내 본명괘 기준 길한 방위" : "삼합수법 — 물길·출입구 방위"}
            </p>

            {/* 탭은 조건부 렌더(언마운트)가 아니라 hidden으로만 감춘다.
                언마운트하면 재던 좌향·올린 도면·찍어둔 외곽선이 통째로 날아간다. */}
            <div className={mode === "팔택" ? "" : "hidden"}>
                {/* 나경은 어두운 배경 전제로 디자인돼 있어 짙은 배경 카드에 담는다 */}
                <div style={{
                    background: "linear-gradient(160deg, #1b2233, #10151f)",
                    borderRadius: 20,
                    padding: "22px 10px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                }}>
                    <Luopan birthYear={birthYear} gender={gender} active={mode === "팔택"} />
                </div>
            </div>
            <div className={mode === "현공" ? "" : "hidden"}>
                <FlyingStarsView birthYear={birthYear} gender={gender} />
            </div>
            <div className={mode === "이사" ? "" : "hidden"}>
                <MoveCheckView birthYear={birthYear} gender={gender} />
            </div>
            <div className={mode === "삼합" ? "" : "hidden"}>
                <SamhapView />
            </div>
        </div>
    );
}
