"use client";

// 궁합 점수 표시 컴포넌트 (순수 표시용, fetch 없음)
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// 궁합 점수 컴포넌트 props 타입
interface CompatibilityScoreProps {
  score: number; // 0-100 호합도 점수
  harmony: number; // 합(조화) 수치
  conflict: number; // 충(갈등) 수치
  matches: { pillar: string; ganzhi: string; relations: string }[]; // 기둥별 지지 관계
  summary?: string; // 요약 설명
}

// 기둥 키를 한글로 변환하는 맵
const PILLAR_LABEL: Record<string, string> = {
  year: "연주",
  month: "월주",
  day: "일주",
  hour: "시주",
};

// 점수 구간별 라벨과 색상(텍스트/테두리) 반환
function getScoreLevel(score: number): { label: string; color: string; ring: string } {
  if (score >= 80) {
    return {
      label: "천생연분",
      color: "text-[#d4af37] dark:text-[#e6c75a]",
      ring: "border-[#d4af37] dark:border-[#e6c75a]",
    };
  }
  if (score >= 60) {
    return {
      label: "좋은 인연",
      color: "text-emerald-600 dark:text-emerald-400",
      ring: "border-emerald-500 dark:border-emerald-400",
    };
  }
  if (score >= 40) {
    return {
      label: "무난",
      color: "text-sky-600 dark:text-sky-400",
      ring: "border-sky-500 dark:border-sky-400",
    };
  }
  return {
    label: "노력 필요",
    color: "text-rose-600 dark:text-rose-400",
    ring: "border-rose-500 dark:border-rose-400",
  };
}

// 궁합 점수 표시 컴포넌트
export default function CompatibilityScore({
  score,
  harmony,
  conflict,
  matches,
  summary,
}: CompatibilityScoreProps) {
  const level = getScoreLevel(score); // 점수 구간 라벨/색상

  return (
    <Card className="glass-card rounded-3xl border-[#d4af37]/30 bg-white/70 dark:border-[#d4af37]/20 dark:bg-zinc-900/60">
      <CardContent className="flex flex-col gap-6 p-6">
        {/* 점수 헤더: 큰 숫자 + 구간 라벨 */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="font-noto-serif text-lg text-zinc-700 dark:text-zinc-200">
            궁합 호합도
          </h3>
          <div className="flex items-end justify-center gap-1">
            <span className={cn("text-4xl font-bold", level.color)}>{score}</span>
            <span className="mb-1 text-base text-zinc-400 dark:text-zinc-500">/ 100</span>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              level.color,
              level.ring,
            )}
          >
            {level.label}
          </span>
        </div>

        {/* 0-100 호합도 게이지 */}
        <div className="flex flex-col gap-2">
          <Progress
            value={score}
            className="h-3 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70"
          />
          {/* 합/충 수치 표시 */}
          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              합(조화) <strong className="text-emerald-600 dark:text-emerald-400">{harmony}</strong>
            </span>
            <span>
              충(갈등) <strong className="text-rose-600 dark:text-rose-400">{conflict}</strong>
            </span>
          </div>
        </div>

        {/* 기둥별 지지 관계 배지 리스트 */}
        {matches.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="font-noto-serif text-sm text-zinc-600 dark:text-zinc-300">
              기둥별 지지 관계
            </h4>
            <div className="flex flex-wrap gap-2">
              {matches.map((m, i) => (
                <span
                  key={`${m.pillar}-${i}`}
                  className="rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1.5 text-xs text-zinc-700 dark:border-[#d4af37]/30 dark:bg-[#d4af37]/15 dark:text-zinc-200"
                >
                  <strong className="text-[#d4af37] dark:text-[#e6c75a]">
                    {PILLAR_LABEL[m.pillar] ?? m.pillar}
                  </strong>
                  ({m.ganzhi}): {m.relations}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 요약 설명 */}
        {summary && (
          <p className="rounded-2xl bg-zinc-100/70 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200">
            {summary}
          </p>
        )}

        {/* 하단 안내 문구 */}
        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          ※ 지지 관계 기반 참고용 점수입니다
        </p>
      </CardContent>
    </Card>
  );
}
