"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DailyFortune } from "@/components/DailyFortune";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { listProfiles, type SavedProfile } from "@/lib/storage";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 저장된 명식 기준으로 오늘의 운세를 보여주는 독립 라우트
export default function TodayPage() {
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const list = listProfiles();
        setProfiles(list);
        if (list.length > 0) setSelectedId(list[0].id);
    }, []);

    if (!mounted) return null;

    const selected = profiles.find((p) => p.id === selectedId);

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center space-y-3 py-5 md:py-10">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">🌅 오늘의 운세</h2>
                <p className="text-slate-600 dark:text-slate-400">저장된 명식을 선택하면 오늘 하루의 흐름을 살펴드립니다.</p>
            </div>

            {profiles.length === 0 ? (
                <div className="glass-card p-10 text-center space-y-4">
                    <p className="text-slate-600 dark:text-slate-300">저장된 명식이 없습니다.</p>
                    <Link href="/">
                        <Button className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white">명식 계산하러 가기 →</Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="max-w-xs mx-auto">
                        <Select value={selectedId} onValueChange={setSelectedId}>
                            <SelectTrigger className="rounded-xl glass-card border-white/40">
                                <SelectValue placeholder="명식 선택" />
                            </SelectTrigger>
                            <SelectContent className="glass-card border-none shadow-xl">
                                {profiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selected && (
                        <DailyFortune key={selected.id} sajuData={selected.sajuData} apiBase={API_BASE} />
                    )}
                </div>
            )}
        </div>
    );
}
