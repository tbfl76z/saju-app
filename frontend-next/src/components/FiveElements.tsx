import { Progress } from "@/components/ui/progress";

interface FiveElementsProps {
    elements: Record<string, number>;
}

export function FiveElements({ elements }: FiveElementsProps) {
    const labels = ["목", "화", "토", "금", "수"];
    const colors: Record<string, string> = {
        목: "bg-[#2D5A27]", // Deep Wood
        화: "bg-[#C0392B]", // Deep Fire
        토: "bg-[#D4AF37]", // Royal Earth
        금: "bg-[#7F8C8D]", // Industrial Metal
        수: "bg-[#2C3E50]", // Deep Water
    };

    const lightColors: Record<string, string> = {
        목: "bg-green-50",
        화: "bg-red-50",
        토: "bg-amber-50",
        금: "bg-slate-50",
        수: "bg-blue-50",
    };

    return (
        <div className="my-12 fade-up">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-noto-serif">
                <span className="text-2xl">🔮</span>
                <span className="border-b-2 border-[#d4af37]/30 pb-1">오행의 기운 분포</span>
            </h3>
            <div className="grid grid-cols-5 gap-3 md:gap-6">
                {labels.map((label, idx) => {
                    const val = elements[label] || 0;
                    const percentage = (val / 8) * 100;
                    return (
                        <div
                            key={label}
                            className={`glass-card p-4 transition-all hover:scale-105 ${lightColors[label]} border-white/20`}
                            style={{ animationDelay: `${idx * 0.1}s` }}
                        >
                            <div className="text-xs md:text-sm font-bold text-slate-600 mb-2">{label}</div>
                            <div className="text-xl md:text-3xl font-light mb-4 text-slate-900">{val}<span className="text-xs md:text-sm text-slate-400 ml-0.5">개</span></div>
                            <div className="h-2 w-full bg-white/50 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${colors[label]} transition-all duration-1000 ease-out`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
