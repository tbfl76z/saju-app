"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PenLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ReportRenderer } from "@/components/ReportRenderer";
import { listProfiles, type SavedProfile } from "@/lib/storage";
import { gradeInterpretation, awardXp } from "@/lib/learn";

const PLACEHOLDER =
    "예시 흐름: ① 일간과 오행 — \"이 사주의 일간은 ○○이고, 오행은 ○이 많고 ○이 없다\" ② 월지와 계절 — 사주의 온도 ③ 십성 배치 — 재·관·인·식이 어디에 있는가 ④ 합충 — 글자들 사이의 사건 ⑤ 종합 — 이 사람은 어떤 사람이고 무엇이 강점인가";

// 통변 훈련 — 명식을 보고 해석을 서술하면 AI 선생님이 채점한다 (50자 이상)
export default function TongbyeonPage() {
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [profileId, setProfileId] = useState("");
    const [answer, setAnswer] = useState("");
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const list = listProfiles();
        setProfiles(list);
        if (list.length > 0) setProfileId(list[0].id);
    }, []);

    if (!mounted) return null;

    const selected = profiles.find((p) => p.id === profileId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pillars: any = selected?.sajuData?.pillars;
    const pNames: Record<string, string> = { hour: "시주", day: "일주", month: "월주", year: "연주" };

    const submit = async () => {
        if (!selected || answer.trim().length < 50 || loading) return;
        setLoading(true);
        setError("");
        setResult("");
        try {
            const res = await gradeInterpretation(selected.sajuData, answer);
            setResult(res);
            awardXp(30); // 통변 훈련 1회 제출 보상
        } catch (e) {
            setError(
                e instanceof Error && e.message === "rate"
                    ? "제출이 너무 잦아요. 1분 후 다시 시도해 주세요."
                    : "채점에 실패했습니다. 잠시 후 다시 시도해 주세요."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-6 pb-24 space-y-6">
            <div className="pt-8">
                <Link href="/learn" className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-[#bf953f]">
                    <ArrowLeft className="h-4 w-4" /> 커리큘럼
                </Link>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">🖋️ 통변 훈련</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    명식을 보고 직접 해석을 써보세요 — AI 선생님이 100점 만점으로 채점해 드립니다
                </p>
            </div>

            {profiles.length === 0 ? (
                <div className="glass-card p-10 text-center space-y-4">
                    <p className="text-slate-600 dark:text-slate-300">저장된 명식이 없습니다.</p>
                    <p className="text-sm text-slate-500">홈에서 명식을 계산해 저장하면, 그 사주로 해석 훈련을 할 수 있어요.</p>
                    <Link href="/">
                        <Button className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white">명식 계산하러 가기 →</Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* 명식 선택 + 표시 */}
                    <div className="glass-card p-5 space-y-4">
                        <Select value={profileId} onValueChange={(v) => { setProfileId(v); setResult(""); }}>
                            <SelectTrigger className="rounded-xl glass-card border-white/40 max-w-xs mx-auto">
                                <SelectValue placeholder="명식 선택" />
                            </SelectTrigger>
                            <SelectContent className="glass-card border-none shadow-xl">
                                {profiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {pillars && (
                            <div className="grid grid-cols-4 gap-2 text-center">
                                {(["hour", "day", "month", "year"] as const).map((k) => (
                                    <div key={k} className="rounded-xl border border-[#d4af37]/25 bg-white/50 dark:bg-slate-900/40 py-3">
                                        <p className="text-[10px] font-bold text-slate-400 mb-1">{pNames[k]}</p>
                                        <p className="text-xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">
                                            {pillars[k]?.pillar ?? "–"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-xs text-slate-400 text-center">
                            힌트가 필요하면 홈 화면에서 이 명식의 상세 분석표를 먼저 살펴보고 와도 좋아요.
                        </p>
                    </div>

                    {/* 답안 작성 */}
                    <div className="glass-card p-5 space-y-3">
                        <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                            <PenLine className="h-5 w-5 text-[#bf953f]" /> 나의 해석 (50자 이상)
                        </p>
                        <textarea
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder={PLACEHOLDER}
                            rows={8}
                            className="w-full rounded-xl border border-[#d4af37]/30 bg-white/60 dark:bg-slate-900/40 px-4 py-3 text-sm leading-relaxed outline-none focus:border-[#d4af37] resize-y"
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">{answer.trim().length}자</span>
                            <Button
                                onClick={submit}
                                disabled={loading || answer.trim().length < 50}
                                className="rounded-xl bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white font-bold"
                            >
                                {loading ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 채점 중…</>) : "채점 받기 (+30 XP)"}
                            </Button>
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                    </div>

                    {/* 채점 결과 */}
                    {result && <ReportRenderer text={result} />}
                </div>
            )}
        </div>
    );
}
