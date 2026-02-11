"use client";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface AnalysisTableProps {
    title: string;
    description: string;
    rowLabels: string[];
    headers: string[];
    data: string[][];
    terms: Record<string, string>;
}

export function AnalysisTable({
    title,
    description,
    rowLabels,
    headers,
    data,
    terms,
}: AnalysisTableProps) {
    const getDesc = (item: string) => {
        if (!item || item === "평온" || item === "-") return "지지가 서로 충돌하거나 방해하지 않는 안정된 상태입니다.";

        // 1. 순수 매핑 확인 (가장 정확한 매핑 우선)
        if (terms[item]) return terms[item];

        // 2. 괄호 제거 및 정규화
        let baseTerm = item.replace(/\(.*\)/, "").trim();

        // 3. 복합 관계 처리 (년-월 충 -> 충)
        if (baseTerm.includes(" ")) {
            const parts = baseTerm.split(" ");
            const relation = parts[parts.length - 1]; // 마지막 단어가 보통 관계 (충, 합 등)
            if (terms[relation]) return terms[relation];
        } else if (baseTerm.includes("-")) {
            const relation = baseTerm.split("-").pop()?.trim() || "";
            if (terms[relation]) return terms[relation];
        }

        // 4. 접두사 제거 (시파 -> 파, 일귀문 -> 귀문 등)
        const prefixes = ["시", "일", "월", "년", "대운"];
        for (const p of prefixes) {
            if (baseTerm.startsWith(p) && baseTerm.length > p.length) {
                const stripped = baseTerm.substring(p.length);
                if (terms[stripped]) return terms[stripped];
            }
        }

        // 5. 시작 부분 매핑 확인 (예: 파 -> 파(破))
        const startMatch = Object.keys(terms).find(k => k.startsWith(baseTerm));
        if (startMatch) return terms[startMatch];

        return "상세 정보가 곧 업데이트될 예정입니다.";
    };

    return (
        <div className="my-8">
            <h3 className="text-lg font-bold mb-2">🔍 {title}</h3>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded-r-lg text-sm text-blue-800">
                {description}
            </div>

            <div className="rounded-lg border border-slate-200 shadow-sm relative w-full">
                <table className="w-full text-[9px] md:text-sm text-left border-collapse table-fixed md:table-auto">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-1 md:p-3 font-bold text-slate-600 border-r border-slate-100 w-16 md:w-32">항목</th>
                            {headers.map((header, i) => (
                                <th key={i} className="p-1 md:p-3 font-bold text-slate-600 text-center">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rowLabels.map((label, rowIdx) => (
                            <tr key={rowIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                <td className="p-1 md:p-3 font-medium text-slate-500 bg-slate-50/30 border-r border-slate-100 text-[8px] md:text-sm">{label}</td>
                                {data[rowIdx].map((value, colIdx) => {
                                    return (
                                        <td key={colIdx} className="p-0.5 md:p-2 text-center overflow-hidden">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <div className="cursor-pointer hover:bg-[#d4af37]/10 rounded px-0.5 md:px-2 py-0.5 md:py-1 transition-colors break-all md:break-keep text-[8px] md:text-xs">
                                                        {value}
                                                    </div>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-64 p-4 z-50">
                                                    <div className="space-y-4">
                                                        {value.split('|').map(v => v.trim()).map((item, idx) => (
                                                            <div key={idx} className={idx > 0 ? "pt-2 border-t border-slate-100" : ""}>
                                                                <div className="font-bold text-[#d4af37] mb-1">{item}</div>
                                                                <div className="text-xs leading-relaxed text-slate-600">{getDesc(item)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
