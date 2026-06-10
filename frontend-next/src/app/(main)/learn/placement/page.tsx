"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuizRunner } from "@/components/learn/QuizRunner";
import { fetchPlacement, fetchCurriculum, type QuizItem, type ChapterSummary } from "@/lib/learn";

// 레벨 테스트 — 10챕터 × 1문항 진단 후 시작 챕터를 추천한다.
// 진도(XP·통과)에는 기록하지 않는 순수 진단용.
export default function PlacementPage() {
    const [items, setItems] = useState<QuizItem[]>([]);
    const [chapters, setChapters] = useState<ChapterSummary[]>([]);
    const [result, setResult] = useState<{ correct: number; wrong: QuizItem[] } | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        Promise.all([fetchPlacement(), fetchCurriculum()])
            .then(([quiz, cur]) => {
                setItems(quiz);
                setChapters(cur);
            })
            .catch(() => setError("레벨 테스트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }, []);

    const titleOf = (id?: string) => chapters.find((c) => c.id === id);
    // 추천 시작점: 틀린 문항 중 가장 앞 챕터 (전부 맞으면 실전 챕터 추천)
    const wrongIds = new Set((result?.wrong ?? []).map((w) => w.chapter));
    const recommended = result
        ? chapters.find((c) => wrongIds.has(c.id)) ?? chapters[chapters.length - 1]
        : undefined;

    return (
        <div className="max-w-3xl mx-auto px-6 pb-24 space-y-6">
            <div className="flex items-center justify-between pt-8">
                <Link href="/learn" className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#bf953f]">
                    <ArrowLeft className="h-4 w-4" /> 커리큘럼
                </Link>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">🧭 레벨 테스트</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    챕터별 1문항, 총 10문항 — 쉬운 것부터 어려운 순서로 나옵니다
                </p>
            </div>

            {error && <p className="text-center text-red-500">{error}</p>}

            {!result && items.length === 0 && !error && (
                <div className="text-center text-slate-400 py-10 space-y-2">
                    <p className="animate-pulse">문제를 준비하는 중…</p>
                    <p className="text-xs">서버를 깨우는 중이면 최대 1분쯤 걸릴 수 있어요.</p>
                </div>
            )}

            {!result && items.length > 0 && (
                <QuizRunner items={items} onFinish={(correct, wrong) => setResult({ correct, wrong })} />
            )}

            {result && (
                <div className="space-y-5">
                    <div className="glass-card p-8 text-center space-y-3">
                        <Compass className="h-12 w-12 mx-auto text-[#bf953f]" />
                        <p className="text-4xl font-bold text-slate-900 dark:text-slate-50">
                            {result.correct} / {items.length}
                        </p>
                        {recommended && (
                            <p className="text-slate-600 dark:text-slate-300">
                                {result.wrong.length === 0
                                    ? "전부 정답! 실전 챕터부터 시작해도 좋겠어요."
                                    : <>추천 시작점: <strong className="text-[#bf953f]">{recommended.order + 1}. {recommended.title}</strong></>}
                            </p>
                        )}
                    </div>

                    {/* 챕터별 진단표 */}
                    <div className="glass-card p-5 space-y-2">
                        <p className="font-bold text-slate-900 dark:text-slate-50 mb-2">챕터별 진단</p>
                        {items.map((it) => {
                            const ch = titleOf(it.chapter);
                            const isWrong = wrongIds.has(it.chapter);
                            return (
                                <Link
                                    key={it.key}
                                    href={`/learn/${it.chapter}`}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#d4af37]/10 transition-colors"
                                >
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        {ch ? `${ch.order + 1}. ${ch.title}` : it.chapter}
                                    </span>
                                    {isWrong
                                        ? <XCircle className="h-4 w-4 text-red-400" />
                                        : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                </Link>
                            );
                        })}
                    </div>

                    {recommended && (
                        <Link href={`/learn/${recommended.id}`}>
                            <Button className="w-full rounded-xl bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold py-5">
                                {recommended.emoji} {recommended.title}부터 시작하기 →
                            </Button>
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
