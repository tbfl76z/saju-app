"use client";

import { useRef, useState } from "react";
import { BookOpen, Sparkles, Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/ReportRenderer";
import { FollowupChat } from "@/components/FollowupChat";
import { streamAnalyze, type AnalyzeBody } from "@/lib/analyzeStream";
import { exportAsImage } from "@/lib/exportImage";
import { notify } from "@/lib/useToast";
import { saveReport } from "@/lib/storage";

interface AnalyzeButtonsProps {
    apiBase: string;
    // level을 제외한 분석 요청 본문 (saju_data, analysis_type, query, partner_saju_data, target_year)
    body: AnalyzeBody;
    className?: string;
    // 공유/다운로드 파일명·제목에 쓰일 라벨 (예: "오늘의 운세")
    title?: string;
}

// 쉬운 설명 / 고급 풀이 두 가지 수준으로 AI 운세를 풀어주는 공용 버튼+결과 블록
export function AnalyzeButtons({ apiBase, body, className, title = "운세 풀이" }: AnalyzeButtonsProps) {
    const [result, setResult] = useState("");
    const [running, setRunning] = useState<null | "easy" | "advanced">(null);
    const [shownLevel, setShownLevel] = useState<"easy" | "advanced">("advanced");
    const [downloading, setDownloading] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    const run = async (level: "easy" | "advanced") => {
        setRunning(level);
        setShownLevel(level);
        setResult("");
        try {
            const finalText = await streamAnalyze(apiBase, { ...body, level }, setResult);
            // 풀이 보관함 자동 저장 — 같은 명식·종류는 하루 1건으로 갱신 (저장됨 탭에서 다시 보기)
            const name = body?.saju_data?.name || "이름 없음";
            const birth = body?.saju_data?.birth_date || "";
            saveReport({
                title,
                profileLabel: birth ? `${name} · ${birth}` : name,
                type: String(body?.analysis_type ?? "total"),
                text: finalText,
            });
        } catch {
            setResult("분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
            notify.error("AI 분석에 실패했습니다", "잠시 후 다시 시도해 주세요.");
        } finally {
            setRunning(null);
        }
    };

    // 풀이 내용 공유: Web Share API 우선, 미지원 시 클립보드 복사
    const handleShare = async () => {
        const text = `[Destiny Code · ${title}]\n\n${result}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: `Destiny Code · ${title}`, text });
            } else {
                await navigator.clipboard.writeText(text);
                notify.success("풀이 내용을 복사했습니다", "원하는 곳에 붙여넣기 하세요.");
            }
        } catch {
            // 사용자가 공유 취소한 경우 등은 조용히 무시
        }
    };

    // 풀이 카드를 이미지(PNG)로 다운로드
    const handleDownload = async () => {
        if (!reportRef.current) return;
        setDownloading(true);
        try {
            await exportAsImage(reportRef.current, `destiny-${title}`);
            notify.success("이미지를 저장했습니다");
        } catch {
            notify.error("다운로드에 실패했습니다", "잠시 후 다시 시도해 주세요.");
        } finally {
            setDownloading(false);
        }
    };

    const done = result && running === null;

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
                <div className="mt-6">
                    <div ref={reportRef} className="glass-card p-6 md:p-8 animate-in fade-in zoom-in-95 duration-500">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="text-lg">{shownLevel === "easy" ? "📖" : "✨"}</span>
                            <h4 className="text-lg font-bold font-noto-serif text-slate-900 dark:text-slate-100">
                                {title} · {shownLevel === "easy" ? "쉬운 설명" : "고급 풀이"}
                            </h4>
                        </div>
                        <ReportRenderer text={result} streaming={running !== null} />
                    </div>

                    {done && <FollowupChat prev={result} />}

                    {/* 풀이 공유 / 다운로드 (스트리밍 끝난 뒤 노출) */}
                    {done && (
                        <div className="mt-3 flex justify-end gap-2">
                            <Button
                                onClick={handleShare}
                                variant="outline"
                                size="sm"
                                className="rounded-full text-slate-600 dark:text-slate-300"
                            >
                                <Share2 className="h-4 w-4 mr-1.5" /> 공유하기
                            </Button>
                            <Button
                                onClick={handleDownload}
                                disabled={downloading}
                                variant="outline"
                                size="sm"
                                className="rounded-full text-slate-600 dark:text-slate-300"
                            >
                                <Download className="h-4 w-4 mr-1.5" /> {downloading ? "저장 중..." : "다운로드"}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
