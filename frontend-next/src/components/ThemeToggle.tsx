"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// 스킨 3종 순환 토글: 한지(light) → 한지밤하늘(night) → 다크모던(dark)
const SKINS = [
    { key: "light", label: "한지", icon: Sun },
    { key: "night", label: "한지 밤하늘", icon: Sparkles },
    { key: "dark", label: "다크 모던", icon: Moon },
] as const;

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // 하이드레이션 불일치 방지: 마운트 후에만 실제 아이콘 렌더
    useEffect(() => setMounted(true), []);

    const idx = Math.max(0, SKINS.findIndex((s) => s.key === theme));
    const current = SKINS[idx];
    const next = SKINS[(idx + 1) % SKINS.length];
    const Icon = current.icon;

    return (
        <Button
            variant="outline"
            size="icon"
            aria-label={`스킨 전환 (현재: ${current.label}, 다음: ${next.label})`}
            title={`스킨: ${current.label} → ${next.label}`}
            onClick={() => setTheme(next.key)}
            className="rounded-full border-white/40 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-slate-700/60"
        >
            {mounted && (
                <Icon className={`h-5 w-5 ${current.key === "light" ? "text-[#d4af37]" : current.key === "night" ? "text-indigo-400" : "text-[#e6c35c]"}`} />
            )}
        </Button>
    );
}
