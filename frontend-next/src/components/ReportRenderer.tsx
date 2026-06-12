"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";

// AI 리포트 렌더러. '## 헤딩' 단위로 섹션 카드를 구성한다(경량 자체 파서).
// 스트리밍 중 부분 텍스트도 안전하게 렌더하며, 본문 속 명리 용어는 탭하면 뜻이 뜬다.

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 용어 사전 모듈 캐시 (앱 수명 동안 1회만 로드)
let termsCache: Record<string, string> | null = null;
let termsPromise: Promise<Record<string, string>> | null = null;

function loadTerms(): Promise<Record<string, string>> {
    if (termsCache) return Promise.resolve(termsCache);
    if (!termsPromise) {
        termsPromise = fetch(`${API_BASE}/terms`)
            .then((r) => (r.ok ? r.json() : {}))
            .then((d) => {
                termsCache = (d && typeof d === "object" ? d : {}) as Record<string, string>;
                return termsCache;
            })
            .catch(() => ({} as Record<string, string>));
    }
    return termsPromise;
}

interface ReportRendererProps {
    text: string;
    streaming?: boolean;
}

interface SelectedTerm {
    name: string;
    desc: string;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ReportRenderer({ text, streaming = false }: ReportRendererProps) {
    const [terms, setTerms] = useState<Record<string, string>>(termsCache ?? {});
    const [selected, setSelected] = useState<SelectedTerm | null>(null);

    useEffect(() => {
        if (!termsCache) loadTerms().then(setTerms);
    }, []);

    // 두 글자 이상 용어만 자동 감지 ('갑'·'사' 같은 한 글자는 일반 단어와 충돌)
    const termRegex = useMemo(() => {
        const keys = Object.keys(terms).filter((k) => k.length >= 2);
        if (keys.length === 0) return null;
        keys.sort((a, b) => b.length - a.length);
        return new RegExp(`(${keys.map(escapeRegExp).join("|")})`, "g");
    }, [terms]);

    // 평문 조각에서 용어를 탭 가능한 버튼으로 감싼다
    const wrapTerms = (part: string, keyPrefix: string): ReactNode[] => {
        if (!termRegex) return [part];
        return part.split(termRegex).map((seg, i) => {
            if (seg && terms[seg]) {
                return (
                    <button
                        key={`${keyPrefix}-${i}`}
                        type="button"
                        onClick={() => setSelected({ name: seg, desc: terms[seg] })}
                        className="inline font-semibold text-[#bf953f] dark:text-[#e6c35c] underline decoration-dotted decoration-[#d4af37]/60 underline-offset-2 cursor-pointer"
                    >
                        {seg}
                    </button>
                );
            }
            return <Fragment key={`${keyPrefix}-${i}`}>{seg}</Fragment>;
        });
    };

    // **굵게** 표시를 <strong>으로 렌더 (굵은 글씨 안의 용어도 탭 가능)
    const renderInline = (body: string): ReactNode[] => {
        const parts = body.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            const m = part.match(/^\*\*([^*]+)\*\*$/);
            if (m) {
                return (
                    <strong key={i} className="font-bold text-slate-900 dark:text-amber-200">
                        {wrapTerms(m[1], `b${i}`)}
                    </strong>
                );
            }
            return <Fragment key={i}>{wrapTerms(part, `p${i}`)}</Fragment>;
        });
    };

    const sections = parseSections(text);
    const hasHeadings = sections.some((s) => s.heading);

    return (
        <>
            {!hasHeadings ? (
                // 헤딩이 아직 없으면(스트리밍 초반 등) 평문으로 표시
                <div className="premium-report whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed text-lg">
                    {renderInline(text)}
                    {streaming && <span className="inline-block w-2 h-5 ml-0.5 bg-[#d4af37] animate-pulse align-middle" />}
                </div>
            ) : (
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
            )}

            {/* 용어 사전 바텀시트 — 본문 속 용어를 탭하면 뜻이 뜬다 */}
            {selected && (
                <div className="fixed inset-x-0 bottom-0 z-[90] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
                    <div className="pointer-events-auto max-w-xl mx-auto glass-card !rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-start justify-between gap-3">
                            <h5 className="font-bold text-[#bf953f] dark:text-[#e6c35c] font-noto-serif text-lg">📖 {selected.name}</h5>
                            <button onClick={() => setSelected(null)} aria-label="닫기" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{selected.desc}</p>
                    </div>
                </div>
            )}
        </>
    );
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
    // 통변 채점 헤딩
    { key: "채점", icon: "💯" },
    { key: "잘 짚은", icon: "👍" },
    { key: "놓친", icon: "🔎" },
    { key: "한 걸음", icon: "🚶" },
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
