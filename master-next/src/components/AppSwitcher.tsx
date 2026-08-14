"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Sun, BookOpenText, ScrollText, Compass, Check } from "lucide-react";
import { APP_LINKS } from "@/lib/appLinks";

// 형제 앱 스위처 — 버튼을 누르면 앱 리스트가 드롭다운으로 뜬다.
// 헤더(glass-card)가 overflow-hidden이라 안쪽 absolute는 잘리므로,
// Portal로 body에 fixed 렌더한다(버튼 위치 기준).
const APPS = [
    { key: "daily", href: APP_LINKS.daily, name: "사주 · Destiny Daily", desc: "누구나 쉽게 — 명식·오늘운세·궁합", icon: Sun },
    { key: "master", href: APP_LINKS.master, name: "전문 · Destiny Master", desc: "전문 풀이·명리 공부", icon: BookOpenText },
    { key: "classic", href: APP_LINKS.classic, name: "고전 · Destiny Classic", desc: "자미두수·주역·기문·택일·래정", icon: ScrollText },
    { key: "fengshui", href: APP_LINKS.fengshui, name: "풍수 · Destiny Compass", desc: "나경·현공비성·팔택·도면", icon: Compass },
] as const;
const CURRENT = "master";

export function AppSwitcher() {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // 버튼 위치 기준으로 드롭다운 좌표 계산
    const toggle = () => {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            // 버튼 오른쪽에 맞추되, 폭(MENU_W) 때문에 왼쪽이 화면 밖으로 나가지 않게 당겨 준다.
            // 앱 버튼 뒤에 글자크기·스킨 버튼이 있어 버튼이 화면 끝이 아니라서,
            // 좁은 화면에서는 그냥 두면 메뉴 왼쪽이 잘려 아이콘이 반만 보인다.
            const MENU_W = 288;   // w-72
            const EDGE = 8;
            let right = Math.max(EDGE, window.innerWidth - r.right);
            const overflowLeft = window.innerWidth - right - MENU_W;
            if (overflowLeft < EDGE) right = Math.max(EDGE, window.innerWidth - MENU_W - EDGE);
            setPos({ top: r.bottom + 8, right });
        }
        setOpen((v) => !v);
    };

    // 바깥 클릭·스크롤 시 닫기
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onScroll = () => setOpen(false);
        document.addEventListener("mousedown", onDown);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("scroll", onScroll);
        };
    }, [open]);

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                aria-label="다른 앱 보기"
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 whitespace-nowrap"
            >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">앱</span>
            </button>
            {open && pos && typeof document !== "undefined" && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: "fixed", top: pos.top, right: pos.right }}
                    className="z-[9999] w-72 max-w-[calc(100vw-16px)] glass-card !rounded-2xl p-2 shadow-2xl bg-white/95 dark:bg-slate-900/95 animate-in fade-in slide-in-from-top-2 duration-200"
                >
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
                </div>,
                document.body
            )}
        </>
    );
}
