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
        <Card className="h-full border-[#d4af37]/20 hover:border-[#d4af37]/50 transition-all hover:scale-105 shadow-md bg-white/40 backdrop-blur-sm rounded-2xl overflow-hidden group">
            <CardContent className="p-2 md:p-6 flex flex-col items-center justify-between h-full text-center">
                <div className="text-[10px] md:text-sm text-slate-500 font-medium uppercase tracking-widest mb-2 opacity-70">{label}</div>

                <div className="flex flex-col items-center justify-center my-2 md:my-5">
                    <div className="text-2xl md:text-5xl font-bold text-slate-900 leading-tight mb-1 font-noto-serif">{ganzhi[0]}</div>
                    <div className="text-2xl md:text-5xl font-bold text-slate-800 leading-tight font-noto-serif group-hover:text-[#d4af37] transition-colors">{ganzhi[1]}</div>
                </div>

                <div className="w-full pt-3 md:pt-6 border-t border-slate-200/50 space-y-2">
                    <div className="flex justify-between items-center text-[10px] md:text-sm">
                        <span className="text-slate-500">십성</span>
                        <span className="font-bold text-rose-700">{tenGod}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] md:text-sm">
                        <span className="text-slate-500">운성</span>
                        <span className="font-bold text-blue-700">{growth}</span>
                    </div>
                </div>

                <div className="mt-3 md:mt-6 w-full space-y-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <div className="text-[10px] md:text-xs text-amber-800 font-semibold cursor-pointer hover:bg-amber-100/50 rounded-lg py-1.5 px-2 transition-all text-center border border-amber-200/50 bg-amber-50/50 shadow-sm">
                                ✨ {sinsal || "기본"}
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 glass-card p-5 border-none shadow-2xl">
                            <h4 className="font-bold mb-3 text-amber-900 flex items-center gap-2 border-b border-amber-200 pb-2">
                                <span className="text-lg">✨</span> 신살 분석
                            </h4>
                            <p className="text-xs leading-relaxed text-slate-700">{getDesc(sinsal)}</p>
                        </PopoverContent>
                    </Popover>

                    <div className="text-[10px] md:text-xs text-indigo-800 font-semibold py-1.5 px-2 border border-indigo-200/50 rounded-lg bg-indigo-50/50 text-center shadow-sm">
                        🔗 {relations || "평온"}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function SajuPillars({ data, terms }: { data: Record<string, any>; terms: Record<string, string> }) {
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
