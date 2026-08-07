"use client";

import { useEffect, useState } from "react";
import { ALargeSmall } from "lucide-react";

// 글자 크기 조절 — 작게/기본/크게 3단계를 순환한다.
// html의 font-size를 바꿔 rem 기반 전역 텍스트가 함께 스케일된다.
const SCALES = [15, 16, 18] as const; // px
const LABELS = ["작게", "기본", "크게"] as const;
const KEY = "destiny-font-scale";

export function FontSizeToggle() {
    const [idx, setIdx] = useState(1); // 기본(16px)

    // 마운트 시 저장된 단계를 복원해 적용
    useEffect(() => {
        const saved = parseInt(window.localStorage.getItem(KEY) || "", 10);
        const start = Number.isFinite(saved) && saved >= 0 && saved < SCALES.length ? saved : 1;
        setIdx(start);
        document.documentElement.style.fontSize = `${SCALES[start]}px`;
    }, []);

    const cycle = () => {
        const next = (idx + 1) % SCALES.length;
        setIdx(next);
        document.documentElement.style.fontSize = `${SCALES[next]}px`;
        try {
            window.localStorage.setItem(KEY, String(next));
        } catch {
            /* 무시 */
        }
    };

    return (
        <button
            onClick={cycle}
            aria-label={`글자 크기: ${LABELS[idx]} (눌러서 변경)`}
            title={`글자 크기: ${LABELS[idx]}`}
            className="relative inline-flex items-center justify-center h-9 w-9 rounded-full text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors"
        >
            <ALargeSmall className="h-5 w-5" />
            {/* 현재 단계 표시 점 (기본이 아닐 때만) */}
            {idx !== 1 && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#d4af37]" />
            )}
        </button>
    );
}
