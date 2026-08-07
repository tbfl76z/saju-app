"use client";

import { useMemo, useState } from "react";
import { gukFromSugu, ssangsanPotae, SSANGSAN, GUK_JANGSAENG, type Guk } from "@/lib/samhap";

// 삼합수법(三合水法) 뷰 — 수구(물 나가는 방위)로 4국을 정하고
// 쌍산 12조 위 12포태를 보여준다. 계산은 lib/samhap.ts(표준 대조 검증 완료)만 사용.

const GRADE_STYLE: Record<string, string> = {
    길: "text-emerald-600 dark:text-emerald-400 font-bold",
    평: "text-slate-500 dark:text-slate-400",
    흉: "text-rose-500",
};
const GUK_NOTE: Record<Guk, string> = {
    수국: "수구가 辰巽巳(남동) 방위 — 申子辰 삼합. 장생 申(남서), 제왕 子(북), 묘 辰(남동).",
    목국: "수구가 未坤申(남서) 방위 — 亥卯未 삼합. 장생 亥(북서), 제왕 卯(동), 묘 未(남서).",
    화국: "수구가 戌乾亥(북서) 방위 — 寅午戌 삼합. 장생 寅(북동), 제왕 午(남), 묘 戌(북서).",
    금국: "수구가 丑艮寅(북동) 방위 — 巳酉丑 삼합. 장생 巳(남동), 제왕 酉(서), 묘 丑(북동).",
};

export default function SamhapView() {
    const [sugu, setSugu] = useState("辰");
    const guk = useMemo(() => gukFromSugu(sugu), [sugu]);
    const rows = useMemo(() => (guk ? ssangsanPotae(guk) : []), [guk]);

    return (
        <div className="space-y-3">
            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>수구(水口)</span>
                    <select value={sugu} onChange={(e) => setSugu(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                        {SSANGSAN.map(([g, b]) => <option key={b} value={b}>{g}{b}</option>)}
                    </select>
                    {guk && <span className="text-sm">→ <b className="text-[#bf953f]">{guk}</b> (장생 <span className="font-noto-serif">{GUK_JANGSAENG[guk]}</span>)</span>}
                </div>
                <p className="text-[11px] text-slate-400">
                    수구는 터에서 물(경사·배수)이 빠져나가는 방위입니다. 수구의 쌍산으로 국(局)을 정하고, 각 방위의 12포태로 기운의 성쇠를 봅니다.
                </p>
            </div>

            {guk && (
                <div className="glass-card p-4 space-y-3">
                    <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{GUK_NOTE[guk]}</div>
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
                        삼합파 기본 수법 기준이며, 88향 세부 길흉론·향상작국(向上作局)은 유파별 차이가 있어 포함하지 않았습니다.
                    </p>
                </div>
            )}
        </div>
    );
}
