"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizItem } from "@/lib/learn";

// 퀴즈 러너 — 1문항씩 출제, 선택 즉시 정오 피드백+해설, 완료 시 결과 콜백 (듀오링고형 즉각 피드백 루프)
interface QuizRunnerProps {
    items: QuizItem[];
    onFinish: (correct: number, wrongItems: QuizItem[]) => void;
}

export function QuizRunner({ items, onFinish }: QuizRunnerProps) {
    const [idx, setIdx] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongItems, setWrongItems] = useState<QuizItem[]>([]);

    const item = items[idx];
    if (!item) return null;
    const answered = selected !== null;
    const isCorrect = selected === item.answer;
    const isLast = idx === items.length - 1;

    const choose = (i: number) => {
        if (answered) return;
        setSelected(i);
        if (i === item.answer) setCorrectCount((c) => c + 1);
        else setWrongItems((w) => [...w, item]);
    };

    const next = () => {
        if (isLast) {
            onFinish(correctCount, wrongItems);
            return;
        }
        setIdx(idx + 1);
        setSelected(null);
    };

    return (
        <div className="space-y-5">
            {/* 진행 바 */}
            <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] transition-all"
                        style={{ width: `${((idx + (answered ? 1 : 0)) / items.length) * 100}%` }}
                    />
                </div>
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400 shrink-0">
                    {idx + 1} / {items.length}
                </span>
            </div>

            {/* 문제 */}
            <div className="glass-card p-6 space-y-5">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-relaxed">
                    Q{idx + 1}. {item.question}
                </p>

                <div className="grid gap-2.5">
                    {item.choices.map((choice, i) => {
                        const showCorrect = answered && i === item.answer;
                        const showWrong = answered && i === selected && !isCorrect;
                        return (
                            <button
                                key={i}
                                onClick={() => choose(i)}
                                disabled={answered}
                                className={cn(
                                    "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors",
                                    showCorrect
                                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                        : showWrong
                                            ? "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300"
                                            : answered
                                                ? "border-slate-200/60 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                                                : "border-[#d4af37]/30 bg-white/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:border-[#d4af37] hover:bg-[#d4af37]/10"
                                )}
                            >
                                <span>{choice}</span>
                                {showCorrect && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                                {showWrong && <XCircle className="h-5 w-5 shrink-0" />}
                            </button>
                        );
                    })}
                </div>

                {/* 즉각 피드백 + 해설 */}
                {answered && (
                    <div
                        className={cn(
                            "rounded-xl p-4 text-sm leading-relaxed",
                            isCorrect
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
                                : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200"
                        )}
                    >
                        <p className="font-bold mb-1">{isCorrect ? "🎉 정답입니다!" : "😅 아쉽네요. 복습 카드에 담아둘게요."}</p>
                        <p>{item.explanation}</p>
                    </div>
                )}

                {answered && (
                    <Button
                        onClick={next}
                        className="w-full rounded-xl bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold py-5"
                    >
                        {isLast ? "결과 보기" : "다음 문제 →"}
                    </Button>
                )}
            </div>
        </div>
    );
}
