"use client";

import Link from "next/link";
import { NavBarDesktop } from "@/components/NavBar";
import { ThemeToggle } from "@/components/ThemeToggle";

// 모든 라우트가 공유하는 상단 헤더. 로고 + 네비 + 다크토글을 한 곳에 통합한다.
export function AppHeader() {
    return (
        <header className="glass-card !rounded-none border-t-0 border-x-0 border-b-white/20 dark:border-b-white/10 py-5 px-6 mb-12 sticky top-0 z-50 transition-all duration-500">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
                <Link href="/" className="flex items-center gap-3 group shrink-0">
                    <div className="w-11 h-11 bg-gradient-to-tr from-[#d4af37] to-[#f9eeba] rounded-2xl flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform duration-500">
                        <span className="text-2xl">🔮</span>
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight font-noto-serif">Destiny Code</h1>
                        <p className="text-[10px] text-[#d4af37] uppercase tracking-[0.3em] font-semibold mt-0.5">Your Life, Written in Code</p>
                    </div>
                </Link>

                <div className="flex items-center gap-2">
                    <NavBarDesktop />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
