"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { streamSSE } from "@/lib/analyzeStream";
import { ReportRenderer } from "@/components/ReportRenderer";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 해석 후 대화형 후속 질문 — 이전 해석(prev)을 맥락으로 추가 질문에 답한다.
export function FollowupChat({ prev }: { prev: string }) {
    const [q, setQ] = useState("");
    const [turns, setTurns] = useState<{ q: string; a: string }[]>([]);
    const [running, setRunning] = useState(false);

    async function ask() {
        const question = q.trim();
        if (!question || running) return;
        setQ("");
        const idx = turns.length;
        setTurns((t) => [...t, { q: question, a: "" }]);
        setRunning(true);
        try {
            await streamSSE(`${API_BASE}/classic/followup`, { prev, question }, (acc) => {
                setTurns((t) => t.map((x, i) => (i === idx ? { ...x, a: acc } : x)));
            });
        } catch {
            setTurns((t) => t.map((x, i) => (i === idx ? { ...x, a: "답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." } : x)));
        } finally { setRunning(false); }
    }

    return (
        <div className="glass-card p-4 space-y-3">
            <div className="text-sm font-semibold text-[#bf953f]">💬 더 궁금한 점 물어보기</div>
            {turns.map((t, i) => (
                <div key={i} className="space-y-1">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Q. {t.q}</div>
                    <div className="pl-3 border-l-2 border-[#d4af37]/40">
                        <ReportRenderer text={t.a} streaming={running && i === turns.length - 1} />
                    </div>
                </div>
            ))}
            <div className="flex gap-2">
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                    placeholder="예: 올해 이직해도 될까요?"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm"
                />
                <Button onClick={ask} disabled={running || !q.trim()}>{running ? "…" : "질문"}</Button>
            </div>
        </div>
    );
}
