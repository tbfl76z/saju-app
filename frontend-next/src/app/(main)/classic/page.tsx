"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listProfilesPrimaryFirst, type SavedProfile } from "@/lib/storage";
import { streamSSE } from "@/lib/analyzeStream";
import { ReportRenderer } from "@/components/ReportRenderer";

// 자미두수 성요·묘왕·사화·궁명 한자 → 한글 (한글 토글용)
const HANJA_KO: Record<string, string> = {
    // 14주성
    "紫微": "자미", "天機": "천기", "太陽": "태양", "武曲": "무곡", "天同": "천동", "廉貞": "염정",
    "天府": "천부", "太陰": "태음", "貪狼": "탐랑", "巨門": "거문", "天相": "천상", "天梁": "천량", "七殺": "칠살", "破軍": "파군",
    // 보조성
    "文昌": "문창", "文曲": "문곡", "左輔": "좌보", "右弼": "우필", "天魁": "천괴", "天鉞": "천월", "祿存": "녹존", "天馬": "천마",
    "擎羊": "경양", "陀羅": "타라", "火星": "화성", "鈴星": "영성", "地空": "지공", "地劫": "지겁",
    // 잡성
    "天刑": "천형", "天姚": "천요", "紅鸞": "홍란", "天喜": "천희", "龍池": "용지", "鳳閣": "봉각", "天哭": "천곡", "天虛": "천허",
    "孤辰": "고신", "寡宿": "과숙", "三台": "삼태", "八座": "팔좌", "天官": "천관", "天福": "천복", "天傷": "천상", "天使": "천사", "旬空": "순공",
    // 박사12신
    "博士": "박사", "力士": "역사", "青龍": "청룡", "小耗": "소모", "將軍": "장군", "奏書": "주서", "飛廉": "비렴", "喜神": "희신",
    "病符": "병부", "大耗": "대모", "伏兵": "복병", "官符": "관부",
    // 장생12신
    "長生": "장생", "沐浴": "목욕", "冠帶": "관대", "臨官": "임관", "帝旺": "제왕", "衰": "쇠", "病": "병", "死": "사", "墓": "묘", "絕": "절", "胎": "태", "養": "양",
    // 사화
    "化祿": "화록", "化權": "화권", "化科": "화과", "化忌": "화기",
    // 묘왕
    "廟": "묘", "旺": "왕", "得地": "득지", "利": "리", "平": "평", "不得地": "불득지", "陷": "함", "失": "실",
    // 12궁명
    "命宮": "명궁", "兄弟": "형제", "夫妻": "부처", "子女": "자녀", "財帛": "재백", "疾厄": "질액",
    "遷移": "천이", "奴僕": "노복", "官祿": "관록", "田宅": "전택", "福德": "복덕", "父母": "부모",
};
const ko = (x: string) => HANJA_KO[x] || x;

// 성요 분류별 색상 (길성=파랑, 살성=빨강, 잡성=회색)
const GILSEONG = new Set(["文昌", "文曲", "左輔", "右弼", "天魁", "天鉞", "祿存", "天馬"]);
const SALSEONG = new Set(["擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"]);
const auxColor = (s: string) =>
    GILSEONG.has(s) ? "text-sky-600 dark:text-sky-400"
        : SALSEONG.has(s) ? "text-rose-500 dark:text-rose-400"
            : "text-slate-400 dark:text-slate-500";
// 묘왕 색상 (廟旺득지=금색 길 / 함실불득지=회색 / 그 외 중간)
const mwColor = (g: string) =>
    ["廟", "旺", "得地"].includes(g) ? "text-amber-600 dark:text-amber-500"
        : ["陷", "失", "不得地"].includes(g) ? "text-slate-400"
            : "text-slate-500 dark:text-slate-400";
