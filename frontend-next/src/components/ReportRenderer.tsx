"use client";

import { Fragment, type ReactNode } from "react";

// AI 리포트 렌더러. '## 헤딩' 단위로 섹션 카드를 구성한다(경량 자체 파서).
// 스트리밍 중 부분 텍스트도 안전하게 렌더한다.

interface ReportRendererProps {
    text: string;
    streaming?: boolean;
}

// **굵게** 표시를 <strong>으로 렌더한다(줄바꿈은 whitespace-pre-wrap이 유지).
function renderInline(text: string): ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        if (m) {
            return (
                <strong key={i} className="font-bold text-slate-900 dark:text-amber-200">
                    {m[1]}
                </strong>
            );
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

// 헤딩 키워드별 아이콘 매핑
const SECTION_ICONS: { key: string; icon: string }[] = [
    // 고급 풀이 헤딩
    { key: "총평", icon: "🪷" },
    { key: "정밀", icon: "🔍" },
    { key: "개운", icon: "🌱" },
    { key: "대가", icon: "🖋️" },
    // 쉬운 설명 헤딩
    { key: "한눈", icon: "👀" },
    { key: "흐름", icon: "🌊" },
    { key: "해보세요", icon: "🌱" },
    { key: "한마디", icon: "💬" },
];

function iconFor(heading: string): string {
    const found = SECTION_ICONS.find((s) => heading.includes(s.key));
    return found ? found.icon : "✦";
}

interface Section {
    heading: string;
    body: string;
}

// '## ' 헤딩 기준으로 섹션 분리. 헤딩 이전 텍스트는 '개요'로 묶는다.
function parseSections(text: string): Section[] {
    const lines = text.split("\n");
    const sections: Section[] = [];
    let current: Section | null = null;
    const preamble: string[] = [];

    for (const line of lines) {
        const m = line.match(/^\s*##\s+(.*)$/);
        if (m) {
            if (current) sections.push(current);
            current = { heading: m[1].trim(), body: "" };
        } else if (current) {
            current.body += (current.body ? "\n" : "") + line;
        } else {
            preamble.push(line);
        }
    }
    if (current) sections.push(current);

    const pre = preamble.join("\n").trim();
    if (pre) sections.unshift({ heading: "", body: pre });
    return sections;
}

export function ReportRenderer({ text, streaming = false }: ReportRendererProps) {
    const sections = parseSections(text);
    const hasHeadings = sections.some((s) => s.heading);

    // 헤딩이 아직 없으면(스트리밍 초반 등) 평문으로 표시
    if (!hasHeadings) {
        return (
            <div className="premium-report whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed text-lg">
                {renderInline(text)}
                {streaming && <span className="inline-block w-2 h-5 ml-0.5 bg-[#d4af37] animate-pulse align-middle" />}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {sections.map((s, idx) => (
                <div
                    key={idx}
                    className="rounded-2xl border border-[#d4af37]/25 bg-white/50 dark:bg-slate-900/40 p-5 shadow-sm"
                >
                    {s.heading && (
                        <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100 font-noto-serif mb-3">
                            <span className="text-xl">{iconFor(s.heading)}</span>
                            {s.heading}
                        </h4>
                    )}
                    <div className="premium-report whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                        {renderInline(s.body.trim())}
                        {streaming && idx === sections.length - 1 && (
                            <span className="inline-block w-2 h-5 ml-0.5 bg-[#d4af37] animate-pulse align-middle" />
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
