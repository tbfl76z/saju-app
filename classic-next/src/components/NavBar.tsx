"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollText, UserRound, Sparkles, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_LINKS } from "@/lib/appLinks";

// 고전 앱 네비: 고전(홈) + 명식 관리, 형제 앱(사주·풍수)은 외부 링크
const NAV_ITEMS = [
    { href: "/", label: "고전", icon: ScrollText },
    { href: "/myeongsik", label: "명식 관리", icon: UserRound },
] as const;
const EXT_ITEMS = [
    { href: APP_LINKS.saju, label: "사주", icon: Sparkles },
    { href: APP_LINKS.fengshui, label: "풍수", icon: Compass },
] as const;

function useIsActive() {
    const pathname = usePathname();
    return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

// 데스크톱: 헤더 인라인 링크
export function NavBarDesktop() {
    const isActive = useIsActive();
    return (
        <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                    className={cn(
                        "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors",
                        isActive(href)
                            ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                            : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60"
                    )}>
                    <Icon className="h-4 w-4" />
                    {label}
                </Link>
            ))}
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

// 모바일: 하단 고정 탭바 (내부 2 + 형제 앱 2)
export function NavBarMobile() {
    const isActive = useIsActive();
    return (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-card !rounded-none !rounded-t-3xl border-b-0 border-x-0 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-4">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href}
                        className={cn(
                            "flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[10px] font-bold transition-colors whitespace-nowrap",
                            isActive(href) ? "text-[#bf953f] dark:text-[#e6c35c]" : "text-slate-400 dark:text-slate-500"
                        )}>
                        <Icon className="h-5 w-5" />
                        {label}
                    </Link>
                ))}
                {EXT_ITEMS.map(({ href, label, icon: Icon }) => (
                    <a key={href} href={href}
                        className="flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[10px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        <Icon className="h-5 w-5" />
                        {label}↗
                    </a>
                ))}
            </div>
        </nav>
    );
}
