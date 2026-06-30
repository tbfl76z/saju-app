"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listProfilesPrimaryFirst, type SavedProfile } from "@/lib/storage";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// /calculate 저장응답에서 생년월일시 파싱 → /classic 입력
function toBirth(s: any) {
    const [y, m, d] = String(s?.birth_date || "").split("-").map(Number);
    const [hh, mm] = String(s?.birth_time || "12:00").split(":").map(Number);
    return {
        name: s?.name || "", gender: s?.gender || "남",
        year: y, month: m, day: d, hour: hh || 12, minute: mm || 0,
        calendar: "양력", unknown_time: !!s?.unknown_time,
    };
}

type Tab = "자미" | "주역" | "기문";

// 자미두수 명반: 지지 고정 배치(4×4 외곽 12궁) → [row, col]
const JAMI_POS: Record<string, [number, number]> = {
    "巳": [1, 1], "午": [1, 2], "未": [1, 3], "申": [1, 4],
    "辰": [2, 1], "酉": [2, 4],
    "卯": [3, 1], "戌": [3, 4],
    "寅": [4, 1], "丑": [4, 2], "子": [4, 3], "亥": [4, 4],
};
// 기문 낙서 9궁: 궁번호 → [row, col]
const GIMUN_POS: Record<number, [number, number]> = {
    4: [1, 1], 9: [1, 2], 2: [1, 3],
    3: [2, 1], 5: [2, 2], 7: [2, 3],
    8: [3, 1], 1: [3, 2], 6: [3, 3],
};

export default function ClassicPage() {
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [sel, setSel] = useState("");
    const [mounted, setMounted] = useState(false);
    const [tab, setTab] = useState<Tab>("자미");

    useEffect(() => {
        setMounted(true);
        const list = listProfilesPrimaryFirst();
        setProfiles(list);
        if (list.length) setSel(list[0].id);
    }, []);

    const profile = profiles.find((p) => p.id === sel);
    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-2 py-5 md:py-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">☯ 고전 명리</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm">자미두수 명반 · 주역점 · 기문둔갑 방위</p>
            </div>

            {profiles.length === 0 ? (
                <div className="glass-card p-10 text-center space-y-4">
                    <p className="text-slate-600 dark:text-slate-300">저장된 명식이 없습니다.</p>
                    <Link href="/"><Button>명식 만들러 가기</Button></Link>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2 mb-4">
                        <Select value={sel} onValueChange={setSel}>
                            <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {profiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 탭 */}
                    <div className="flex gap-1.5 mb-4 flex-wrap">
                        {(["자미", "주역", "기문"] as Tab[]).map((t) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={"px-4 py-2 rounded-full text-sm font-semibold transition-colors " +
                                    (tab === t ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                                        : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60")}>
                                {t === "자미" ? "자미두수" : t === "주역" ? "주역점" : "기문방위"}
                            </button>
                        ))}
                    </div>

                    {tab === "자미" && <JamiView profile={profile} />}
                    {tab === "주역" && <JuyeokView />}
                    {tab === "기문" && <GimunView profile={profile} />}
                </>
            )}
        </div>
    );
}

function Pungi({ children }: { children: any }) {
    return <div className="whitespace-pre-wrap leading-[1.9] text-[15px] text-slate-700 dark:text-slate-200 bg-amber-50/40 dark:bg-slate-800/40 border-l-2 border-[#d4af37] rounded-r-lg px-4 py-3">{children}</div>;
}
function Section({ title, children }: { title: string; children: any }) {
    return <details className="glass-card p-4 group" open>
        <summary className="cursor-pointer font-bold text-[#bf953f] dark:text-[#e6c35c] font-noto-serif">{title}</summary>
        <div className="mt-3 space-y-2">{children}</div>
    </details>;
}

// 사화 색상
const HWA_COLOR: Record<string, string> = {
    "化祿": "text-emerald-600 dark:text-emerald-400", "化權": "text-blue-600 dark:text-blue-400",
    "化科": "text-amber-600 dark:text-amber-400", "化忌": "text-rose-600 dark:text-rose-400",
};

