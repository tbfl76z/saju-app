"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Star, CheckCircle2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    fetchCurriculum, getProgress, countSrs,
    type ChapterSummary, type LearnProgress,
} from "@/lib/learn";

// 학습 모드 홈 — 커리큘럼 맵 (챕터 잠금 해제 방식) + XP·스트릭·복습 현황
export default function LearnPage() {
    const [chapters, setChapters] = useState<ChapterSummary[]>([]);
    const [progress, setProgress] = useState<LearnProgress | null>(null);
    const [due, setDue] = useState(0);
    const [error, setError] = useState("");

    useEffect(() => {
        setProgress(getProgress());
        setDue(countSrs().due);
        fetchCurriculum()
            .then(setChapters)
            .catch(() => setError("커리큘럼을 불러오지 못했습니다. 서버 상태를 확인해 주세요."));
    }, []);

    if (!progress) return null;

    const passedCount = chapters.filter((c) => progress.chapters[c.id]?.passed).length;

    return (
        <div className="max-w-3xl mx-auto px-6 pb-24">
            <div className="text-center space-y-3 py-10">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">📚 사주 공부하기</h2>
                <p className="text-slate-600 dark:text-slate-400">
                    음양오행부터 실전 명식 읽기까지 — 내 사주로 배우는 명리학
                </p>
            </div>

            {/* 학습 현황 헤더 */}
            <div className="glass-card p-5 mb-6 grid grid-cols-3 gap-3 text-center">
                <div>
                    <p className="flex items-center justify-center gap-1 text-2xl font-bold text-[#bf953f]">
                        <Star className="h-5 w-5" /> {progress.xp}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">경험치 XP</p>
                </div>
                <div>
                    <p className="flex items-center justify-center gap-1 text-2xl font-bold text-orange-500">
                        <Flame className="h-5 w-5" /> {progress.streak}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">연속 학습일</p>
                </div>
                <div>
                    <p className="text-2xl font-bold text-emerald-600">{passedCount}<span className="text-sm text-slate-400">/{chapters.length || 10}</span></p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">완료 챕터</p>
                </div>
            </div>

            {/* 복습 알림 */}
            <Link
                href="/learn/review"
                className={cn(
                    "glass-card flex items-center justify-between p-4 mb-8 transition-colors",
                    due > 0 ? "border-orange-300/60 hover:bg-orange-50/40 dark:hover:bg-orange-950/20" : "opacity-70"
                )}
            >
                <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                    <RotateCcw className="h-5 w-5 text-orange-500" /> 복습하기
                </span>
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {due > 0 ? `오늘 복습할 카드 ${due}장 →` : "복습할 카드가 없습니다"}
                </span>
            </Link>

            {error && <p className="text-center text-red-500 mb-6">{error}</p>}

            {/* 커리큘럼 맵 */}
            <div className="space-y-3">
                {chapters.map((ch) => {
                    const st = progress.chapters[ch.id];
                    return (
                        <Link key={ch.id} href={`/learn/${ch.id}`}>
                            <div className="glass-card flex items-center gap-4 p-5 transition-all hover:border-[#d4af37]/60 hover:-translate-y-0.5">
                                <span className="text-3xl shrink-0">{ch.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                                        {ch.order + 1}. {ch.title}
                                        {st?.passed && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                                    </p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{ch.subtitle}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    {st ? (
                                        <p className="text-sm font-bold text-[#bf953f]">{st.bestScore}점</p>
                                    ) : (
                                        <p className="text-xs font-semibold text-slate-400">시작 →</p>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {chapters.length === 0 && !error && (
                <div className="text-center text-slate-400 py-10 space-y-2">
                    <p className="animate-pulse">커리큘럼을 불러오는 중…</p>
                    <p className="text-xs">잠들어 있던 서버를 깨우는 중이면 최대 1분쯤 걸릴 수 있어요.<br />한 번 불러온 뒤에는 바로 열립니다.</p>
                </div>
            )}
        </div>
    );
}
