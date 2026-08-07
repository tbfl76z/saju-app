// import { Progress } from "@/components/ui/progress"; // Removed for lint

interface FiveElementsProps {
    elements: Record<string, number>;
}

export function FiveElements({ elements }: FiveElementsProps) {
    const labels = ["목", "화", "토", "금", "수"];
    // 막대 색은 globals.css의 --saju-* CSS 변수를 사용(다크모드에서 자동 보정)
    const barVars: Record<string, string> = {
        목: "var(--saju-wood)",
        화: "var(--saju-fire)",
        토: "var(--saju-earth)",
        금: "var(--saju-metal)",
        수: "var(--saju-water)",
    };

    const lightColors: Record<string, string> = {
        목: "bg-green-50 dark:bg-green-950/30",
        화: "bg-red-50 dark:bg-red-950/30",
        토: "bg-amber-50 dark:bg-amber-950/30",
        금: "bg-slate-50 dark:bg-slate-800/40",
        수: "bg-blue-50 dark:bg-blue-950/30",
    };

    return (
        <div className="my-12 fade-up">
            <h3 className="section-title text-lg md:text-xl mb-6">
                <span className="text-2xl">🔮</span>
                <span>오행의 기운 분포</span>
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
                            <div className="text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">{label}</div>
                            <div className="text-xl md:text-3xl font-light mb-4 text-slate-900 dark:text-slate-100">{val}<span className="text-xs md:text-sm text-slate-400 dark:text-slate-500 ml-0.5">개</span></div>
                            <div className="h-2 w-full bg-white/50 dark:bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full transition-all duration-1000 ease-out"
                                    style={{ width: `${percentage}%`, backgroundColor: barVars[label] }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