// 자미 명반 1칸 — 원본 스타일(보조성·잡성·주성+묘왕+사화·박사신·장생신·소한·궁명·간지)
function JamiCell({ cell, zi }: { cell: any; zi: string }) {
    const hwaOf: Record<string, string> = {};
    (cell["사화"] || []).forEach((s: any) => { hwaOf[s["성"]] = s["화"]; });
    const miowang: Record<string, string> = cell["묘왕"] || {};
    const aux = [...(cell["보좌"] || []), ...(cell["잡성"] || [])];
    return (
        <div className={"rounded-md border p-1 min-h-[112px] flex flex-col font-noto-serif " +
            (cell["is명궁"] ? "border-[#d4af37] bg-[#d4af37]/12" : "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40")}>
            {/* 보조성·잡성 (위, 작게) */}
            <div className="flex flex-wrap gap-x-1 text-[8px] text-slate-400 leading-tight">
                {aux.map((s: string, i: number) => <span key={i}>{s}</span>)}
            </div>
            {/* 주성(한자) + 묘왕 + 사화 */}
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5 flex-1 content-start">
                {(cell["주성"] || []).length
                    ? (cell["주성"] || []).map((s: string, i: number) => {
                        const han = (cell["주성한글"] || [])[i];
                        const hwa = hwaOf[s];
                        return (
                            <span key={i} className="text-[13px] font-bold text-rose-600 dark:text-rose-400 leading-none">
                                {s}
                                {miowang[han] && <sub className="text-[7px] font-normal text-slate-400 ml-px">{miowang[han]}</sub>}
                                {hwa && <sup className={"text-[8px] ml-px " + (HWA_COLOR[hwa] || "")}>{hwa[1]}</sup>}
                            </span>
                        );
                    })
                    : <span className="text-[9px] text-slate-300 dark:text-slate-600">無主星</span>}
            </div>
            {/* 박사신 · 장생신 */}
            <div className="flex justify-between text-[8px] text-slate-400 leading-none mt-0.5">
                <span>{cell["박사신"] || ""}</span><span>{cell["장생신"] || ""}</span>
            </div>
            {/* 대한 · 소한 */}
            <div className="text-[7px] text-slate-400 leading-none">大 {cell["대한"]} · 小 {(cell["소한"] || []).slice(0, 5).join(",")}</div>
            {/* 궁명 + 간지 */}
            <div className="flex justify-between items-end mt-0.5">
                <span className={"text-[10px] leading-none " + (cell["is명궁"] ? "text-[#bf953f] font-bold" : "text-slate-500 dark:text-slate-300")}>{cell["궁한자"] || cell["궁"]}</span>
                <span className="text-[10px] text-sky-600 dark:text-sky-400 leading-none">{cell["궁간지"] || zi}</span>
            </div>
        </div>
    );
}

function JamiBoard({ jami }: { jami: any }) {
    const board: any[] = jami["명반"] || [];
    if (!board.length) return null;
    const byZi: Record<string, any> = {};
    board.forEach((c) => (byZi[c["지지"]] = c));
    return (
        <div className="glass-card p-2 overflow-x-auto">
            <div className="grid grid-cols-4 grid-rows-4 gap-1 min-w-[360px]">
                <div style={{ gridRow: "2 / 4", gridColumn: "2 / 4" }}
                    className="flex flex-col items-center justify-center text-center gap-1 rounded-lg bg-[#d4af37]/8 border border-[#d4af37]/30 font-noto-serif">
                    <div className="text-xs text-slate-400">紫微斗數 命盤</div>
                    <div className="text-lg font-bold text-[#bf953f]">{jami["五行局"]}</div>
                    <div className="text-xs text-slate-500">명궁 {jami["명궁"]} · {(jami["명궁주성"] || []).join("·") || "無主星"}</div>
                    {jami["음력"] && <div className="text-[10px] text-slate-400">음력 {jami["음력"]}</div>}
                    <div className="text-[8px] text-slate-400 mt-1">묘왕<sub>아래</sub> · 사화<sup>위</sup></div>
                </div>
                {Object.entries(JAMI_POS).map(([zi, [r, c]]) => {
                    const cell = byZi[zi];
                    if (!cell) return null;
                    return <div key={zi} style={{ gridRow: r, gridColumn: c }}><JamiCell cell={cell} zi={zi} /></div>;
                })}
            </div>
        </div>
    );
}

