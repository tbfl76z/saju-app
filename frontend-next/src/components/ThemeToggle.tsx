"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// 라이트/다크 토글 버튼. 헤더 우측에 배치하며 골드 톤을 유지한다.
export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // 하이드레이션 불일치 방지: 마운트 후에만 실제 아이콘 렌더
    useEffect(() => setMounted(true), []);

    const isDark = resolvedTheme === "dark";

    return (
        <Button
            variant="outline"
            size="icon"
            aria-label="테마 전환"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="rounded-full border-white/40 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-slate-700/60"
        >
            {mounted && isDark ? (
                <Sun className="h-5 w-5 text-[#d4af37]" />
            ) : (
                <Moon className="h-5 w-5 text-slate-600 dark:text-slate-200" />
            )}
        </Button>
    );
}
