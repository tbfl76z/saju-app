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

type Scope = "natal" | "daeun" | "seyun";

interface ImagePromptResult {
    concept_ko: string;
    prompt_en: string;
    scope: Scope;
    period_label?: string | null;
    ganzhi?: string | null;
}

const SCOPES: { key: Scope; label: string }[] = [
    { key: "natal", label: "나의 명식" },
    { key: "daeun", label: "명식 + 대운" },
    { key: "seyun", label: "명식 + 세운" },
];

// 명식(천간지지)을 바탕으로 이미지 생성 프롬프트를 만들어, ChatGPT/DALL-E로 바로 넘겨주는 카드
// 원국(명식) / 명식+대운 / 명식+세운 세 가지로 그릴 수 있다.
export function ImagePromptCard({ sajuData, apiBase }: ImagePromptCardProps) {
    const [result, setResult] = useState<ImagePromptResult | null>(null);
    const [loading, setLoading] = useState<Scope | null>(null);

    const generate = async (scope: Scope) => {
        setLoading(scope);
        try {
            const res = await fetch(`${apiBase}/image-prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ saju_data: sajuData, scope }),
            });
            if (!res.ok) throw new Error(`Image prompt failed: ${res.status}`);
            const data = await res.json();
            if (!data?.prompt_en) throw new Error("Invalid image-prompt response");
            setResult(data);
        } catch (err) {
            console.error("Failed to generate image prompt", err);
            notify.error("프롬프트 생성에 실패했습니다", "잠시 후 다시 시도해 주세요.");
        } finally {
            setLoading(null);
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

    // 결과 제목 (scope + 시기 라벨)
    const resultTitle = () => {
        if (!result) return "";
        const base = SCOPES.find((s) => s.key === result.scope)?.label ?? "나의 명식";
        const tail = result.period_label
            ? ` · ${result.period_label}${result.ganzhi ? `(${result.ganzhi})` : ""}`
            : "";
        return `${base}${tail}`;
    };

    return (
        <section className="fade-up">
            <h3 className="section-title text-lg md:text-xl mb-2">
                <span className="text-2xl">🎨</span>
                <span>나의 명식 이미지</span>
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                천간지지를 바탕으로 당신의 운명을 그림으로 표현하는 프롬프트를 만들어 드립니다.
                원국(명식)에 대운·세운의 기운을 더할 수도 있어요. ChatGPT로 바로 그려보세요.
            </p>

            {/* scope 선택 버튼 3종 */}
            <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                {SCOPES.map((s) => {
                    const active = result?.scope === s.key;
                    return (
                        <Button
                            key={s.key}
                            onClick={() => generate(s.key)}
                            disabled={loading !== null}
                            variant={active ? "default" : "outline"}
                            className={
                                active
                                    ? "rounded-full px-5 bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white border-none"
                                    : "rounded-full px-5 border-[#d4af37]/40 hover:bg-[#d4af37]/10"
                            }
                        >
                            {loading === s.key ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                    그리는 중...
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Palette className="h-4 w-4" /> {s.label}
                                </span>
                            )}
                        </Button>
                    );
                })}
            </div>

            {result && (
                <div className="glass-card p-6 md:p-8 mt-6 animate-in fade-in zoom-in-95 duration-500 space-y-5">
                    {/* 컨셉 제목 */}
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🖼️</span>
                        <h4 className="text-base font-bold font-noto-serif text-slate-900 dark:text-slate-100">{resultTitle()}</h4>
                    </div>

                    {/* 국문 컨셉 (명식 기반, 결정론적) */}
                    <div className="bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-2xl px-5 py-4">
                        <div className="text-xs font-bold text-[#bf953f] mb-1.5">✦ 이미지 컨셉</div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">{result.concept_ko}</p>
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
                            onClick={() => generate(result.scope)}
                            disabled={loading !== null}
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
