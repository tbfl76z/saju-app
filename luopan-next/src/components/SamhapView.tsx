"use client";

import { useMemo, useState } from "react";
import { gukFromSugu, suguKind, ssangsanPotae, SSANGSAN, GUK_JANGSAENG, type Guk } from "@/lib/samhap";
import { HYANG88, CAUTIONS, SOURCES } from "@/lib/hyang88";

// 삼합수법(三合水法) 뷰 — 수구(물 나가는 방위)로 4국을 정하고,
// 파구 궁위에 따라 놓을 수 있는 향을 88향 표에서 조회한다.
// 국·포태 계산은 lib/samhap.ts, 향 목록은 lib/hyang88.ts(교차검증본 88행)를 쓴다.
// 향을 추론하지 않고 표를 조회하는 이유는 변향(자생·자왕·문고소수 등)의 조건이
// 유파에 따라 갈려 유도식으로 만들면 틀리기 때문이다.

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
// 88향 표 기준. 예전 안내는 정양향을 태궁으로 적었으나 실제로는 절궁이다.
const KIND_NOTE: Record<string, string> = {
    묘: "묘(墓)·고장궁으로 빠집니다 — 가장 많이 쓰는 파구입니다. 정생·정왕향과 자생·자왕향을 놓습니다.",
    절: "절(絶)궁으로 빠집니다 — 정양향·정묘향, 그리고 절향절류를 놓습니다.",
    태: "태(胎)궁으로 빠집니다 — 문고소수·목욕소수·태향태류·쇠향태류를 놓습니다.",
};

export default function SamhapView() {
    const [sugu, setSugu] = useState("乙");
    const guk = useMemo(() => gukFromSugu(sugu), [sugu]);
    const kind = useMemo(() => suguKind(sugu), [sugu]);
    const rows = useMemo(() => (guk ? ssangsanPotae(guk) : []), [guk]);
    // 88향 표에서 이 국·파구 궁위에 해당하는 향을 뽑는다(추론이 아니라 표 조회).
    const hyangs = useMemo(() => {
        if (!kind) return [];
        return HYANG88.filter((h) => h.guk === kind.guk && h.gung === kind.kind);
    }, [kind]);
    // 같은 향법 유형끼리 묶는다(쌍산 2향이 한 쌍)
    const grouped = useMemo(() => {
        const m = new Map<string, typeof hyangs>();
        for (const h of hyangs) { const a = m.get(h.type) ?? []; a.push(h); m.set(h.type, a); }
        return [...m.entries()];
    }, [hyangs]);

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

            {/* 놓을 수 있는 향 — 88향 표 조회 결과 */}
            {grouped.length > 0 && (
                <div className="glass-card p-4 space-y-2">
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        이 파구에 놓을 수 있는 향
                        <span className="ml-2 font-normal text-[11px] text-slate-400">88향법 · {hyangs.length}개</span>
                    </div>
                    <div className="space-y-2">
                        {grouped.map(([type, list]) => (
                            <div key={type} className="rounded-xl border border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-900/15 p-3 space-y-1">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <b className="text-emerald-700 dark:text-emerald-400">{type}</b>
                                    <span className="font-noto-serif text-[11px] text-slate-500">{list[0].hanja}</span>
                                    <span className="text-[11px] text-slate-500">쌍산 {list[0].pairHyang}</span>
                                    <span className="ml-auto text-[11px] font-semibold text-[#bf953f]">물 흐름 — {list[0].flow}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-noto-serif text-[15px] text-slate-800 dark:text-slate-100">
                                    {list.map((h) => <span key={h.no}>{h.label}</span>)}
                                </div>
                                {list[0].cond && <div className="text-[11px] text-slate-500 dark:text-slate-400">조건 — {list[0].cond}</div>}
                                <div className="text-[10.5px] text-slate-400">파구 {list[0].pagu}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                        파구 궁위(묘·절·태)에 따라 놓을 수 있는 향이 정해집니다. <b>물 흐름 조건까지 맞아야</b> 성립합니다.
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
                    ⚠ 자료 간 이견과 근거
                </summary>
                <div className="pt-2 space-y-2 text-[11.5px] text-slate-600 dark:text-slate-300">
                    {CAUTIONS.map((c) => (
                        <p key={c.topic}><b>{c.topic}</b> — {c.fact}</p>
                    ))}
                    <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                        <div className="font-semibold mb-1">근거 자료</div>
                        {SOURCES.map((s2) => (
                            <div key={s2.url} className="text-[11px] text-slate-500 dark:text-slate-400">
                                · <a href={s2.url} target="_blank" rel="noreferrer" className="underline hover:text-[#bf953f]">{s2.name}</a>
                                {s2.by && <span> — {s2.by}</span>} <span className="text-slate-400">({s2.level})</span>
                            </div>
                        ))}
                    </div>
                </div>
            </details>
        </div>
    );
}
