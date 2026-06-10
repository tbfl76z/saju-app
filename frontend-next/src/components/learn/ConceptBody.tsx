"use client";

import { Fragment, type ReactNode } from "react";

// 개념 카드 본문 렌더러 (마크다운 경량 파서)
// 지원: **굵게**, '- ' 목록, '1. ' 숫자 목록, '|' 표, 빈 줄 단락 구분, 단락 내 줄바꿈 보존

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

type Block =
    | { type: "p"; lines: string[] }
    | { type: "list"; items: string[] }
    | { type: "olist"; items: string[] }
    | { type: "table"; rows: string[][] };

function parseBlocks(body: string): Block[] {
    const blocks: Block[] = [];
    let cur: Block | null = null;
    const flush = () => {
        if (cur) blocks.push(cur);
        cur = null;
    };

    for (const raw of body.split("\n")) {
        const line = raw.trimEnd();
        if (!line.trim()) {
            flush();
            continue;
        }
        if (/^\|.*\|$/.test(line.trim())) {
            // 표 행 (구분선 |---|은 건너뜀)
            if (/^\|[\s:-]+\|/.test(line.trim()) && /^[\s|:-]+$/.test(line.trim())) continue;
            const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
            if (cur?.type === "table") cur.rows.push(cells);
            else {
                flush();
                cur = { type: "table", rows: [cells] };
            }
        } else if (/^-\s+/.test(line.trim())) {
            const item = line.trim().replace(/^-\s+/, "");
            if (cur?.type === "list") cur.items.push(item);
            else {
                flush();
                cur = { type: "list", items: [item] };
            }
        } else if (/^\d+\.\s+/.test(line.trim())) {
            const item = line.trim().replace(/^\d+\.\s+/, "");
            if (cur?.type === "olist") cur.items.push(item);
            else {
                flush();
                cur = { type: "olist", items: [item] };
            }
        } else {
            if (cur?.type === "p") cur.lines.push(line);
            else {
                flush();
                cur = { type: "p", lines: [line] };
            }
        }
    }
    flush();
    return blocks;
}

export function ConceptBody({ body }: { body: string }) {
    const blocks = parseBlocks(body);
    return (
        <div className="space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed">
            {blocks.map((b, i) => {
                if (b.type === "list") {
                    return (
                        <ul key={i} className="space-y-1.5 pl-1">
                            {b.items.map((item, j) => (
                                <li key={j} className="flex gap-2">
                                    <span className="text-[#bf953f] shrink-0 mt-0.5">•</span>
                                    <span>{renderInline(item)}</span>
                                </li>
                            ))}
                        </ul>
                    );
                }
                if (b.type === "olist") {
                    return (
                        <ol key={i} className="space-y-1.5 pl-1">
                            {b.items.map((item, j) => (
                                <li key={j} className="flex gap-2">
                                    <span className="text-[#bf953f] font-bold shrink-0">{j + 1}.</span>
                                    <span>{renderInline(item)}</span>
                                </li>
                            ))}
                        </ol>
                    );
                }
                if (b.type === "table") {
                    const [head, ...rows] = b.rows;
                    return (
                        <div key={i} className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr>
                                        {head.map((c, j) => (
                                            <th key={j} className="border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 py-1.5 font-bold text-slate-800 dark:text-slate-100">
                                                {renderInline(c)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, j) => (
                                        <tr key={j}>
                                            {r.map((c, k) => (
                                                <td key={k} className="border border-[#d4af37]/20 px-3 py-1.5 text-center">
                                                    {renderInline(c)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }
                return <p key={i} className="whitespace-pre-line">{renderInline(b.lines.join("\n"))}</p>;
            })}
        </div>
    );
}
