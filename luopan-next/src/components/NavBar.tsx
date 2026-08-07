"use client";

import { Compass, Sparkles, ScrollText } from "lucide-react";
import { APP_LINKS } from "@/lib/appLinks";

// 풍수 앱 네비: 나경 단일 화면 + 형제 앱(사주·고전) 외부 링크
const EXT_ITEMS = [
    { href: APP_LINKS.saju, label: "사주", icon: Sparkles },
    { href: APP_LINKS.classic, label: "고전", icon: ScrollText },
] as const;

// 데스크톱: 헤더 인라인 링크
export function NavBarDesktop() {
    return (
        <nav className="hidden md:flex items-center gap-1">
            <span className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]">
                <Compass className="h-4 w-4" /> 나경
            </span>
            <span className="mx-1 h-4 w-px bg-slate-300/60 dark:bg-slate-600/60" />
            {EXT_ITEMS.map(({ href, label, icon: Icon }) => (
                <a key={href} href={href}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-slate-400 dark:text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-[#bf953f]">
                    <Icon className="h-4 w-4" />
                    {label}↗
                </a>
            ))}
        </nav>
    );
}

// 모바일: 하단 탭바 (나경 + 형제 앱 2)
export function NavBarMobile() {
    return (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-card !rounded-none !rounded-t-3xl border-b-0 border-x-0 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-3">
                <span className="flex flex-col items-center gap-1 py-1.5 text-[10px] font-bold text-[#bf953f] dark:text-[#e6c35c]">
                    <Compass className="h-5 w-5" /> 나경
                </span>
                {EXT_ITEMS.map(({ href, label, icon: Icon }) => (
                    <a key={href} href={href}
                        className="flex flex-col items-center gap-1 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                        <Icon className="h-5 w-5" />
                        {label}↗
                    </a>
                ))}
            </div>
        </nav>
    );
}
