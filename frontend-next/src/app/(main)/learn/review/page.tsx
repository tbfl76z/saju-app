"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TutorPanel } from "@/components/learn/TutorPanel";
import { listDueCards, reviewCard, countSrs, type SrsCard } from "@/lib/learn";

// 복습 — 틀린 문제를 SM-2 간격 반복으로 다시 풀기.
// 답을 확인한 뒤 스스로 평가(몰랐다/헷갈렸다/알았다)하면 다음 복습 일정이 잡힌다.
export default function ReviewPage() {
    const [cards, setCards] = useState<SrsCard[]>([]);
    const [idx, setIdx] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [doneCount, setDoneCount] = useState(0);
    const [totalInfo, setTotalInfo] = useState({ total: 0, due: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setCards(listDueCards());
        setTotalInfo(countSrs());
    }, []);

    if (!mounted) return null;

    const card = cards[idx];
    const answered = selected !== null;
    const isCorrect = answered && selected === card?.answer;

    // 자기 평가 → SM-2 갱신 → 다음 카드
    const rate = (quality: 1 | 3 | 5) => {
        if (!card) return;
        reviewCard(card.key, quality);
        setDoneCount((c) => c + 1);
        setSelected(null);
        setIdx((i) => i + 1);
    };

    return (
        <div className="max-w-3xl mx-auto px-6 pb-24 space-y-6">
            <div className="flex items-center justify-between pt-8">
                <Link href="/learn" className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#bf953f]">
                    <ArrowLeft className="h-4 w-4" /> 커리큘럼
                </Link>
                <p className="text-sm font-semibold text-slate-400">전체 복습 카드 {totalInfo.total}장</p>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">🔁 복습하기</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    틀렸던 문제를 잊을 때쯤 다시 — 간격 반복으로 오래 기억해요
                </p>
            </div>

            {!card ? (
                <div className="glass-card p-10 text-center space-y-4">
                    <RotateCcw className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
                    {doneCount > 0 ? (
                        <>
                            <p className="font-bold text-emerald-600 text-lg">오늘의 복습 완료! ({doneCount}장)</p>
                            <p className="text-sm text-slate-500">다음 복습 일정에 다시 만나요.</p>
                        </>
                    ) : (
                        <p className="text-slate-500">지금 복습할 카드가 없습니다. 퀴즈에서 틀린 문제가 자동으로 쌓여요.</p>
                    )}
                    <Link href="/learn">
                        <Button className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white mt-2">
                            커리큘럼으로 →
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-5">
                    <p className="text-center text-sm font-bold text-slate-400">
                        {doneCount + 1} / {cards.length}
                    </p>

                    <div className="glass-card p-6 space-y-5">
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-relaxed">{card.question}</p>

                        <div className="grid gap-2.5">
                            {card.choices.map((choice, i) => {
                                const showCorrect = answered && i === card.answer;
                                const showWrong = answered && i === selected && !isCorrect;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => !answered && setSelected(i)}
                                        disabled={answered}
                                        className={cn(
                                            "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors",
                                            showCorrect
                                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                                : showWrong
                                                    ? "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300"
                                                    : answered
                                                        ? "border-slate-200/60 dark:border-slate-700 text-slate-400"
                                                        : "border-[#d4af37]/30 bg-white/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:border-[#d4af37] hover:bg-[#d4af37]/10"
                                        )}
                                    >
                                        {choice}
                                    </button>
                                );
                            })}
                        </div>

                        {answered && (
                            <>
                                <div className="rounded-xl bg-slate-100/80 dark:bg-slate-800/60 p-4 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                                    {card.explanation}
                                </div>
                                <div className="space-y-2">
                                    <p className="text-center text-xs font-bold text-slate-400">얼마나 잘 기억하고 있었나요?</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Button variant="outline" onClick={() => rate(1)} className="rounded-xl border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                                            😵 몰랐다
                                        </Button>
                                        <Button variant="outline" onClick={() => rate(3)} className="rounded-xl border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                                            🤔 헷갈렸다
                                        </Button>
                                        <Button variant="outline" onClick={() => rate(5)} className="rounded-xl border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                                            😎 알았다
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <TutorPanel chapterId={card?.chapterId} placeholder="이 문제가 왜 이렇게 되는지 물어보세요" />
        </div>
    );
}
