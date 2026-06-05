"use client";

import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/ReportRenderer";
import { streamAnalyze, type AnalyzeBody } from "@/lib/analyzeStream";
import { notify } from "@/lib/useToast";

interface AnalyzeButtonsProps {
    apiBase: string;
    // level을 제외한 분석 요청 본문 (saju_data, analysis_type, query, partner_saju_data, target_year)
    body: AnalyzeBody;
    className?: string;
}

// 쉬운 설명 / 고급 풀이 두 가지 수준으로 AI 운세를 풀어주는 공용 버튼+결과 블록
export function AnalyzeButtons({ apiBase, body, className }: AnalyzeButtonsProps) {
    const [result, setResult] = useState("");
    const [running, setRunning] = useState<null | "easy" | "advanced">(null);
    const [shownLevel, setShownLevel] = useState<"easy" | "advanced">("advanced");

    const run = async (level: "easy" | "advanced") => {
        setRunning(level);
        setShownLevel(level);
        setResult("");
        try {
            await streamAnalyze(apiBase, { ...body, level }, setResult);
        } catch {
            setResult("분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
            notify.error("AI 분석에 실패했습니다", "잠시 후 다시 시도해 주세요.");
        } finally {
            setRunning(null);
        }
    };

    return (
        <div className={className}>
            <div className="flex flex-wrap justify-center gap-3">
                <Button
                    onClick={() => run("easy")}
                    disabled={running !== null}
                    variant="outline"
                    className="rounded-full px-6 border-[#d4af37]/40 hover:bg-[#d4af37]/10"
                >
                    <BookOpen className="h-4 w-4 mr-1.5" />
                    {running === "easy" ? "풀이 중..." : "쉬운 설명"}
                </Button>
                <Button
                    onClick={() => run("advanced")}
                    disabled={running !== null}
                    className="rounded-full px-6 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900 dark:hover:bg-[#e6c35c]"
                >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    {running === "advanced" ? "풀이 중..." : "고급 풀이"}
                </Button>
            </div>

            {result && (
                <div className="mt-6 glass-card p-6 md:p-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex items-center gap-2 mb-5">
                        <span className="text-lg">{shownLevel === "easy" ? "📖" : "✨"}</span>
                        <h4 className="text-lg font-bold font-noto-serif text-slate-900 dark:text-slate-100">
                            {shownLevel === "easy" ? "쉬운 설명" : "고급 풀이"}
                        </h4>
                    </div>
                    <ReportRenderer text={result} streaming={running !== null} />
                </div>
            )}
        </div>
    );
}
