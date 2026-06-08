"use client";

import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { SajuForm } from "@/components/SajuForm";
import { SajuPillars } from "@/components/SajuPillars";
import CompatibilityScore from "@/components/CompatibilityScore";
import { AnalyzeButtons } from "@/components/AnalyzeButtons";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/useToast";

// 궁합 화면 props
interface CompatibilitySectionProps {
    apiBase: string;
    terms: Record<string, string>;
}

// /compatibility 응답 타입
interface CompatibilityResult {
    score: number;
    harmony: number;
    conflict: number;
    matches: { pillar: string; ganzhi: string; relations: string }[];
    summary: string;
}

export function CompatibilitySection({ apiBase, terms }: CompatibilitySectionProps) {
    // 두 인물의 명식(/calculate 결과)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [personA, setPersonA] = useState<any | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [personB, setPersonB] = useState<any | null>(null);

    // 궁합 결과
    const [result, setResult] = useState<CompatibilityResult | null>(null);

    // 로딩 플래그들
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);
    const [loadingResult, setLoadingResult] = useState(false);

    // 특정 인물의 명식을 /calculate 로 계산한다
    const calculatePerson = async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formData: any,
        who: "A" | "B"
    ) => {
        const setLoading = who === "A" ? setLoadingA : setLoadingB;
        const setPerson = who === "A" ? setPersonA : setPersonB;
        setLoading(true);
        try {
            const res = await fetch(`${apiBase}/calculate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error(`상태 코드 ${res.status}`);
            const data = await res.json();
            setPerson(data);
            // 입력이 바뀌면 이전 궁합 결과는 무효화한다
            setResult(null);
            notify.success(`${who === "A" ? "본인" : "상대방"} 명식이 준비되었습니다.`);
        } catch (err) {
            notify.error(
                "명식 계산에 실패했습니다.",
                err instanceof Error ? err.message : undefined
            );
        } finally {
            setLoading(false);
        }
    };

    // 두 명식으로 궁합을 계산한다
    const handleCompatibility = async () => {
        if (!personA || !personB) return;
        setLoadingResult(true);
        try {
            const res = await fetch(`${apiBase}/compatibility`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ person_a: personA, person_b: personB }),
            });
            if (!res.ok) throw new Error(`상태 코드 ${res.status}`);
            const data: CompatibilityResult = await res.json();
            setResult(data);
            notify.success("궁합 분석이 완료되었습니다.");
        } catch (err) {
            notify.error(
                "궁합 분석에 실패했습니다.",
                err instanceof Error ? err.message : undefined
            );
        } finally {
            setLoadingResult(false);
        }
    };

    const bothReady = Boolean(personA && personB);

    return (
        <section className="space-y-8">
            {/* 1단계: 두 사람의 명식 입력 */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* 본인 */}
                <div className="space-y-3">
                    <h3 className="font-noto-serif text-lg font-semibold text-[#d4af37] dark:text-[#e5c158]">
                        본인
                    </h3>
                    <SajuForm
                        onCalculate={(data) => calculatePerson(data, "A")}
                        isLoading={loadingA}
                    />
                </div>

                {/* 상대방 */}
                <div className="space-y-3">
                    <h3 className="font-noto-serif text-lg font-semibold text-[#d4af37] dark:text-[#e5c158]">
                        상대방
                    </h3>
                    <SajuForm
                        onCalculate={(data) => calculatePerson(data, "B")}
                        isLoading={loadingB}
                    />
                </div>
            </div>

            {/* 궁합 보기 버튼: 두 명식이 모두 준비되면 활성화 */}
            <div className="flex justify-center">
                <Button
                    onClick={handleCompatibility}
                    disabled={!bothReady || loadingResult}
                    className="rounded-2xl bg-[#d4af37] px-8 py-6 text-base font-semibold text-white shadow-md hover:bg-[#c19f2f] disabled:opacity-50 dark:bg-[#b8962e] dark:hover:bg-[#a6862a]"
                >
                    {loadingResult ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            궁합 분석 중...
                        </>
                    ) : (
                        <>
                            <Heart className="mr-2 h-5 w-5" />
                            궁합 보기
                        </>
                    )}
                </Button>
            </div>

            {/* 2단계: 궁합 결과 (점수 + 좌우 명식) */}
            {result && personA && personB && (
                <div className="space-y-6">
                    {/* 궁합 점수 카드 */}
                    <CompatibilityScore {...result} />

                    {/* 좌우 명식 비교 */}
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-3">
                            <h4 className="font-noto-serif text-base font-semibold text-[#d4af37] dark:text-[#e5c158]">
                                본인 명식
                            </h4>
                            <SajuPillars data={personA} terms={terms} />
                        </div>
                        <div className="space-y-3">
                            <h4 className="font-noto-serif text-base font-semibold text-[#d4af37] dark:text-[#e5c158]">
                                상대방 명식
                            </h4>
                            <SajuPillars data={personB} terms={terms} />
                        </div>
                    </div>

                    {/* 3단계: AI 궁합 풀이 — 쉬운 설명 / 고급 풀이 */}
                    <AnalyzeButtons
                        apiBase={apiBase}
                        title="궁합 풀이"
                        body={{ saju_data: personA, partner_saju_data: personB, analysis_type: "compatibility" }}
                    />
                </div>
            )}
        </section>
    );
}
