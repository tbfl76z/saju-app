import { Progress } from "@/components/ui/progress";

interface FiveElementsProps {
    elements: Record<string, number>;
}

export function FiveElements({ elements }: FiveElementsProps) {
    const labels = ["목", "화", "토", "금", "수"];
    const colors: Record<string, string> = {
        목: "bg-green-500",
        화: "bg-red-500",
        토: "bg-yellow-500",
        금: "bg-gray-400",
        수: "bg-blue-500",
    };

    return (
        <div className="my-8">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">🔮 오행의 기운 분포</h3>
            <div className="grid grid-cols-5 gap-4">
                {labels.map((label) => {
                    const val = elements[label] || 0;
                    const percentage = (val / 8) * 100;
                    return (
                        <div key={label} className="text-center space-y-2">
                            <div className="text-xs text-muted-foreground">{label}</div>
                            <div className="text-2xl font-light">{val}개</div>
                            <Progress value={percentage} className={`h-1.5 ${colors[label]}`} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
