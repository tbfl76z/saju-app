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
        <Card className="h-full border-[#d4af37]/20 hover:border-[#d4af37]/50 transition-colors shadow-sm">
            <CardContent className="p-1 md:p-4 flex flex-col items-center justify-between h-full text-center">
                <div className="text-[8px] md:text-[10px] text-muted-foreground uppercase tracking-tight md:tracking-wider mb-1">{label}</div>

                <div className="flex flex-col items-center justify-center my-1 md:my-3">
                    <div className="text-xl md:text-3xl font-bold text-slate-900 leading-none mb-1">{ganzhi[0]}</div>
                    <div className="text-xl md:text-3xl font-bold text-slate-700 leading-none">{ganzhi[1]}</div>
                </div>

                <div className="w-full pt-2 md:pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center text-[10px] md:text-xs mb-1">
                        <span className="text-muted-foreground">십성</span>
                        <span className="font-bold text-rose-600">{tenGod}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] md:text-xs">
                        <span className="text-muted-foreground">운성</span>
                        <span className="font-bold text-blue-600">{growth}</span>
                    </div>
                </div>

                <div className="mt-2 md:mt-4 w-full space-y-1">
                    <Popover>
                        <PopoverTrigger asChild>
                            <div className="text-[9px] md:text-[11px] text-amber-700 font-medium cursor-pointer hover:bg-amber-50 rounded py-0.5 px-1 transition-colors text-center border border-amber-100">
                                ✨ {sinsal || "기본"}
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-sm p-4">
                            <h4 className="font-bold mb-2 text-[#d4af37]">신살 분석</h4>
                            <p className="text-xs leading-relaxed">{getDesc(sinsal)}</p>
                        </PopoverContent>
                    </Popover>

                    <div className="text-[9px] md:text-[11px] text-purple-700 font-medium py-0.5 px-1 border border-purple-100 rounded bg-purple-50/30 text-center">
                        🔗 {relations || "평온"}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function SajuPillars({ data, terms }: { data: any; terms: any }) {
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
                        ganzhi={data.pillars[p.key].pillar}
                        tenGod={p.key === 'day' ? '본인' : data.ten_gods[p.key]}
                        growth={data.twelve_growth[p.key]}
                        sinsal={data.sinsal[p.key]}
                        relations={data.sinsal_details[p.key].relations}
                        terms={terms}
                    />
                ))}
            </div>
        </div>
    );
}
