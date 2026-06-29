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

type Tab = "명리" | "자미" | "주역" | "기문";
const PILLAR_ORDER = ["hour", "day", "month", "year"] as const;
const PILLAR_KO: Record<string, string> = { hour: "시주", day: "일주", month: "월주", year: "연주" };

export default function ClassicPage() {
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [sel, setSel] = useState("");
    const [mounted, setMounted] = useState(false);
    const [tab, setTab] = useState<Tab>("명리");
    const [full, setFull] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
        const list = listProfilesPrimaryFirst();
        setProfiles(list);
        if (list.length) setSel(list[0].id);
    }, []);

    const profile = profiles.find((p) => p.id === sel);

    async function load() {
        if (!profile) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/classic/full`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(toBirth(profile.sajuData)),
            });
            setFull(await res.json());
        } finally { setLoading(false); }
    }
    useEffect(() => { if (profile) load(); /* eslint-disable-next-line */ }, [sel]);

    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-2 py-5 md:py-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">☯ 고전 명리</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm">레거시 사주명리의 정형 풀이 — 명리·자미두수·주역·기문둔갑</p>
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
                        {(["명리", "자미", "주역", "기문"] as Tab[]).map((t) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={"px-4 py-2 rounded-full text-sm font-semibold transition-colors " +
                                    (tab === t ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                                        : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60")}>
                                {t === "명리" ? "명리 풀이" : t === "자미" ? "자미두수" : t === "주역" ? "주역점" : "기문방위"}
                            </button>
                        ))}
                    </div>

                    {loading && <div className="glass-card p-8 text-center text-slate-500">불러오는 중…</div>}

                    {!loading && full && tab === "명리" && <MyungriView full={full} />}
                    {!loading && full && tab === "자미" && <JamiView jami={full["자미두수"]} />}
                    {tab === "주역" && <JuyeokView />}
                    {tab === "기문" && <GimunView />}
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

function MyungsikTable({ m }: { m: any }) {
    const P = m.pillars;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse text-sm">
                <thead><tr className="text-slate-400">
                    <th className="p-1"></th>{PILLAR_ORDER.map((k) => <th key={k} className="p-1">{PILLAR_KO[k]}</th>)}
                </tr></thead>
                <tbody>
                    <tr><th className="text-slate-400 text-xs">천간</th>{PILLAR_ORDER.map((k) => <td key={k} className="p-1"><div className="text-2xl font-noto-serif font-bold text-[#bf953f]">{P[k].stem}</div><div className="text-[10px] text-slate-400">{m.ten_gods?.[k] || ""}</div></td>)}</tr>
                    <tr><th className="text-slate-400 text-xs">지지</th>{PILLAR_ORDER.map((k) => <td key={k} className="p-1"><div className="text-2xl font-noto-serif font-bold text-sky-600 dark:text-sky-400">{P[k].branch}</div><div className="text-[10px] text-slate-400">{m.jiji_ten_gods?.[k] || ""}</div></td>)}</tr>
                    <tr className="text-xs text-slate-500"><th>12운성</th>{PILLAR_ORDER.map((k) => <td key={k}>{m.twelve_growth?.[k] || ""}</td>)}</tr>
                    <tr className="text-xs text-slate-500"><th>신살</th>{PILLAR_ORDER.map((k) => <td key={k}>{(m.sinsal?.[k] || "").split(",")[0]}</td>)}</tr>
                </tbody>
            </table>
        </div>
    );
}

function MyungriView({ full }: { full: any }) {
    const m = full["명리"]; const ms = full["명식"];
    const sa = ms.strength_analysis || {};
    const won = (m.원국종합 || []).filter((x: any) => x.그룹 === "원명해설");
    const etc = (m.원국종합 || []).filter((x: any) => x.그룹 !== "원명해설");
    const [moreSS, setMoreSS] = useState(false);
    return (
        <div className="space-y-3">
            <div className="glass-card p-4">
                <MyungsikTable m={ms} />
                <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
                    {Object.entries(ms.five_elements || {}).map(([k, v]) => <span key={k} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{k} {v as any}</span>)}
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{sa.strength} · {sa.gyeokguk}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#d4af37]/15 text-[#bf953f]">용신 {(sa.yongsin || []).join("·")}</span>
                </div>
            </div>
            {m.원명원리 && <Section title="四柱原命 原理 (조후·용신)"><Pungi>{m.원명원리}</Pungi></Section>}
            {won.length > 0 && <Section title="원국 종합풀이">{won.map((x: any, i: number) => <div key={i}><div className="text-xs text-slate-400 mt-1">▸{x.조건}</div><Pungi>{x.풀이}</Pungi></div>)}</Section>}
            {(m.일간론 || []).length > 0 && <Section title="일간론 (성격·금전·애정)">{m.일간론.map((x: any, i: number) => <div key={i}><div className="text-xs text-slate-400 mt-1">▸{x.label}</div><Pungi>{x.text}</Pungi></div>)}</Section>}
            {m.일주론 && <Section title="일주론"><Pungi>{m.일주론}</Pungi></Section>}
            {(m.십이신살 || []).length > 0 && <Section title="十二神煞 풀이">{m.십이신살.map((x: any, i: number) => <div key={i}><div className="text-xs text-slate-400 mt-1">▸{x.위치}에 {x.신살}</div><Pungi>{x.풀이}</Pungi></div>)}</Section>}
            {(m.길흉신살 || []).length > 0 && <Section title={`各種 吉凶神殺 (${m.길흉신살.length})`}>
                {(moreSS ? m.길흉신살 : m.길흉신살.slice(0, 5)).map((x: any, i: number) => <div key={i}><div className="text-xs text-slate-400 mt-1">▸{x.신살}</div><Pungi>{x.풀이}</Pungi></div>)}
                {m.길흉신살.length > 5 && <button onClick={() => setMoreSS(!moreSS)} className="text-xs text-[#bf953f]">{moreSS ? "접기" : `+${m.길흉신살.length - 5}개 더보기`}</button>}
            </Section>}
            {(m.대운 || []).length > 0 && <Section title="大運 綜合 解說">{m.대운.map((x: any, i: number) => <details key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3"><summary className="cursor-pointer text-sm text-slate-500">{x.age}세~ {x.간지} 대운</summary><Pungi>{x.천간운} {x.지지운}{x.신살 ? "\n\n" + x.신살 : ""}</Pungi></details>)}</Section>}
            {m.연운 && (m.연운.천간운 || m.연운.지지운) && <Section title={`${m.연운.year}년 年運 (세운 ${m.연운.ganzhi})`}><Pungi>{m.연운.천간운}{m.연운.지지운 ? "\n\n" + m.연운.지지운 : ""}</Pungi></Section>}
            {etc.length > 0 && <details className="glass-card p-4"><summary className="cursor-pointer text-sm text-slate-500">기타 원국 특징 {etc.length}건 (참고)</summary><div className="mt-2 space-y-2">{etc.map((x: any, i: number) => <div key={i}><div className="text-xs text-slate-400">▸{x.조건}</div><Pungi>{x.풀이}</Pungi></div>)}</div></details>}
        </div>
    );
}

function JamiView({ jami }: { jami: any }) {
    if (!jami || jami.error) return <div className="glass-card p-6 text-slate-500">자미 산출 불가</div>;
    const p = jami["풀이"] || {};
    const sung = p["성격"] || {};
    const others = Object.keys(p).filter((k) => k !== "성격");
    return (
        <div className="space-y-3">
            <div className="glass-card p-4 flex flex-wrap gap-1.5 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">명궁 {jami["명궁"]}궁</span>
                <span className="px-2 py-0.5 rounded-full bg-[#d4af37]/15 text-[#bf953f]">{jami["五行局"]}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">명궁주성 {(jami["명궁주성"] || []).join("·") || "무주성"}</span>
            </div>
            {sung.LOOK && <Section title="용모"><Pungi>{sung.LOOK}</Pungi></Section>}
            {sung.CHAR && <Section title="성격"><Pungi>{sung.CHAR}</Pungi></Section>}
            {sung.FUTURE && <Section title="장래"><Pungi>{sung.FUTURE}</Pungi></Section>}
            {others.map((k) => {
                const f = p[k]; const txt = f.DATA || f.CHAR || Object.values(f).filter((v: any) => String(v).length > 20)[0];
                return txt ? <details key={k} className="glass-card p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-500">{k}</summary><div className="mt-2"><Pungi>{txt as any}</Pungi></div></details> : null;
            })}
        </div>
    );
}

function JuyeokView() {
    const [r, setR] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const 효 = (v: number) => ({ 6: "⚋ 노음(변)", 7: "⚊ 소양", 8: "⚋ 소음", 9: "⚊ 노양(변)" } as any)[v] || v;
    async function cast() {
        setLoading(true);
        try { setR(await (await fetch(`${API_BASE}/classic/juyeok`, { method: "POST" })).json()); }
        finally { setLoading(false); }
    }
    return (
        <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">동전 6번을 던져 본괘를 얻습니다</p>
                <Button onClick={cast} disabled={loading}>🪙 점치기</Button>
            </div>
            {r && <div className="space-y-3">
                <div className="text-center"><div className="text-2xl font-noto-serif text-[#bf953f]">{r["괘명"]}</div>
                    <div className="text-xs text-slate-400">{r["변효"]?.length ? `변효: ${r["변효"].join(", ")}효` : "변효 없음"}</div></div>
                <Pungi>{r["풀이"]}</Pungi>
            </div>}
        </div>
    );
}

function GimunView() {
    const PURP = ["금전", "질병", "연애", "이사", "여가", "청탁"];
    const now = new Date();
    const [purpose, setPurpose] = useState("금전");
    const [r, setR] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    async function go() {
        setLoading(true);
        try {
            const q = `${API_BASE}/classic/gimun?year=${now.getFullYear()}&month=${now.getMonth() + 1}&day=${now.getDate()}&hour=${now.getHours()}&purpose=${encodeURIComponent(purpose)}`;
            setR(await (await fetch(q)).json());
        } finally { setLoading(false); }
    }
    useEffect(() => { go(); /* eslint-disable-next-line */ }, [purpose]);
    const cls = (g: string) => g.includes("吉") ? "text-sky-600 dark:text-sky-400" : g.includes("凶") ? "text-rose-500" : "";
    return (
        <div className="space-y-3">
            <div className="glass-card p-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-500">목적</span>
                {PURP.map((p) => <button key={p} onClick={() => setPurpose(p)}
                    className={"px-3 py-1 rounded-full text-sm " + (purpose === p ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>{p}</button>)}
                {r && <span className="ml-auto text-xs text-slate-400">{r["국"]}</span>}
            </div>
            {loading ? <div className="glass-card p-6 text-center text-slate-500">…</div> :
                r && (r["방위"] || []).map((b: any, i: number) => (
                    <div key={i} className="glass-card p-3">
                        <div className="text-sm text-slate-500">▸{b["방위"]}({b["지지"]}) {b["천반"]}/{b["지반"]} <b className={cls(b["격"])}>{b["격"]}</b></div>
                        <Pungi>{b["풀이"]}</Pungi>
                    </div>
                ))}
        </div>
    );
}