// 12지지 방위
const JAMI_DIR: Record<string, string> = {
    "子": "정북", "丑": "북동", "寅": "동북", "卯": "정동", "辰": "동남", "巳": "남동",
    "午": "정남", "未": "남서", "申": "서남", "酉": "정서", "戌": "서북", "亥": "북서",
};

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
// hangul=true 이면 성요·묘왕·사화·궁명을 한글로 표시
function JamiCell({ cell, zi, hangul }: { cell: any; zi: string; hangul: boolean }) {
    const hwaOf: Record<string, string> = {};
    (cell["사화"] || []).forEach((s: any) => { hwaOf[s["성"]] = s["화"]; });
    const miowang: Record<string, string> = cell["묘왕"] || {};
    const aux = [...(cell["보좌"] || []), ...(cell["잡성"] || [])];
    const tr = (x: string) => (hangul ? ko(x) : x);
    return (
        <div className={"rounded-md border p-1.5 min-h-[178px] flex flex-col font-noto-serif " +
            (cell["is명궁"] ? "border-[#d4af37] bg-[#d4af37]/12" : "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40")}>
            {/* 보조성·잡성 (위) — 길성 파랑 / 살성 빨강 / 잡성 회색 */}
            <div className="flex flex-wrap gap-x-1 text-[11px] leading-tight">
                {aux.map((s: string, i: number) => <span key={i} className={auxColor(s)}>{tr(s)}</span>)}
            </div>
            {/* 주성 + 묘왕 + 사화 */}
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 flex-1 content-start">
                {(cell["주성"] || []).length
                    ? (cell["주성"] || []).map((s: string, i: number) => {
                        const han = (cell["주성한글"] || [])[i];
                        const hwa = hwaOf[s];
                        return (
                            <span key={i} className="text-[19px] font-bold text-slate-800 dark:text-slate-100 leading-none">
                                {hangul ? (han || ko(s)) : s}
                                {miowang[han] && <sub className={"text-[11px] font-normal ml-px " + mwColor(miowang[han])}>{tr(miowang[han])}</sub>}
                                {hwa && <sup className={"text-[11px] font-bold ml-px " + (HWA_COLOR[hwa] || "")}>{hangul ? ko(hwa)[1] : hwa[1]}</sup>}
                            </span>
                        );
                    })
                    : <span className="text-[12px] text-slate-300 dark:text-slate-600">{hangul ? "무주성" : "無主星"}</span>}
            </div>
            {/* 박사신 · 장생신 */}
            <div className="flex justify-between text-[11px] text-emerald-700/70 dark:text-emerald-500/70 leading-none mt-1">
                <span>{tr(cell["박사신"] || "")}</span><span>{tr(cell["장생신"] || "")}</span>
            </div>
            {/* 대한 · 소한 · 유년 */}
            <div className="text-[9px] text-slate-400 leading-tight mt-0.5">
                <div>{hangul ? "대한" : "大限"} {cell["대한"]}</div>
                <div>{hangul ? "소한" : "小限"} {(cell["소한"] || []).slice(0, 5).join(",")}</div>
                <div>{hangul ? "유년" : "流年"} {(cell["유년"] || []).slice(0, 5).join(",")}</div>
            </div>
            {/* 궁명 + 신궁 + 방위 + 간지 */}
            <div className="flex justify-between items-end mt-1">
                <span className={"text-[14px] leading-none " + (cell["is명궁"] ? "text-[#bf953f] font-bold" : "text-slate-600 dark:text-slate-300")}>
                    {hangul ? (cell["궁"] || tr(cell["궁한자"])) : (cell["궁한자"] || cell["궁"])}
                    {cell["is신궁"] && <span className="text-[10px] text-rose-500 font-bold ml-0.5">{hangul ? "신" : "身"}</span>}
                    <span className="text-[9px] text-slate-400 ml-0.5">{JAMI_DIR[zi] || ""}</span>
                </span>
                <span className="text-[14px] text-indigo-500 dark:text-indigo-400 leading-none">{cell["궁간지"] || zi}</span>
            </div>
        </div>
    );
}

