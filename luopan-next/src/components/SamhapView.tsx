"use client";

import { useMemo, useState } from "react";
import {
    gukFromSugu, suguKind, ssangsanPotae, jeonghyang, BYEONHYANG_NOTE,
    SSANGSAN, GUK_JANGSAENG, type Guk,
} from "@/lib/samhap";

// 삼합수법(三合水法) 뷰 — 수구(물 나가는 방위)로 4국을 정하고,
// 파구 자리에 따라 놓을 수 있는 향(정향)과 쌍산 12포태를 보여준다.
// 계산은 lib/samhap.ts(구조 유도 + 전수 검증)만 사용한다.

const GRADE_STYLE: Record<string, string> = {
    길: "text-emerald-600 dark:text-emerald-400 font-bold",
    평: "text-slate-500 dark:text-slate-400",
    흉: "text-rose-500",
};
const GUK_NOTE: Record<Guk, string> = {
    수국: "申子辰 삼합 — 장생 申(남서), 제왕 子(북), 묘 辰(남동)",
    목국: "亥卯未 삼합 — 장생 亥(북서), 제왕 卯(동), 묘 未(남서)",
    화국: "寅午戌 삼합 — 장생 寅(북동), 제왕 午(남), 묘 戌(북서)",
    금국: "巳酉丑 삼합 — 장생 巳(남동), 제왕 酉(서), 묘 丑(북동)",
};
const KIND_NOTE: Record<string, string> = {
    묘: "묘(墓)·고장궁으로 빠집니다 — 가장 많이 쓰는 파구로, 정생향·정왕향을 놓을 수 있습니다.",
    절: "절(絶)궁으로 빠집니다 — 정묘향을 놓습니다.",
    태: "태(胎)궁으로 빠집니다 — 정양향을 놓습니다.",
};

/** 향의 정반대 쌍산 = 좌(坐) */
function seatOf(pair: string): string {
    const i = SSANGSAN.findIndex(([g, b]) => g + b === pair);
    if (i < 0) return "";
    const [g, b] = SSANGSAN[(i + 6) % 12];
    return `${g}${b}`;
}

export default function SamhapView() {
    const [sugu, setSugu] = useState("乙");
    const guk = useMemo(() => gukFromSugu(sugu), [sugu]);
    const kind = useMemo(() => suguKind(sugu), [sugu]);
    const rows = useMemo(() => (guk ? ssangsanPotae(guk) : []), [guk]);
    const hyangs = useMemo(() => jeonghyang(sugu), [sugu]);

    return (
        <div className="space-y-3">
            {/* 무엇에 쓰는 것인지 먼저 밝힌다 — 현공과 다른 체계이고 대상도 다르다 */}
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300">
                💧 <b>물길로 좌향을 고르는 수법</b>입니다. 터에서 물이 빠져나가는 방위(수구)로 국을 정하고, 그에 맞는 향을 놓습니다.
                <br />
                <span className="text-slate-500 dark:text-slate-400">
                    <b>묘터·전원주택 터·마을</b>처럼 물길과 경사가 보이는 곳에 씁니다.
                    아파트 세대 안을 볼 때는 쓰지 않습니다 — 그건 <b>우리집 진단(현공)</b> 쪽입니다.
                    삼합수법은 현공비성과 <b>별개 체계</b>라 두 판정을 섞지 마세요.
                </span>
            </div>

            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span className="font-semibold">수구(水口)</span>
                    <select value={sugu} onChange={(e) => setSugu(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                        {SSANGSAN.map(([g, b]) => <option key={b} value={g}>{g}{b}</option>)}
                    </select>
                    {guk && kind && (
                        <span className="text-sm">
                            → <b className="text-[#bf953f]">{guk}</b>
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[11px] font-semibold">{kind.kind}파구</span>
                        </span>
                    )}
                </div>
                <p className="text-[11px] text-slate-400">
                    수구는 터에서 물(또는 경사·배수)이 빠져나가는 방위입니다. 실제로 물이 보이지 않으면 <b>낮아지는 쪽</b>으로 봅니다.
                </p>
                {guk && kind && (
                    <div className="rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300">
                        {GUK_NOTE[guk]}<br />{KIND_NOTE[kind.kind]}
                    </div>
                )}
            </div>

            {/* 놓을 수 있는 향 — 이 수법의 결론 */}
            {hyangs.length > 0 && (
                <div className="glass-card p-4 space-y-2">
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">이 수구에 놓을 수 있는 향</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {hyangs.map((h) => (
                            <div key={h.name} className="rounded-xl border border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-900/15 p-3 space-y-1">
                                <div className="flex items-baseline gap-2">
                                    <b className="text-emerald-700 dark:text-emerald-400">{h.name}</b>
                                    <span className="text-[11px] text-slate-500">{h.potae} 자리</span>
                                </div>
                                <div className="font-noto-serif text-lg text-slate-800 dark:text-slate-100">
                                    {seatOf(h.pair)}坐 → {h.pair}向
                                </div>
                                <div className="text-[11.5px] text-slate-600 dark:text-slate-300">{h.note}</div>
                                <div className="text-[11px] text-[#bf953f] font-semibold">물 흐름 — {h.flow}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                        향의 포태 자리로 정의되는 <b>정향(正向)</b>만 표시합니다. 물 흐름 조건까지 맞아야 성립합니다.
                    </p>
                </div>
            )}

            {guk && (
                <div className="glass-card p-4 space-y-3">
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">방위별 기운(12포태)</div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {rows.map((r) => (
                            <div key={r.pair} className={"rounded-xl border p-2 text-center " +
                                (r.grade === "길" ? "border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-900/15" :
                                    r.grade === "흉" ? "border-rose-300/50 bg-rose-50/40 dark:bg-rose-900/10" :
                                        "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40")}>
                                <div className="font-noto-serif text-lg text-slate-800 dark:text-slate-100">{r.pair}</div>
                                <div className={"text-sm " + GRADE_STYLE[r.grade]}>{r.potae}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        <span className={GRADE_STYLE["길"]}>생·왕·관대·임관</span>은 길방,
                        <span className={GRADE_STYLE["흉"]}> 목욕·병·사·절</span>은 흉방으로 봅니다.
                        (장생 기점 <span className="font-noto-serif">{GUK_JANGSAENG[guk]}</span>)
                    </p>
                </div>
            )}

            <details className="glass-card px-3 py-2">
                <summary className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    변향(變向) — 판정에 넣지 않은 것들
                </summary>
                <div className="pt-2 space-y-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                    {BYEONHYANG_NOTE.map((b) => (
                        <p key={b.name}><b>{b.name}</b> — {b.note}</p>
                    ))}
                    <p className="text-slate-500 dark:text-slate-400 pt-1">
                        변향은 향을 기준으로 국을 다시 세우는 <b>향상작국(向上作局)</b> 방식이라 유파에 따라 조건이 갈립니다.
                        근거를 확정하기 전에는 <b>수치 판정을 내지 않습니다</b> — 틀린 판정을 자신 있게 내놓는 것보다 낫다고 봅니다.
                    </p>
                </div>
            </details>
        </div>
    );
}
