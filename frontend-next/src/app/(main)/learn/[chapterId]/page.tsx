"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Trophy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptBody } from "@/components/learn/ConceptBody";
import { QuizRunner } from "@/components/learn/QuizRunner";
import { TutorPanel } from "@/components/learn/TutorPanel";
import {
    fetchChapter, fetchQuiz, recordQuizResult, PASS_SCORE,
    type ChapterDetail, type QuizItem,
} from "@/lib/learn";

type Stage = "concept" | "quiz" | "result";

// 챕터 학습 — 개념 카드 → 퀴즈(즉각 피드백) → 결과(통과 시 다음 챕터 해제)
export default function ChapterPage() {
    const { chapterId } = useParams<{ chapterId: string }>();
    const router = useRouter();

    const [chapter, setChapter] = useState<ChapterDetail | null>(null);
    const [stage, setStage] = useState<Stage>("concept");
    const [cardIdx, setCardIdx] = useState(0);
    const [quiz, setQuiz] = useState<QuizItem[]>([]);
    const [quizLoading, setQuizLoading] = useState(false);
    const [result, setResult] = useState<{ score: number; correct: number; wrong: QuizItem[] } | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!chapterId) return;
        fetchChapter(chapterId)
            .then(setChapter)
            .catch(() => setError("챕터를 불러오지 못했습니다."));
    }, [chapterId]);

    const startQuiz = async () => {
        setQuizLoading(true);
        setError("");
        try {
            const items = await fetchQuiz(chapterId, 10);
            setQuiz(items);
            setStage("quiz");
        } catch {
            setError("퀴즈를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setQuizLoading(false);
        }
    };

    const finishQuiz = (correct: number, wrongItems: QuizItem[]) => {
        const score = Math.round((correct / quiz.length) * 100);
        recordQuizResult(chapterId, score, wrongItems);
        setResult({ score, correct, wrong: wrongItems });
        setStage("result");
    };

    if (error && !chapter) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-4">
                <p className="text-red-500">{error}</p>
                <Link href="/learn" className="text-[#bf953f] font-bold">← 커리큘럼으로</Link>
            </div>
        );
    }
    if (!chapter) return <p className="text-center text-slate-400 py-16">불러오는 중…</p>;

    const card = chapter.cards[cardIdx];
    const isLastCard = cardIdx === chapter.cards.length - 1;
    const passed = (result?.score ?? 0) >= PASS_SCORE;
    // 틀린 문제 요약 — 튜터에게 학습 상황으로 전달
    const wrongHint = result?.wrong.length
        ? `방금 퀴즈에서 틀린 문제: ${result.wrong.map((w) => w.question).join(" / ").slice(0, 400)}`
        : undefined;

    return (
        <div className="max-w-3xl mx-auto px-6 pb-24 space-y-6">
            <div className="flex items-center justify-between pt-8">
                <Link href="/learn" className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#bf953f]">
                    <ArrowLeft className="h-4 w-4" /> 커리큘럼
                </Link>
                <p className="text-sm font-semibold text-slate-400">
                    {chapter.order + 1}장 / 전체 {chapter.total}장
                </p>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">
                    {chapter.emoji} {chapter.title}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{chapter.subtitle}</p>
            </div>

            {/* 1) 개념 카드 학습 */}
            {stage === "concept" && card && (
                <div className="space-y-5">
                    <div className="flex justify-center gap-1.5">
                        {chapter.cards.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCardIdx(i)}
                                className={`h-2 rounded-full transition-all ${i === cardIdx ? "w-6 bg-[#d4af37]" : "w-2 bg-slate-300 dark:bg-slate-700"}`}
                                aria-label={`카드 ${i + 1}`}
                            />
                        ))}
                    </div>

                    <div className="glass-card p-7 space-y-4 min-h-[300px]">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 font-noto-serif">
                            {cardIdx + 1}. {card.title}
                        </h3>
                        <ConceptBody body={card.body} />
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            disabled={cardIdx === 0}
                            onClick={() => setCardIdx(cardIdx - 1)}
                            className="rounded-xl flex-1"
                        >
                            <ArrowLeft className="h-4 w-4 mr-1" /> 이전
                        </Button>
                        {isLastCard ? (
                            <Button
                                onClick={startQuiz}
                                disabled={quizLoading}
                                className="rounded-xl flex-[2] bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                            >
                                {quizLoading ? "퀴즈 준비 중…" : "✏️ 확인 퀴즈 시작 (10문항)"}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => setCardIdx(cardIdx + 1)}
                                className="rounded-xl flex-[2] bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                            >
                                다음 <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                        )}
                    </div>
                    {error && <p className="text-center text-sm text-red-500">{error}</p>}
                </div>
            )}

            {/* 2) 퀴즈 */}
            {stage === "quiz" && <QuizRunner items={quiz} onFinish={finishQuiz} />}

            {/* 3) 결과 */}
            {stage === "result" && result && (
                <div className="space-y-5">
                    <div className="glass-card p-8 text-center space-y-4">
                        <Trophy className={`h-12 w-12 mx-auto ${passed ? "text-[#d4af37]" : "text-slate-300 dark:text-slate-600"}`} />
                        <p className="text-4xl font-bold text-slate-900 dark:text-slate-50">{result.score}점</p>
                        <p className="text-slate-600 dark:text-slate-300">
                            {quiz.length}문항 중 <strong>{result.correct}개</strong> 정답
                        </p>
                        {passed ? (
                            <p className="font-bold text-emerald-600">🎉 통과! 다음 챕터가 열렸습니다.</p>
                        ) : (
                            <p className="font-semibold text-slate-500">
                                {PASS_SCORE}점 이상이면 통과예요. 개념을 다시 보고 도전해 보세요!
                            </p>
                        )}
                        {result.wrong.length > 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                틀린 {result.wrong.length}문항은 <Link href="/learn/review" className="text-[#bf953f] font-bold">복습 카드</Link>에 담아두었습니다.
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => { setStage("concept"); setCardIdx(0); setResult(null); }}
                            className="rounded-xl flex-1"
                        >
                            <RotateCcw className="h-4 w-4 mr-1" /> 개념 다시 보기
                        </Button>
                        {passed ? (
                            <Button
                                onClick={() => router.push("/learn")}
                                className="rounded-xl flex-1 bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                            >
                                다음 챕터로 →
                            </Button>
                        ) : (
                            <Button
                                onClick={startQuiz}
                                disabled={quizLoading}
                                className="rounded-xl flex-1 bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                            >
                                재도전 (새 문제)
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* AI 튜터 — 모든 단계에서 사용 가능 */}
            <TutorPanel chapterId={chapterId} contextHint={wrongHint} />
        </div>
    );
}