function JamiView({ profile }: { profile?: any }) {
    const init = (() => {
        const b = profile ? toBirth(profile.sajuData) : null;
        return b && b.year ? { y: b.year, m: b.month, d: b.day, h: b.hour, gender: b.gender }
            : { y: 1990, m: 1, d: 1, h: 12, gender: "남" };
    })();
    const [dt, setDt] = useState(init);
    const [jami, setJami] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    async function go(d = dt) {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/classic/full`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "", gender: d.gender, year: d.y, month: d.m, day: d.d, hour: d.h, minute: 0, calendar: "양력" }),
            });
            setJami((await res.json())["자미두수"]);
        } finally { setLoading(false); }
    }
    useEffect(() => { go(init); /* eslint-disable-next-line */ }, [profile?.id]);
    const num = (k: "y" | "m" | "d" | "h", min: number, max: number) => (
        <input type="number" value={dt[k]} min={min} max={max}
            onChange={(e) => setDt({ ...dt, [k]: Number(e.target.value) })}
            className="w-14 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
    );
    return (
        <div className="space-y-3">
            <div className="glass-card p-4 flex items-center gap-1.5 flex-wrap text-sm text-slate-500">
                <span className="mr-1">생년월일시(양력)</span>
                {num("y", 1900, 2100)}<span>년</span>{num("m", 1, 12)}<span>월</span>{num("d", 1, 31)}<span>일</span>{num("h", 0, 23)}<span>시</span>
                <select value={dt.gender} onChange={(e) => setDt({ ...dt, gender: e.target.value })}
                    className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm">
                    <option value="남">남</option><option value="여">여</option>
                </select>
                <Button onClick={() => go(dt)} disabled={loading} className="ml-1 h-8">명반 보기</Button>
            </div>
            {loading ? <div className="glass-card p-8 text-center text-slate-500">…</div> : jami && <JamiBoard jami={jami} />}
        </div>
    );
}

// 6효 괘상 그림 (위=6효 → 아래=1효). 효값 7·9=양, 6·8=음, 6·9=변효
function GuaImage({ yos, label }: { yos: number[]; label?: string }) {
    return (
        <div className="flex flex-col items-center gap-2">
            {label && <div className="text-2xl font-noto-serif text-[#bf953f]">{label}</div>}
            <div className="flex flex-col gap-1.5 w-28">
                {[...yos].map((v, i) => ({ v, hyo: yos.length - i })).reverse().map(({ v, hyo }) => {
                    const yang = v % 2 === 1;
                    const moving = v === 6 || v === 9;
                    const bar = moving ? "bg-rose-500 dark:bg-rose-400" : "bg-slate-700 dark:bg-slate-200";
                    return (
                        <div key={hyo} className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400 w-7 text-right">{hyo}효</span>
                            <div className="flex gap-1.5 flex-1">
                                {yang
                                    ? <div className={"h-2.5 flex-1 rounded-sm " + bar} />
                                    : <><div className={"h-2.5 flex-1 rounded-sm " + bar} /><div className={"h-2.5 flex-1 rounded-sm " + bar} /></>}
                            </div>
                            <span className="text-[10px] text-rose-500 w-3">{moving ? (v === 9 ? "○" : "×") : ""}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function JuyeokView() {
    const [r, setR] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    async function cast() {
        setLoading(true);
        try { setR(await (await fetch(`${API_BASE}/classic/juyeok`, { method: "POST" })).json()); }
        finally { setLoading(false); }
    }
    const byeon: number[] = r?.["변효"] || [];
    return (
        <div className="space-y-3">
            <div className="glass-card p-5 flex items-center justify-between">
                <p className="text-sm text-slate-500">동전 6번을 던져 괘를 얻습니다</p>
                <Button onClick={cast} disabled={loading}>🪙 {r ? "다시 점치기" : "점치기"}</Button>
            </div>
            {r && <>
                <div className="glass-card p-5 space-y-4">
                    <div className="flex justify-center gap-8 items-start">
                        <GuaImage yos={r["효"] || []} label={r["괘명"]} />
                        {r["변괘"] && <>
                            <div className="self-center text-2xl text-slate-300">→</div>
                            <GuaImage yos={(r["변괘"]["음양"] || []).map((b: number) => (b ? 7 : 8))} label={r["변괘"]["괘명"]} />
                        </>}
                    </div>
                    <div className="text-center text-xs text-slate-400">
                        {byeon.length ? `변효 ${byeon.join("·")}효 (○노양 ×노음)` : "변효 없음 — 본괘로 판단"}
                    </div>
                </div>
                <Section title={`본괘 — ${r["괘명"]}`}><Pungi>{r["풀이"]}</Pungi></Section>
                {r["변괘"] && <Section title={`변괘(지괘) — ${r["변괘"]["괘명"]}`}><Pungi>{r["변괘"]["풀이"]}</Pungi></Section>}
            </>}
        </div>
    );
}

function GimunView({ profile }: { profile?: any }) {
    const PURP = ["금전", "질병", "연애", "이사", "여가", "청탁"];
    const now = new Date();
    // 출생국(命局): 선택 프로필 생년월일시 → 고정
    const natal = (() => {
        const b = profile ? toBirth(profile.sajuData) : null;
        return b && b.year ? { y: b.year, m: b.month, d: b.day, h: b.hour } : null;
    })();
    const [mode, setMode] = useState<"natal" | "div">(natal ? "natal" : "div");
    const [purpose, setPurpose] = useState("금전");
    const [dt, setDt] = useState({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), h: now.getHours() });
    const [r, setR] = useState<any>(null);
    const [pick, setPick] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    // 현재 모드의 기준 시각
    const baseDt = mode === "natal" && natal ? natal : dt;
    async function go(d = baseDt, pp = purpose) {
        setLoading(true); setPick(null);
        try {
            const q = `${API_BASE}/classic/gimun?year=${d.y}&month=${d.m}&day=${d.d}&hour=${d.h}&purpose=${encodeURIComponent(pp)}`;
            setR(await (await fetch(q)).json());
        } finally { setLoading(false); }
    }
    useEffect(() => { go(mode === "natal" && natal ? natal : dt, purpose); /* eslint-disable-next-line */ }, [purpose, mode]);
    const cls = (g: string) => g.includes("吉") ? "text-sky-600 dark:text-sky-400" : g.includes("凶") ? "text-rose-500" : "text-slate-500";
    const cellBg = (g: string) => g.includes("吉") ? "bg-sky-50/70 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800"
        : g.includes("凶") ? "bg-rose-50/70 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800"
            : "bg-white/40 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700";
    const byPalace: Record<number, any> = {};
    (r?.["방위"] || []).forEach((b: any) => { if (b["궁"]) byPalace[b["궁"]] = b; });
    const num = (k: "y" | "m" | "d" | "h", min: number, max: number) => (
        <input type="number" value={dt[k]} min={min} max={max}
            onChange={(e) => setDt({ ...dt, [k]: Number(e.target.value) })}
            className="w-14 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
    );
    return (
        <div className="space-y-3">
            {/* 모드 토글: 출생국(고정) / 점단(시점 가변) */}
            <div className="glass-card p-4 space-y-3">
                <div className="flex gap-1.5">
                    {natal && <button onClick={() => setMode("natal")}
                        className={"px-3 py-1.5 rounded-full text-sm font-semibold " + (mode === "natal" ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>출생 명국</button>}
                    <button onClick={() => setMode("div")}
                        className={"px-3 py-1.5 rounded-full text-sm font-semibold " + (mode === "div" ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>점단·방위</button>
                </div>
                {mode === "natal" && natal ? (
                    <p className="text-sm text-slate-500">출생 {natal.y}.{natal.m}.{natal.d} {natal.h}시 기준 <b className="text-slate-700 dark:text-slate-200">평생 고정 명국</b></p>
                ) : (
                    <div className="flex items-center gap-1.5 flex-wrap text-sm text-slate-500">
                        <span className="mr-1">일시</span>
                        {num("y", 1900, 2100)}<span>년</span>{num("m", 1, 12)}<span>월</span>
                        {num("d", 1, 31)}<span>일</span>{num("h", 0, 23)}<span>시</span>
                        <Button onClick={() => go(dt, purpose)} disabled={loading} className="ml-1 h-8">조회</Button>
                        <button onClick={() => { const n = new Date(); const nd = { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours() }; setDt(nd); go(nd, purpose); }}
                            className="text-xs text-[#bf953f] underline">지금</button>
                    </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-slate-500">목적</span>
                    {PURP.map((p) => <button key={p} onClick={() => setPurpose(p)}
                        className={"px-3 py-1 rounded-full text-sm " + (purpose === p ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>{p}</button>)}
                    {r && <span className="ml-auto text-xs text-slate-400">{r["국"]}</span>}
                </div>
            </div>

            {loading ? <div className="glass-card p-8 text-center text-slate-500">…</div> : r && (
                <>
                    {/* 낙서 9궁 방위반 */}
                    <div className="glass-card p-3">
                        <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
                            {/* 중궁 */}
                            <div style={{ gridRow: 2, gridColumn: 2 }}
                                className="rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/8 p-1.5 min-h-[72px] flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-slate-400">中宮</span>
                                {r["중궁"] && <span className="text-sm font-noto-serif text-slate-500">{r["중궁"]["천반"]}/{r["중궁"]["지반"]}</span>}
                            </div>
                            {Object.entries(GIMUN_POS).filter(([p]) => Number(p) !== 5).map(([p, [row, col]]) => {
                                const b = byPalace[Number(p)];
                                if (!b) return <div key={p} style={{ gridRow: row, gridColumn: col }} />;
                                const on = pick && pick["지지"] === b["지지"];
                                return (
                                    <button key={p} style={{ gridRow: row, gridColumn: col }} onClick={() => setPick(b)}
                                        className={"rounded-lg border p-1.5 min-h-[72px] flex flex-col text-left transition-shadow " +
                                            cellBg(b["격"]) + (on ? " ring-2 ring-[#d4af37]" : "")}>
                                        <div className="flex justify-between items-start">
                                            <span className="text-[10px] text-slate-400">{b["방위"]}</span>
                                            <span className="text-base font-noto-serif text-sky-600 dark:text-sky-400 leading-none">{b["지지"]}</span>
                                        </div>
                                        <div className="text-sm font-noto-serif font-bold text-slate-700 dark:text-slate-200 mt-0.5">{b["천반"]}<span className="text-slate-400 font-normal">/{b["지반"]}</span></div>
                                        <div className={"text-[10px] font-bold leading-tight mt-auto " + cls(b["격"])}>{b["격"]}</div>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-slate-400 text-center mt-2">방위를 누르면 풀이가 표시됩니다</p>
                    </div>

                    {/* 선택 방위 풀이 */}
                    {pick && (
                        <div className="glass-card p-4">
                            <div className="text-sm text-slate-500 mb-1">▸{pick["방위"]}({pick["지지"]}) {pick["천반"]}/{pick["지반"]} <b className={cls(pick["격"])}>{pick["격"]}</b></div>
                            <Pungi>{pick["풀이"]}</Pungi>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
