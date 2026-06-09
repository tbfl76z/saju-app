"use client";

import { useState } from "react";
import { Palette, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/useToast";

interface ImagePromptCardProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sajuData: any;
    apiBase: string;
}

interface ImagePromptResult {
    concept_ko: string;
    prompt_en: string;
}

// 명식(천간지지)을 바탕으로 이미지 생성 프롬프트를 만들어, ChatGPT/DALL-E로 바로 넘겨주는 카드
export function ImagePromptCard({ sajuData, apiBase }: ImagePromptCardProps) {
    const [result, setResult] = useState<ImagePromptResult | null>(null);
    const [loading, setLoading] = useState(false);

    const generate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiBase}/image-prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ saju_data: sajuData }),
            });
            if (!res.ok) throw new Error(`Image prompt failed: ${res.status}`);
            const data = await res.json();
            if (!data?.prompt_en) throw new Error("Invalid image-prompt response");
            setResult(data);
        } catch (err) {
            console.error("Failed to generate image prompt", err);
            notify.error("프롬프트 생성에 실패했습니다", "잠시 후 다시 시도해 주세요.");
        } finally {
            setLoading(false);
        }
    };

    // 영문 프롬프트를 클립보드에 복사
    const handleCopy = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.prompt_en);
            notify.success("이미지 프롬프트를 복사했습니다", "ChatGPT·DALL·E·Midjourney에 붙여넣기 하세요.");
        } catch {
            notify.error("복사에 실패했습니다");
        }
    };

    // ChatGPT를 새 탭으로 열고, 그림 생성 지시문을 자동 입력한다
    const openChatGPT = () => {
        if (!result) return;
        const query = `다음 묘사를 바탕으로 이미지를 하나 그려줘 (Create an image based on this prompt):\n\n${result.prompt_en}`;
        const url = `https://chatgpt.com/?q=${encodeURIComponent(query)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <section className="fade-up">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-3 font-noto-serif text-slate-900 dark:text-slate-100">
                <span className="text-2xl">🎨</span>
                <span className="border-b-2 border-[#d4af37]/30 pb-1">나의 명식 이미지</span>
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                천간지지를 바탕으로 당신만의 운명을 그림으로 표현하는 프롬프트를 만들어 드립니다. ChatGPT로 바로 그려보세요.
            </p>

            {!result ? (
                <div className="flex justify-center">
                    <Button
                        onClick={generate}
                        disabled={loading}
                        className="rounded-full px-8 py-6 text-base bg-gradient-to-r from-[#d4af37] to-[#bf953f] hover:from-[#bf953f] hover:to-[#aa771c] text-white font-bold shadow-lg transition-all hover:scale-[1.02] border-none"
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                상징을 그려내는 중...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Palette className="h-5 w-5" /> 내 명식 그림 프롬프트 만들기
                            </span>
                        )}
                    </Button>
                </div>
            ) : (
                <div className="glass-card p-6 md:p-8 animate-in fade-in zoom-in-95 duration-500 space-y-5">
                    {/* 국문 컨셉 (명식 기반, 결정론적) */}
                    <div className="bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-2xl px-5 py-4">
                        <div className="text-xs font-bold text-[#bf953f] mb-1.5">✦ 이미지 컨셉</div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{result.concept_ko}</p>
                    </div>

                    {/* 영문 이미지 프롬프트 */}
                    <div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Image Prompt (English)</div>
                        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 font-mono">
                            {result.prompt_en}
                        </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            onClick={generate}
                            disabled={loading}
                            variant="ghost"
                            size="sm"
                            className="rounded-full text-slate-500 dark:text-slate-400"
                        >
                            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> 다시 생성
                        </Button>
                        <Button
                            onClick={handleCopy}
                            variant="outline"
                            size="sm"
                            className="rounded-full text-slate-600 dark:text-slate-300"
                        >
                            <Copy className="h-4 w-4 mr-1.5" /> 프롬프트 복사
                        </Button>
                        <Button
                            onClick={openChatGPT}
                            size="sm"
                            className="rounded-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900 dark:hover:bg-[#e6c35c]"
                        >
                            <ExternalLink className="h-4 w-4 mr-1.5" /> ChatGPT로 그리기
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}
