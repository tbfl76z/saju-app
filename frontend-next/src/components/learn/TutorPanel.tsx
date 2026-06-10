"use client";

import { useState } from "react";
import { GraduationCap, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { streamTutor } from "@/lib/learn";
import { ConceptBody } from "./ConceptBody";

// AI 튜터 패널 — 챕터 학습/복습 중 모르는 것을 질문하면 스트리밍으로 답한다.
interface TutorPanelProps {
    chapterId?: string;
    contextHint?: string; // 틀린 문제 등 학습 상황
    placeholder?: string;
}

export function TutorPanel({ chapterId, contextHint, placeholder }: TutorPanelProps) {
    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const ask = async () => {
        const q = question.trim();
        if (!q || loading) return;
        setLoading(true);
        setError("");
        setAnswer("");
        try {
            await streamTutor(q, chapterId, contextHint, setAnswer);
        } catch {
            setError("선생님과 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card p-5 space-y-4">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between text-left"
            >
                <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                    <GraduationCap className="h-5 w-5 text-[#bf953f]" />
                    AI 선생님께 질문하기
                </span>
                <span className="text-slate-400 text-sm">{open ? "접기 ▲" : "펼치기 ▼"}</span>
            </button>

            {open && (
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && ask()}
                            placeholder={placeholder || "예: 식신과 상관의 차이가 뭐예요?"}
                            className="flex-1 rounded-xl border border-[#d4af37]/30 bg-white/60 dark:bg-slate-900/40 px-4 py-2.5 text-sm outline-none focus:border-[#d4af37]"
                        />
                        <Button
                            onClick={ask}
                            disabled={loading || !question.trim()}
                            className="rounded-xl bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white shrink-0"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                    {answer && (
                        <div className="rounded-2xl border border-[#d4af37]/25 bg-white/50 dark:bg-slate-900/40 p-4 text-sm">
                            <ConceptBody body={answer} />
                            {loading && <span className="inline-block w-2 h-4 mt-1 bg-[#d4af37] animate-pulse" />}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