function JamiBoard({ jami, hangul }: { jami: any; hangul: boolean }) {
    const board: any[] = jami["명반"] || [];
    if (!board.length) return null;
    const byZi: Record<string, any> = {};
    board.forEach((c) => (byZi[c["지지"]] = c));
    const juseong = (jami["명궁주성"] || []).map((s: string) => (hangul ? ko(s) : s)).join("·") || (hangul ? "무주성" : "無主星");
    return (
        <div className="glass-card p-2 overflow-x-auto">
            <div className="grid grid-cols-4 grid-rows-4 gap-1 min-w-[600px]">
                <div style={{ gridRow: "2 / 4", gridColumn: "2 / 4" }}
                    className="flex flex-col items-center justify-center text-center gap-1 rounded-lg bg-[#d4af37]/8 border border-[#d4af37]/30 font-noto-serif">
                    <div className="text-xs text-slate-400">{hangul ? "자미두수 명반" : "紫微斗數 命盤"}</div>
                    <div className="text-lg font-bold text-[#bf953f]">{jami["五行局"]}</div>
                    <div className="text-xs text-slate-500">명궁 {jami["명궁"]} · {juseong}</div>
                    {(jami["명주"] || jami["신주"]) && (
                        <div className="text-[10px] text-slate-500">{hangul ? "명주" : "命主"} {jami["명주"]} · {hangul ? "신주" : "身主"} {jami["신주"]} · {hangul ? "신궁" : "身宮"} {jami["신궁"]}</div>
                    )}
                    {jami["음력"] && <div className="text-[10px] text-slate-400">음력 {jami["음력"]}</div>}
                    {/* 자화기호 범례 */}
                    <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 text-[9px] mt-1 font-bold">
                        <span className="text-emerald-600 dark:text-emerald-400">祿</span>
                        <span className="text-blue-600 dark:text-blue-400">權</span>
                        <span className="text-violet-600 dark:text-violet-400">科</span>
                        <span className="text-rose-600 dark:text-rose-400">忌</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-1.5 text-[8px] text-slate-400">
                        <span className="text-sky-600 dark:text-sky-400">길성</span>
                        <span className="text-rose-500">살성</span>
                        <span>잡성</span>
                        <span className="text-amber-600">묘·왕</span>
                    </div>
                    <div className="text-[8px] text-slate-400">묘왕<sub>아래</sub> · 사화<sup>위</sup></div>
                </div>
                {Object.entries(JAMI_POS).map(([zi, [r, c]]) => {
                    const cell = byZi[zi];
                    if (!cell) return null;
                    return <div key={zi} style={{ gridRow: r, gridColumn: c }}><JamiCell cell={cell} zi={zi} hangul={hangul} /></div>;
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
    const [hangul, setHangul] = useState(false);
    // AI 해석 (주제별 세분화)
    const [interp, setInterp] = useState("");
    const [interpreting, setInterpreting] = useState(false);
    const [focus, setFocus] = useState("");
    const reqBody = (d: typeof dt) => ({ name: "", gender: d.gender, year: d.y, month: d.m, day: d.d, hour: d.h, minute: 0, calendar: "양력" });
    async function go(d = dt) {
        setLoading(true); setInterp("");
        try {
            const res = await fetch(`${API_BASE}/classic/full`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody(d)),
            });
            setJami((await res.json())["자미두수"]);
        } finally { setLoading(false); }
    }
    async function interpret(f: string) {
        setFocus(f); setInterpreting(true); setInterp("");
        try {
            await streamSSE(`${API_BASE}/classic/jami/analyze`, { ...reqBody(dt), focus: f }, setInterp);
        } catch {
            setInterp("해석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally { setInterpreting(false); }
    }
    // 프로필 로드/변경 시 날짜 입력창(dt)도 프로필 값으로 동기화 후 명반 로드 (입력창-명반 불일치 방지)
    useEffect(() => { setDt(init); setInterp(""); setFocus(""); go(init); /* eslint-disable-next-line */ }, [profile?.id]);
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
            {loading ? <div className="glass-card p-8 text-center text-slate-500">…</div> : jami && <>
                {/* 한자/한글 토글 */}
                <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setHangul(false)}
                        className={"px-3 py-1 rounded-full text-xs font-semibold " + (!hangul ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>漢字</button>
                    <button onClick={() => setHangul(true)}
                        className={"px-3 py-1 rounded-full text-xs font-semibold " + (hangul ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>한글</button>
                </div>
                <JamiBoard jami={jami} hangul={hangul} />
                {/* AI 해석 — 주제별 세분화 */}
                <div className="glass-card p-3">
                    <div className="text-xs text-slate-500 mb-2">🔮 AI 해석 — 주제 선택</div>
                    <div className="flex flex-wrap gap-1.5">
                        {[["종합", "종합"], ["성격", "성격·기질"], ["재물", "재물운"], ["애정", "애정·결혼"], ["직업", "직업운"], ["건강", "건강운"], ["대한", "현재 대운"], ["유년", "올해 유년"]].map(([f, label]) => (
                            <button key={f} onClick={() => interpret(f)} disabled={interpreting}
                                className={"px-3 py-1.5 rounded-full text-xs font-semibold transition-colors " +
                                    (focus === f ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                                        : "text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-white/60 dark:hover:bg-slate-800/60")}>
                                {interpreting && focus === f ? "해석 중…" : label}
                            </button>
                        ))}
                    </div>
                </div>
                {interp && <div className="glass-card p-5"><ReportRenderer text={interp} streaming={interpreting} /></div>}
            </>}
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
    const [mode, setMode] = useState<"natal" | "div">("div");  // 기문방위는 날짜 가변이 기본 — 점단·방위로 진입
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
