"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Trophy, RotateCcw, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptBody } from "@/components/learn/ConceptBody";
import { ChapterGallery } from "@/components/learn/ChapterGallery";
import { QuizRunner } from "@/components/learn/QuizRunner";
import { TutorPanel } from "@/components/learn/TutorPanel";
import {
    fetchChapter, fetchQuiz, fetchPersonalQuiz, recordQuizResult, PASS_SCORE,
    type ChapterDetail, type QuizItem,
} from "@/lib/learn";
import { listProfilesPrimaryFirst, type SavedProfile } from "@/lib/storage";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
    const [showDetail, setShowDetail] = useState(false); // 현재 카드의 '자세히 보기' 펼침 여부
    const [result, setResult] = useState<{ score: number; correct: number; wrong: QuizItem[] } | null>(null);
    const [error, setError] = useState("");
    // 실전 챕터: '내 명식으로 풀기' 용 저장 명식
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [profileId, setProfileId] = useState("");

    useEffect(() => {
        if (!chapterId) return;
        fetchChapter(chapterId)
            .then(setChapter)
            .catch(() => setError("챕터를 불러오지 못했습니다."));
        if (chapterId === "practice") {
            const list = listProfilesPrimaryFirst();
            setProfiles(list);
            if (list.length > 0) setProfileId(list[0].id);
        }
    }, [chapterId]);

    // 카드 이동 시 '자세히 보기'는 접는다
    const goCard = (i: number) => {
        setCardIdx(i);
        setShowDetail(false);
    };

    const startQuiz = async () => {
        setQuizLoading(true);
        setError("");
        try {
            const items = await fetchQuiz(chapterId, 10);
            if (items.length === 0) {
                setError("퀴즈를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                return;
            }
            setQuiz(items);
            setStage("quiz");
        } catch {
            setError("퀴즈를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setQuizLoading(false);
        }
    };

    // 내 명식으로 풀기 (실전 챕터 전용) — 저장 명식 기반 맞춤 퀴즈
    const startPersonalQuiz = async () => {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;
        setQuizLoading(true);
        setError("");
        try {
            const items = await fetchPersonalQuiz(profile.sajuData, 10);
            if (items.length === 0) {
                setError("이 명식으로는 퀴즈를 만들지 못했습니다.");
                return;
            }
            setQuiz(items);
            setStage("quiz");
        } catch {
            setError("내 명식 퀴즈를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setQuizLoading(false);
        }
    };

    const finishQuiz = (correct: number, wrongItems: QuizItem[]) => {
        const score = Math.round((correct / quiz.length) * 100);
        recordQuizResult(chapterId, score, wrongItems, quiz.length);
        setResult({ score, correct, wrong: wrongItems });
        setStage("result");
    };

    if (error && !chapter) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
                <p className="text-red-500">{error}</p>
                <Link href="/learn" className="text-[#bf953f] font-bold">← 커리큘럼으로</Link>
            </div>
        );
    }
    if (!chapter) {
        return (
            <div className="text-center text-slate-400 py-16 space-y-2">
                <p className="animate-pulse">챕터를 불러오는 중…</p>
                <p className="text-xs">서버를 깨우는 중이면 최대 1분쯤 걸릴 수 있어요.</p>
            </div>
        );
    }

    const card = chapter.cards[cardIdx];
    const isLastCard = cardIdx === chapter.cards.length - 1;
    const passed = (result?.score ?? 0) >= PASS_SCORE;
    // 틀린 문제 요약 — 튜터에게 학습 상황으로 전달
    const wrongHint = result?.wrong.length
        ? `방금 퀴즈에서 틀린 문제: ${result.wrong.map((w) => w.question).join(" / ").slice(0, 400)}`
        : undefined;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-6">
            <div className="flex items-center justify-between pt-4 md:pt-8">
                <Link href="/learn" className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#bf953f]">
                    <ArrowLeft className="h-4 w-4" /> 커리큘럼
                </Link>
                <p className="text-sm font-semibold text-slate-400">
                    {chapter.order + 1}장 / 전체 {chapter.total}장
                </p>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">
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
                                onClick={() => goCard(i)}
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

                        {/* 자세히 보기 — 카드 주제의 심화 정리 (서버 내장, 토큰 미사용) */}
                        {card.detail && (
                            <div className="pt-2">
                                <button
                                    onClick={() => setShowDetail(!showDetail)}
                                    className="flex items-center gap-1.5 text-sm font-bold text-[#bf953f] hover:text-[#d4af37] transition-colors"
                                >
                                    <BookOpen className="h-4 w-4" />
                                    {showDetail ? "자세히 보기 접기 ▲" : "📖 자세히 보기 — 심화 정리 ▼"}
                                </button>
                                {showDetail && (
                                    <div className="mt-3 rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/5 dark:bg-slate-900/50 p-5">
                                        <ConceptBody body={card.detail} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            disabled={cardIdx === 0}
                            onClick={() => goCard(cardIdx - 1)}
                            className="rounded-xl flex-1"
                        >
                            <ArrowLeft className="h-4 w-4 mr-1" /> 이전
                        </Button>
                        {isLastCard ? (
                            chapterId === "cheatsheet" ? (
                                <div className="rounded-xl flex-[2] flex items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400 font-semibold px-2">
                                    📖 아래 &apos;조견표 한눈에보기&apos;에서 원본 표를 확인하세요
                                </div>
                            ) : (
                                <Button
                                    onClick={startQuiz}
                                    disabled={quizLoading}
                                    className="rounded-xl flex-[2] bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                                >
                                    {quizLoading ? "퀴즈 준비 중…" : "✏️ 확인 퀴즈 시작 (10문항)"}
                                </Button>
                            )
                        ) : (
                            <Button
                                onClick={() => goCard(cardIdx + 1)}
                                className="rounded-xl flex-[2] bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                            >
                                다음 <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                        )}
                    </div>
                    {/* 실전 챕터: 내 명식으로 풀기 */}
                    {chapterId === "practice" && (
                        <div className="glass-card p-5 space-y-3">
                            <p className="font-bold text-slate-800 dark:text-slate-100">🔮 내 명식으로 풀기</p>
                            {profiles.length === 0 ? (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    저장된 명식이 없습니다. <Link href="/" className="text-[#bf953f] font-bold">홈에서 내 명식을 계산·저장</Link>하면 내 사주로 실전 퀴즈를 풀 수 있어요.
                                </p>
                            ) : (
                                <div className="flex gap-2">
                                    <Select value={profileId} onValueChange={setProfileId}>
                                        <SelectTrigger className="flex-1 rounded-xl glass-card border-white/40">
                                            <SelectValue placeholder="명식 선택" />
                                        </SelectTrigger>
                                        <SelectContent className="glass-card border-none shadow-xl">
                                            {profiles.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        onClick={startPersonalQuiz}
                                        disabled={quizLoading || !profileId}
                                        className="rounded-xl bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold shrink-0"
                                    >
                                        {quizLoading ? "준비 중…" : "풀어보기"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

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
                            <p className="font-bold text-emerald-600">🎉 통과! 이 챕터를 완료했습니다.</p>
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
                            onClick={() => { setStage("concept"); goCard(0); setResult(null); }}
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

            {/* 원전 자료 도표 (퀴즈 중에는 숨김 — 컨닝 방지보다는 집중 유도) */}
            {stage !== "quiz" && <ChapterGallery images={chapter.images} label={chapterId === "cheatsheet" ? "조견표 한눈에보기" : "원전 자료 도표"} defaultOpen={chapterId === "cheatsheet"} />}

            {/* AI 튜터 — 모든 단계에서 사용 가능 */}
            <TutorPanel chapterId={chapterId} contextHint={wrongHint} />
        </div>
    );
}
