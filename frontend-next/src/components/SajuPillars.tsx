"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PillarProps {
    label: string;
    ganzhi: string;
    tenGod: string;
    growth: string;
    sinsal: string;
    relations: string;
    terms: Record<string, string>;
}

function PillarCard({ label, ganzhi, tenGod, growth, sinsal, relations, terms }: PillarProps) {
    const getDesc = (item: string) => {
        const cleanItem = item.replace(/\(.*\)/, "").trim();
        return terms[cleanItem] || terms[item] || "상세 정보가 곧 업데이트될 예정입니다.";
    };

    return (
        <Card className="h-full border-[#d4af37]/20 hover:border-[#d4af37]/50 transition-all hover:scale-105 shadow-md bg-white/40 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl overflow-hidden group">
            <CardContent className="p-2 md:p-6 flex flex-col items-center justify-between h-full text-center">
                <div className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 font-medium uppercase tracking-widest mb-2 opacity-70">{label}</div>

                <div className="flex flex-col items-center justify-center my-2 md:my-5">
                    <div className="text-2xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 leading-tight mb-1 font-noto-serif">{ganzhi[0]}</div>
                    <div className="text-2xl md:text-5xl font-bold text-slate-800 dark:text-slate-200 leading-tight font-noto-serif group-hover:text-[#d4af37] transition-colors">{ganzhi[1]}</div>
                </div>

                <div className="w-full pt-3 md:pt-6 border-t border-slate-200/50 dark:border-slate-700/50 space-y-2">
                    <div className="flex justify-between items-center text-[10px] md:text-sm">
                        <span className="text-slate-500 dark:text-slate-400">십성</span>
                        <span className="font-bold text-rose-700 dark:text-rose-400">{tenGod}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] md:text-sm">
                        <span className="text-slate-500 dark:text-slate-400">운성</span>
                        <span className="font-bold text-blue-700 dark:text-blue-400">{growth}</span>
                    </div>
                </div>

                <div className="mt-3 md:mt-6 w-full space-y-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <div className="text-[10px] md:text-xs text-amber-800 dark:text-amber-300 font-semibold cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30 rounded-lg py-1.5 px-2 transition-all text-center border border-amber-200/50 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/30 shadow-sm">
                                ✨ {sinsal || "기본"}
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-amber-800/50 rounded-2xl p-5 shadow-2xl">
                            <h4 className="font-bold mb-3 text-amber-900 dark:text-amber-300 flex items-center gap-2 border-b border-amber-200 dark:border-amber-800/50 pb-2">
                                <span className="text-lg">✨</span> 신살 분석
                            </h4>
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{getDesc(sinsal)}</p>
                        </PopoverContent>
                    </Popover>

                    {relations && relations !== "-" && (
                        <div className="text-[10px] md:text-xs text-indigo-800 dark:text-indigo-300 font-semibold py-1.5 px-2 border border-indigo-200/50 dark:border-indigo-800/40 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 text-center shadow-sm">
                            🔗 {relations}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SajuPillars({ data, terms }: { data: any; terms: Record<string, string> }) {
    if (!data || !data.pillars) return null;

    const pillars = [
        { key: "hour", label: "시주(時)" },
        { key: "day", label: "일주(日)" },
        { key: "month", label: "월주(月)" },
        { key: "year", label: "연주(年)" },
    ];

    return (
        <div className="w-full my-8">
            <div className="grid grid-cols-4 gap-1 md:gap-4">
                {pillars.map((p) => (
                    <PillarCard
                        key={p.key}
                        label={p.label}
                        ganzhi={data.pillars?.[p.key]?.pillar || "--"}
                        tenGod={p.key === 'day' ? '본인' : data.ten_gods?.[p.key] || "-"}
                        growth={data.twelve_growth?.[p.key] || "-"}
                        sinsal={data.sinsal?.[p.key] || "-"}
                        relations={data.sinsal_details?.[p.key]?.relations || "-"}
                        terms={terms}
                    />
                ))}
            </div>
        </div>
    );
}
