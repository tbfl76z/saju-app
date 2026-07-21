"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

// 맨 위로 — 페이지를 어느 정도 내리면 나타나는 플로팅 버튼.
// 모바일 하단 탭바에 가리지 않도록 bottom을 넉넉히 잡는다.
export function ScrollTopButton() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const onScroll = () => setShow(window.scrollY > 400);
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    if (!show) return null;

    return (
        <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="맨 위로"
            title="맨 위로"
            className="fixed right-4 bottom-24 md:bottom-8 z-40 h-11 w-11 rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white shadow-lg shadow-[#d4af37]/30 flex items-center justify-center hover:scale-105 transition-transform animate-in fade-in slide-in-from-bottom-2"
        >
            <ArrowUp className="h-5 w-5" />
        </button>
    );
}
