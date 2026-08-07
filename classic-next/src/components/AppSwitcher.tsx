"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Sun, BookOpenText, ScrollText, Compass, Check } from "lucide-react";
import { APP_LINKS } from "@/lib/appLinks";

// 형제 앱 스위처 — 버튼을 누르면 앱 리스트가 드롭다운으로 뜬다.
const APPS = [
    { key: "daily", href: APP_LINKS.daily, name: "사주 · Destiny Daily", desc: "누구나 쉽게 — 명식·오늘운세·궁합", icon: Sun },
    { key: "master", href: APP_LINKS.master, name: "전문 · Destiny Master", desc: "전문 풀이·명리 공부", icon: BookOpenText },
    { key: "classic", href: APP_LINKS.classic, name: "고전 · Destiny Classic", desc: "자미두수·주역·기문·택일·래정", icon: ScrollText },
    { key: "fengshui", href: APP_LINKS.fengshui, name: "풍수 · Destiny Compass", desc: "나경·현공비성·팔택·도면", icon: Compass },
] as const;
const CURRENT = "classic";

export function AppSwitcher() {
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    // 바깥 클릭 시 닫기
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    return (
        <div ref={boxRef} className="relative">
            <button
                onClick={() => setOpen(!open)}
                aria-label="다른 앱 보기"
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 whitespace-nowrap"
            >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">앱</span>
            </button>
            {open && (
                <div className="absolute right-0 top-11 z-[70] w-72 glass-card !rounded-2xl p-2 shadow-2xl bg-white/95 dark:bg-slate-900/95 animate-in fade-in slide-in-from-top-2 duration-200">
                    {APPS.map(({ key, href, name, desc, icon: Icon }) => {
                        const isCur = key === CURRENT;
                        const inner = (
                            <div className={"flex items-start gap-3 rounded-xl px-3 py-2.5 " + (isCur ? "bg-[#d4af37]/10" : "hover:bg-slate-100/80 dark:hover:bg-slate-800/80")}>
                                <Icon className={"h-5 w-5 mt-0.5 shrink-0 " + (isCur ? "text-[#bf953f]" : "text-slate-400")} />
                                <div className="min-w-0 flex-1">
                                    <div className={"text-sm font-bold " + (isCur ? "text-[#bf953f]" : "text-slate-700 dark:text-slate-200")}>{name}</div>
                                    <div className="text-[11px] text-slate-400">{desc}</div>
                                </div>
                                {isCur && <Check className="h-4 w-4 text-[#bf953f] shrink-0 mt-1" />}
                            </div>
                        );
                        return isCur
                            ? <div key={key}>{inner}</div>
                            : <a key={key} href={href} className="block">{inner}</a>;
                    })}
                </div>
            )}
        </div>
    );
}
