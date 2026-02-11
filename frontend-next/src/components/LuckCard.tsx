import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LuckCardProps {
    header: string;
    ganzhi: string;
    stemTenGod: string;
    branchTenGod: string;
    growth: string;
    sinsal: string;
    relations: string;
    isSelected?: boolean;
    onClick?: () => void;
}

export function LuckCard({
    header,
    ganzhi,
    stemTenGod,
    branchTenGod,
    growth,
    sinsal,
    relations,
    isSelected,
    onClick,
}: LuckCardProps) {
    return (
        <Card
            onClick={onClick}
            className={cn(
                "cursor-pointer transition-all hover:scale-[1.02] border-[#d4af37]/20",
                isSelected ? " ring-2 ring-[#d4af37] bg-[#d4af37]/5" : "bg-white"
            )}
        >
            <CardContent className="p-3 text-center space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase">{header}</div>
                <div className="text-xl font-bold text-slate-800">{ganzhi}</div>

                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-1 text-[10px]">
                    <div className="text-left">
                        <div className="text-muted-foreground">십성</div>
                        <div className="font-semibold text-rose-600 truncate">{stemTenGod} | {branchTenGod}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-muted-foreground">운성</div>
                        <div className="font-semibold text-blue-600">{growth}</div>
                    </div>
                </div>

                <div className="space-y-0.5">
                    <div className="text-[9px] text-amber-600 truncate">✨ {sinsal}</div>
                    <div className="text-[9px] text-purple-600 truncate">🔗 {relations}</div>
                </div>
            </CardContent>
        </Card>
    );
}
