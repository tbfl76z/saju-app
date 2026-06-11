"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Star, CheckCircle2, RotateCcw, Compass, BarChart3, CloudUpload, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    fetchCurriculum, getProgress, countSrs, getChapterStats,
    exportLearnBackup, importLearnBackup,
    type ChapterSummary, type LearnProgress, type ChapterStat,
} from "@/lib/learn";

// 학습 모드 홈 — 오늘의 학습 루틴 + 커리큘럼 맵 + 약점 통계 + 진도 백업
export default function LearnPage() {
    const [chapters, setChapters] = useState<ChapterSummary[]>([]);
    const [progress, setProgress] = useState<LearnProgress | null>(null);
    const [due, setDue] = useState(0);
    const [stats, setStats] = useState<ChapterStat[]>([]);
    const [error, setError] = useState("");
    // 백업/복원 상태
    const [backupCode, setBackupCode] = useState("");
    const [restoreInput, setRestoreInput] = useState("");
    const [backupBusy, setBackupBusy] = useState(false);
    const [backupMsg, setBackupMsg] = useState("");

    useEffect(() => {
        setProgress(getProgress());
        setDue(countSrs().due);
        setStats(getChapterStats());
        fetchCurriculum()
            .then(setChapters)
            .catch(() => setError("커리큘럼을 불러오지 못했습니다. 서버 상태를 확인해 주세요."));
    }, []);

    if (!progress) return null;

    const passedCount = chapters.filter((c) => progress.chapters[c.id]?.passed).length;
    const hasAnyRecord = Object.keys(progress.chapters).length > 0;
    // 이어서 학습: 아직 통과 못 한 첫 챕터
    const nextChapter = chapters.find((c) => !progress.chapters[c.id]?.passed);
    const titleOf = (id: string) => chapters.find((c) => c.id === id)?.title ?? id;

    const doBackup = async () => {
        setBackupBusy(true);
        setBackupMsg("");
        try {
            const code = await exportLearnBackup();
            setBackupCode(code);
        } catch {
            setBackupMsg("백업에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setBackupBusy(false);
        }
    };

    const doRestore = async () => {
        if (!restoreInput.trim()) return;
        setBackupBusy(true);
        setBackupMsg("");
        try {
            await importLearnBackup(restoreInput);
            setProgress(getProgress());
            setDue(countSrs().due);
            setStats(getChapterStats());
            setBackupMsg("✅ 복원 완료! 진도와 복습 카드를 불러왔습니다.");
            setRestoreInput("");
        } catch {
            setBackupMsg("복원 코드를 찾을 수 없습니다. 코드를 확인해 주세요.");
        } finally {
            setBackupBusy(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-3 py-5 md:py-10">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">📚 사주 공부하기</h2>
                <p className="text-slate-600 dark:text-slate-400">
                    음양오행부터 실전 명식 읽기까지 — 내 사주로 배우는 명리학
                </p>
            </div>

            {/* 학습 현황 헤더 */}
            <div className="glass-card p-5 mb-4 grid grid-cols-3 gap-3 text-center">
                <div>
                    <p className="flex items-center justify-center gap-1 text-xl md:text-2xl font-bold text-[#bf953f]">
                        <Star className="h-5 w-5" /> {progress.xp}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">경험치 XP</p>
                </div>
                <div>
                    <p className="flex items-center justify-center gap-1 text-xl md:text-2xl font-bold text-orange-500">
                        <Flame className="h-5 w-5" /> {progress.streak}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">연속 학습일</p>
                </div>
                <div>
                    <p className="text-xl md:text-2xl font-bold text-emerald-600">{passedCount}<span className="text-sm text-slate-400">/{chapters.length || 10}</span></p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">완료 챕터</p>
                </div>
            </div>

            {/* 레벨 테스트 배너 (학습 기록이 없을 때 크게, 있으면 작게) */}
            {!hasAnyRecord ? (
                <Link href="/learn/placement" className="block glass-card p-5 mb-4 border-[#d4af37]/50 hover:border-[#d4af37] transition-colors">
                    <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-50">
                        <Compass className="h-5 w-5 text-[#bf953f]" /> 처음이신가요? 레벨 테스트로 시작하기
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">챕터별 1문항 진단으로 내 수준에 맞는 시작 챕터를 추천받아요 →</p>
                </Link>
            ) : (
                <div className="text-right mb-2">
                    <Link href="/learn/placement" className="text-xs font-bold text-slate-400 hover:text-[#bf953f]">
                        <Compass className="inline h-3.5 w-3.5 mr-0.5" />레벨 테스트 다시 보기
                    </Link>
                </div>
            )}

            {/* 오늘의 학습 루틴 */}
            <div className="glass-card p-5 mb-8 space-y-3">
                <p className="font-bold text-slate-900 dark:text-slate-50">☀️ 오늘의 학습</p>
                <Link
                    href="/learn/review"
                    className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                        due > 0
                            ? "border-orange-300/60 hover:bg-orange-50/40 dark:hover:bg-orange-950/20"
                            : "border-slate-200/50 dark:border-slate-700 opacity-60"
                    )}
                >
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                        <RotateCcw className="h-4 w-4 text-orange-500" /> 1단계 · 복습
                    </span>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {due > 0 ? `오늘 복습할 카드 ${due}장 →` : "복습 카드 없음 ✓"}
                    </span>
                </Link>
                {nextChapter ? (
                    <Link
                        href={`/learn/${nextChapter.id}`}
                        className="flex items-center justify-between rounded-xl border border-[#d4af37]/40 px-4 py-3 hover:bg-[#d4af37]/10 transition-colors"
                    >
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                            {nextChapter.emoji} 2단계 · 이어서 학습
                        </span>
                        <span className="text-xs font-semibold text-[#bf953f]">{nextChapter.order + 1}. {nextChapter.title} →</span>
                    </Link>
                ) : (
                    chapters.length > 0 && (
                        <p className="text-sm text-emerald-600 font-bold text-center py-1">🎓 전 챕터 완료! 복습과 통변 훈련으로 실력을 다져보세요.</p>
                    )
                )}
                <Link
                    href="/learn/tongbyeon"
                    className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-slate-700 px-4 py-3 hover:bg-[#d4af37]/10 hover:border-[#d4af37]/40 transition-colors"
                >
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                        🖋️ 도전 · 통변 훈련
                    </span>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">내 해석을 AI가 채점 (+30 XP) →</span>
                </Link>
            </div>

            {error && <p className="text-center text-red-500 mb-6">{error}</p>}

            {/* 커리큘럼 맵 */}
            <div className="space-y-3">
                {chapters.map((ch) => {
                    const st = progress.chapters[ch.id];
                    return (
                        <Link key={ch.id} href={`/learn/${ch.id}`} className="block">
                            <div className="glass-card flex items-center gap-4 p-5 transition-all hover:border-[#d4af37]/60 hover:-translate-y-0.5">
                                <span className="text-2xl md:text-3xl shrink-0">{ch.emoji}</span>
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

            {/* 약점 분석 */}
            {stats.some((s) => s.totalQ > 0) && (
                <div className="glass-card p-5 mt-8 space-y-3">
                    <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-50">
                        <BarChart3 className="h-5 w-5 text-[#bf953f]" /> 약점 분석 — 챕터별 누적 정답률
                    </p>
                    {stats
                        .filter((s) => s.totalQ > 0)
                        .sort((a, b) => a.accuracy - b.accuracy)
                        .map((s) => (
                            <div key={s.chapterId} className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    <span>
                                        {titleOf(s.chapterId)}
                                        {s.srsCount > 0 && <span className="text-orange-500 ml-1.5">복습 {s.srsCount}장</span>}
                                    </span>
                                    <span className={s.accuracy < 70 ? "text-red-500" : "text-slate-500"}>{s.accuracy}% ({s.totalQ}문항)</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full", s.accuracy < 70 ? "bg-red-400" : "bg-gradient-to-r from-[#d4af37] to-[#bf953f]")}
                                        style={{ width: `${s.accuracy}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    <p className="text-xs text-slate-400">정답률이 낮은 챕터부터 다시 풀어보세요. 빨간 막대는 70% 미만입니다.</p>
                </div>
            )}

            {/* 진도 백업/복원 */}
            <div className="glass-card p-5 mt-4 space-y-3">
                <p className="font-bold text-slate-900 dark:text-slate-50">💾 진도 백업 · 복원</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    학습 기록은 이 브라우저에만 저장됩니다. 기기를 바꾸기 전에 백업 코드를 만들어 두세요.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button onClick={doBackup} disabled={backupBusy} variant="outline" className="rounded-xl flex-1">
                        <CloudUpload className="h-4 w-4 mr-1" /> 백업 코드 만들기
                    </Button>
                    <div className="flex gap-2 flex-1">
                        <input
                            value={restoreInput}
                            onChange={(e) => setRestoreInput(e.target.value)}
                            placeholder="복원 코드 입력"
                            className="flex-1 min-w-0 rounded-xl border border-[#d4af37]/30 bg-white/60 dark:bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-[#d4af37]"
                        />
                        <Button onClick={doRestore} disabled={backupBusy || !restoreInput.trim()} variant="outline" className="rounded-xl shrink-0">
                            <CloudDownload className="h-4 w-4 mr-1" /> 복원
                        </Button>
                    </div>
                </div>
                {backupCode && (
                    <div className="rounded-xl bg-[#d4af37]/10 p-3 text-sm">
                        백업 코드: <strong className="font-mono select-all">{backupCode}</strong>
                        <button
                            onClick={() => navigator.clipboard?.writeText(backupCode)}
                            className="ml-2 text-xs font-bold text-[#bf953f]"
                        >
                            복사
                        </button>
                        <p className="text-xs text-slate-500 mt-1">새 기기의 이 화면에서 코드를 입력하면 진도가 복원됩니다.</p>
                    </div>
                )}
                {backupMsg && <p className="text-sm text-slate-600 dark:text-slate-300">{backupMsg}</p>}
            </div>
        </div>
    );
}
