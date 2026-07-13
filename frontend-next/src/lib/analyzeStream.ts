"use client";

// AI 분석 스트리밍(SSE) 공용 헬퍼.
// /analyze/stream을 우선 시도하고, 미지원/오류 시 /analyze(JSON)로 자동 폴백한다.

export interface AnalyzeBody {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saju_data: any;
    query?: string;
    analysis_type?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    partner_saju_data?: any;
    target_year?: number;
    level?: "easy" | "advanced";
    category?: "love" | "wealth" | "career" | "health";
    period_ganzhi?: string;
    period_label?: string;
}

// onDelta는 누적된 전체 텍스트를 전달한다. 최종 전체 텍스트를 반환.
export async function streamAnalyze(
    apiBase: string,
    body: AnalyzeBody,
    onDelta: (accumulated: string) => void
): Promise<string> {
    try {
        const res = await fetch(`${apiBase}/analyze/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const json = trimmed.slice(5).trim();
                if (!json) continue;
                try {
                    const evt = JSON.parse(json);
                    if (evt.delta) {
                        acc += evt.delta;
                        onDelta(acc);
                    }
                } catch {
                    // 부분 JSON 무시
                }
            }
        }
        if (acc) return acc;
        throw new Error("empty stream");
    } catch {
        // 폴백: 일반 /analyze JSON
        const res = await fetch(`${apiBase}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`analyze ${res.status}`);
        const data = await res.json();
        const result = typeof data?.result === "string" ? data.result : "분석 결과를 불러오지 못했습니다.";
        onDelta(result);
        return result;
    }
}

// 범용 SSE 스트림(자미두수 해석 등 임의 엔드포인트). onDelta는 누적 텍스트를 전달.
export async function streamSSE(
    url: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
    onDelta: (accumulated: string) => void
): Promise<string> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (!json) continue;
            try {
                const evt = JSON.parse(json);
                if (evt.delta) { acc += evt.delta; onDelta(acc); }
            } catch { /* 부분 JSON 무시 */ }
        }
    }
    return acc;
}
