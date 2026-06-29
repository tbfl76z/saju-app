"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sun, HeartHandshake, Bookmark, GraduationCap, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

// 네비게이션 항목 정의 (단일 출처)
const NAV_ITEMS = [
    { href: "/", label: "명식", icon: Home },
    { href: "/today", label: "오늘의 운세", icon: Sun },
    { href: "/classic", label: "고전", icon: ScrollText },
    { href: "/compatibility", label: "궁합", icon: HeartHandshake },
    { href: "/learn", label: "공부", icon: GraduationCap },
    { href: "/saved", label: "저장됨", icon: Bookmark },
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
                <Link
                    key={href}
                    href={href}
                    className={cn(
                        "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors",
                        isActive(href)
                            ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                            : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60"
                    )}
                >
                    <Icon className="h-4 w-4" />
                    {label}
                </Link>
            ))}
        </nav>
    );
}

// 모바일: 하단 고정 탭바
export function NavBarMobile() {
    const isActive = useIsActive();
    return (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-card !rounded-none !rounded-t-3xl border-b-0 border-x-0 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {/* 라벨 폭과 무관하게 항상 대칭이 되도록 N등분 그리드 */}
            <div className="grid grid-cols-6">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[10px] font-bold transition-colors whitespace-nowrap",
                            isActive(href)
                                ? "text-[#bf953f] dark:text-[#e6c35c]"
                                : "text-slate-400 dark:text-slate-500"
                        )}
                    >
                        <Icon className="h-5 w-5" />
                        {label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
