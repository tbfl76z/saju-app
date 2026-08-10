"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

// 풍수 앱 네비 — 진단(홈: 우리집·이사·나침반·물길) + 현공 공부
const NAV_ITEMS = [
    { href: "/", label: "진단", icon: Compass },
    { href: "/learn", label: "공부", icon: GraduationCap },
] as const;

function useIsActive() {
    const pathname = usePathname();
    return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function NavBarDesktop() {
    const isActive = useIsActive();
    return (
        <nav className="hidden md:flex items-center gap-1 shrink-0">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                    className={cn(
                        "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap",
                        isActive(href)
                            ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                            : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60"
                    )}>
                    <Icon className="h-4 w-4" />
                    {label}
                </Link>
            ))}
        </nav>
    );
}

export function NavBarMobile() {
    const isActive = useIsActive();
    return (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-card !rounded-none !rounded-t-3xl border-b-0 border-x-0 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2">
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
            </div>
        </nav>
    );
}
