"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    starChart, periodOf, periodYears, STAR_NAMES, starMood, MOUNTAIN_INFO,
    mountainFromDeg, annualChart, comboFor, type Palace,
} from "@/lib/flyingStars";
import { mingGua, starFor, type Trigram, type Star } from "@/lib/eightMansions";
import { streamSSE } from "@/lib/analyzeStream";
import { ReportRenderer } from "@/components/ReportRenderer";
import { Button } from "@/components/ui/button";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 현공비성(玄空飛星) 뷰 — 좌산·조성(입주)년도로 비성반을 산출해 9궁으로 보여준다.
// 계산은 lib/flyingStars.ts(문헌 표준 + 실전 감정 사례 대조 검증 완료)만 사용한다.

// 9궁 3×3 배치 — 남상(전통: 위=남, 동=왼쪽) / 북상(지도식: 위=북, 동=오른쪽)
const GRID_S: Palace[][] = [
    ["巽", "離", "坤"],
    ["震", "中", "兌"],
    ["艮", "坎", "乾"],
];
const GRID_N: Palace[][] = [
    ["乾", "坎", "艮"],
    ["兌", "中", "震"],
    ["坤", "離", "巽"],
];
const PALACE_DIR: Record<Palace, string> = {
    坎: "북", 艮: "북동", 震: "동", 巽: "남동", 離: "남", 坤: "남서", 兌: "서", 乾: "북서", 中: "중궁",
};
const MOUNTAINS_24 = Object.keys(MOUNTAIN_INFO);

const MOOD_COLOR: Record<string, string> = {
    왕기: "text-[#bf953f] font-bold",
    생기: "text-emerald-600 dark:text-emerald-400 font-semibold",
    퇴기: "text-slate-400",
    쇠살: "text-rose-500/80",
};
// 팔택 팔성 중 길성
const GOOD_STARS: Star[] = ["생기", "천의", "연년", "복위"];

interface Props {
    birthYear?: number;            // 입춘 보정 연도(팔택 본명괘 통합용)
    gender?: "male" | "female";
}

/* ── 회전 나경판(24산+8괘) 그리기 도우미 ── */
const BRANCH_SET = new Set(["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]);
const YUY_SET = new Set(["乾", "坤", "艮", "巽"]);
// 방위각(0=북, 시계방향) → SVG 좌표
function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}
function sectorPath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
    const [x1, y1] = pt(cx, cy, r2, a1); const [x2, y2] = pt(cx, cy, r2, a2);
    const [x3, y3] = pt(cx, cy, r1, a2); const [x4, y4] = pt(cx, cy, r1, a1);
    return `M${x1},${y1} A${r2},${r2} 0 0 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 0 0 ${x4},${y4} Z`;
}

// 현공용 회전 나경판 — heading만큼 판이 돌아 위쪽 붉은 포인터가 '지금 향한 방위(向)'를 가리킨다.
function RotatingPlate({ heading, sitting, facing }: { heading: number | null; sitting: string; facing: string }) {
    const rot = -(heading ?? 0);
    const gua: [Trigram, string][] = [["坎", "북"], ["艮", "북동"], ["震", "동"], ["巽", "남동"], ["離", "남"], ["坤", "남서"], ["兌", "서"], ["乾", "북서"]];
    return (
        <div className="relative max-w-sm mx-auto select-none">
            <svg viewBox="0 0 400 400" className="w-full block" role="img"
                aria-label={`현공 나경판, 현재 ${heading == null ? "정지" : heading.toFixed(0) + "도"}`}>
                {/* 바탕 */}
                <circle cx={200} cy={200} r={192} fill="#f6efdc" stroke="#b09b62" strokeWidth={2} />
                <g transform={`rotate(${rot} 200 200)`}>
                    {/* 눈금 링: 5° 간격, 30° 굵게 + 숫자 */}
                    {Array.from({ length: 72 }, (_, i) => i * 5).map((a) => {
                        const major = a % 30 === 0;
                        const [x1, y1] = pt(200, 200, major ? 178 : 183, a);
                        const [x2, y2] = pt(200, 200, 190, a);
                        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a744a" strokeWidth={major ? 1.6 : 0.7} />;
                    })}
                    {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => {
                        const [x, y] = pt(200, 200, 170, a);
                        return <text key={a} x={x} y={y + 3} fontSize={9} fill="#7a6435" textAnchor="middle"
                            transform={`rotate(${a} ${x} ${y})`}>{a}</text>;
                    })}
                    {/* 24산 링 */}
                    {Object.entries(MOUNTAIN_INFO).map(([m, info]) => {
                        const a1 = info.deg - 7.5, a2 = info.deg + 7.5;
                        const isSit = m === sitting, isFace = m === facing;
                        const fill = isSit ? "#d4af37" : isFace ? "#9cc7e8" : "#faf4e4";
                        const color = BRANCH_SET.has(m) ? "#2b2b2b" : YUY_SET.has(m) ? "#a5303c" : "#1d4f8f";
                        const [tx, ty] = pt(200, 200, 138, info.deg);
                        return (
                            <g key={m}>
                                <path d={sectorPath(200, 200, 112, 163, a1, a2)} fill={fill} stroke="#b09b62" strokeWidth={0.8} />
                                <text x={tx} y={ty + 6} fontSize={19} fontWeight={700} fill={isSit ? "#fff" : color}
                                    textAnchor="middle" fontFamily="'Noto Serif KR',serif"
                                    transform={`rotate(${info.deg} ${tx} ${ty})`}>{m}</text>
                            </g>
                        );
                    })}
                    {/* 8괘 링 */}
                    {gua.map(([g, ko], i) => {
                        const mid = i * 45, a1 = mid - 22.5, a2 = mid + 22.5;
                        const [tx, ty] = pt(200, 200, 88, mid);
                        return (
                            <g key={g}>
                                <path d={sectorPath(200, 200, 62, 112, a1, a2)} fill="#f1e6c8" stroke="#b09b62" strokeWidth={0.8} />
                                <text x={tx} y={ty} fontSize={17} fontWeight={700} fill="#6b532a" textAnchor="middle"
                                    fontFamily="'Noto Serif KR',serif" transform={`rotate(${mid} ${tx} ${ty})`}>{g}</text>
                                <text x={tx} y={ty + 13} fontSize={8.5} fill="#8a744a" textAnchor="middle"
                                    transform={`rotate(${mid} ${tx} ${ty})`}>{ko}</text>
                            </g>
                        );
                    })}
                    {/* 중심 */}
                    <circle cx={200} cy={200} r={62} fill="#efe3c2" stroke="#b09b62" />
                    <line x1={200} y1={142} x2={200} y2={258} stroke="#c33" strokeWidth={0.8} opacity={0.6} />
                    <line x1={142} y1={200} x2={258} y2={200} stroke="#c33" strokeWidth={0.8} opacity={0.6} />
                </g>
                {/* 고정 포인터: 위=向(붉음), 아래=坐(파랑) */}
                <polygon points="200,6 193,26 207,26" fill="#c0392b" />
                <text x={214} y={22} fontSize={13} fontWeight={700} fill="#c0392b">向</text>
                <polygon points="200,394 193,374 207,374" fill="#1d4f8f" />
                <text x={214} y={386} fontSize={13} fontWeight={700} fill="#1d4f8f">坐</text>
                {/* 중앙 방위 표시 */}
                <text x={200} y={195} fontSize={16} fontWeight={700} fill="#6b532a" textAnchor="middle">
                    {heading == null ? "—" : `${heading.toFixed(0)}°`}
                </text>
                <text x={200} y={214} fontSize={11} fill="#8a744a" textAnchor="middle">
                    {heading == null ? "센서 대기" : `向 ${mountainFromDeg(heading)} · 坐 ${mountainFromDeg(heading + 180)}`}
                </text>
            </svg>
        </div>
    );
}

export default function FlyingStarsView({ birthYear, gender }: Props) {
    const now = new Date();
    const nowYear = now.getFullYear();
    // 연자백은 입춘(2/4경) 기준 연도
    const annualYear = now.getMonth() + 1 < 2 || (now.getMonth() + 1 === 2 && now.getDate() < 4) ? nowYear - 1 : nowYear;

    const [sitting, setSittingRaw] = useState("子");
    const [year, setYear] = useState(nowYear);
    const [degInput, setDegInput] = useState("");   // 좌향 각도(도) 직접 입력
    const [mapView, setMapView] = useState(false);  // 9궁 배치: false=남상(전통) / true=북상(지도식)
    const [interp, setInterp] = useState("");
    const [interpreting, setInterpreting] = useState(false);

    // 좌산 설정 — 도면 방위 탭이 이어받을 수 있게 저장해 둔다(실측 우선 플로우 연동)
    const setSitting = (m: string) => {
        setSittingRaw(m);
        try { window.localStorage.setItem("destiny-luopan-sitting", m); } catch { /* 무시 */ }
    };

    // ── 나침반: 센서로 현재 방위를 읽어 좌산을 잡는다 (자북 기준) ──
    const [sensorOn, setSensorOn] = useState(false);
    const [heading, setHeading] = useState<number | null>(null);
    const [capturing, setCapturing] = useState(false);   // 3초 평균 측정 중
    const [capNote, setCapNote] = useState("");           // 측정 결과 안내(평균·편차)
    const headingRef = useRef<number | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => () => { cleanupRef.current?.(); }, []); // 언마운트 시 리스너 해제

    async function startSensor() {
        // iOS는 사용자 제스처 안에서 권한 요청이 필요하다
        const DOE = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<PermissionState>;
        }) | undefined;
        if (DOE && typeof DOE.requestPermission === "function") {
            try { if ((await DOE.requestPermission()) !== "granted") return; } catch { return; }
        }
        const onOrient = (e: DeviceOrientationEvent) => {
            const compass = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
            let h: number | null = null;
            if (typeof compass === "number") h = compass;                    // iOS
            else if (e.absolute && e.alpha != null) h = 360 - e.alpha;       // 절대 방위
            else if (e.alpha != null) h = 360 - e.alpha;                     // 상대(참고용)
            if (h != null) {
                const norm = ((h % 360) + 360) % 360;
                headingRef.current = norm;   // 평균 측정용 최신값
                setHeading(norm);
            }
        };
        // deviceorientationabsolute 우선, 없으면 deviceorientation
        const evName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
        window.addEventListener(evName as "deviceorientation", onOrient as EventListener);
        cleanupRef.current = () => window.removeEventListener(evName as "deviceorientation", onOrient as EventListener);
        setSensorOn(true);
    }

    // 휴대폰 위쪽을 집 정면(향)으로 향한 상태에서 3초간 표본을 모아 원형 평균으로
    // 좌(반대 방위)를 잡는다. 손떨림·자기 간섭에 의한 순간값 오차를 줄인다.
    const captureSitting = () => {
        if (headingRef.current == null || capturing) return;
        setCapturing(true); setCapNote("");
        const samples: number[] = [];
        const iv = setInterval(() => {
            if (headingRef.current != null) samples.push(headingRef.current);
        }, 100);
        setTimeout(() => {
            clearInterval(iv);
            setCapturing(false);
            if (samples.length < 5) { setCapNote("표본이 부족합니다. 다시 측정해 주세요."); return; }
            // 원형 평균(각도는 0/360 경계가 있어 산술 평균 불가)
            const sx = samples.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0);
            const sy = samples.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0);
            const mean = ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
            const R = Math.hypot(sx, sy) / samples.length;          // 집중도(1=완전 일치)
            const stdDeg = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-9)))) * (180 / Math.PI);
            const sit = mountainFromDeg(mean + 180);
            setSitting(sit);
            setCapNote(
                `평균 向 ${mean.toFixed(1)}° (편차 ±${stdDeg.toFixed(1)}°) → 坐 ${sit}`
                + (stdDeg > 8 ? " ⚠ 값이 많이 흔들립니다. 철골·가전에서 떨어져 다른 지점에서 다시 재보세요." : "")
            );
        }, 3000);
    };

    const chart = useMemo(() => {
        try { return starChart(sitting, periodOf(year)); } catch { return null; }
    }, [sitting, year]);
    const annual = useMemo(() => annualChart(annualYear), [annualYear]);
    const period = periodOf(year);
    const [py0, py1] = periodYears(period);

    // 팔택 본명괘(있으면 궁별 팔성 표시 + 교집합 추천)
    const ming: Trigram | null = useMemo(() => {
        if (!birthYear || !gender) return null;
        try { return mingGua(birthYear, gender); } catch { return null; }
    }, [birthYear, gender]);

    // 각도 입력 → 좌산 자동 설정 (팔택 나경 탭에서 잰 값을 옮겨 적는 용도)
    const applyDeg = () => {
        const d = parseFloat(degInput);
        if (Number.isFinite(d)) setSitting(mountainFromDeg(d));
    };

    // 9궁 배치(남상/북상 토글 반영)
    const grid = mapView ? GRID_N : GRID_S;

    // 궁별 표시 데이터 — 조합·팔택까지 합성
    const cells = useMemo(() => {
        if (!chart) return [];
        return grid.flat().map((p) => {
            const combo = p === "中" ? null : comboFor(chart.mountain[p], chart.water[p]);
            const palTri = p === "中" ? null : (p as Trigram);
            const palStar = ming && palTri ? starFor(ming, palTri) : null;
            return { p, combo, palStar };
        });
    }, [chart, ming, grid]);

    // 교집합 추천: 팔택 길성 ∩ 향성 왕/생기
    const bestDirs = useMemo(() => {
        if (!chart || !ming) return [];
        return GRID_S.flat().filter((p) => {
            if (p === "中") return false;
            const mood = starMood(chart.water[p], chart.period);
            const ps = starFor(ming, p as Trigram);
            return (mood === "왕기" || mood === "생기") && GOOD_STARS.includes(ps);
        }).map((p) => `${PALACE_DIR[p]}(향성 ${chart.water[p]}·팔택 ${starFor(ming, p as Trigram)})`);
    }, [chart, ming]);

    // 올해 주의 방위(연자백 오황·이흑)
    const warnDirs = useMemo(() => {
        const w: string[] = [];
        (Object.entries(annual) as [Palace, number][]).forEach(([p, n]) => {
            if (p === "中") return;
            if (n === 5) w.push(`${PALACE_DIR[p]}(오황)`);
            if (n === 2) w.push(`${PALACE_DIR[p]}(이흑)`);
        });
        return w;
    }, [annual]);

    async function interpret() {
        if (!chart) return;
        setInterpreting(true); setInterp("");
        const body = {
            sitting: chart.sitting, facing: chart.facing, period: chart.period,
            structure: chart.structure, annual_year: annualYear,
            ming_gua: ming ?? "",
            cells: GRID_S.flat().filter((p) => p !== "中").map((p) => ({
                방위: PALACE_DIR[p], 산성: chart.mountain[p], 향성: chart.water[p], 운반: chart.base[p],
                연성: annual[p], 조합: comboFor(chart.mountain[p], chart.water[p])?.name ?? "",
                팔택: ming ? starFor(ming, p as Trigram) : "",
            })),
        };
        try {
            await streamSSE(`${API_BASE}/classic/hyeongong/analyze`, body, setInterp);
        } catch {
            setInterp("해석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally { setInterpreting(false); }
    }

    return (
        <div className="space-y-3">
            <div className="glass-card p-4 space-y-3">
                {/* ① 실측이 1순위 — 좌향은 현장에서 재는 것이 정확하다(아파트는 동마다 배치각이 다름) */}
                <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                    <b>① 좌향 실측이 먼저입니다.</b> 아파트는 동마다 배치각이 달라 도면·지도만으로는 좌향을 알 수 없습니다. 외벽·베란다 유리면에 휴대폰 옆면을 평행하게 대고, 철골·가전에서 떨어져 2~3곳에서 재세요.
                </div>
                {/* 회전 나경판 — 센서 heading에 따라 판이 돌고, 위 포인터가 지금 향한 방위(向) */}
                <RotatingPlate heading={heading} sitting={sitting} facing={chart?.facing ?? ""} />
                {/* 센서 제어 — 3초 평균 측정으로 좌산 자동 설정 */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    {!sensorOn ? (
                        <Button onClick={startSensor} variant="outline" className="h-8 rounded-full text-xs">🧭 센서로 방위 재기</Button>
                    ) : heading == null ? (
                        <span className="text-xs text-slate-400">센서 신호 대기 중… (실제 휴대폰에서만 동작)</span>
                    ) : (
                        <>
                            <span className="text-xs">지금 향한 방위 <b className="text-[#bf953f]">{heading.toFixed(1)}°</b> (<b className="font-noto-serif">{mountainFromDeg(heading)}</b>)</span>
                            <Button onClick={captureSitting} disabled={capturing} className="h-8 rounded-full text-xs bg-slate-900 text-white dark:bg-[#d4af37] dark:text-slate-900">
                                {capturing ? "측정 중(3초)…" : "집 정면을 향하고 → 좌향 잡기(3초 평균)"}
                            </Button>
                        </>
                    )}
                    <span className="text-[11px] text-slate-400">휴대폰 위쪽을 집 정면(향)으로 향한 채 3초간 유지하세요</span>
                </div>
                {capNote && <p className="text-[11px] text-slate-500 dark:text-slate-400">{capNote}</p>}
                {/* ② 각도 직접 입력(다른 나경으로 실측한 값 옮겨 적기) */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>② 실측 좌향 각도(도)</span>
                    <input type="number" value={degInput} placeholder="예: 187.5"
                        onChange={(e) => setDegInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyDeg(); }}
                        className="w-24 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <Button onClick={applyDeg} variant="outline" className="h-8 rounded-full text-xs">각도 → 좌산</Button>
                    <span className="text-[11px] text-slate-400">팔택 나경 탭이나 실물 패철로 잰 좌 방위각을 그대로 입력</span>
                </div>
                {/* ③ 수동 선택(실측값이 이미 확실할 때) */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>③ 좌(坐)</span>
                    <select value={sitting} onChange={(e) => setSitting(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                        {MOUNTAINS_24.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="text-slate-400">→ 향(向) <b className="font-noto-serif text-[#bf953f]">{chart?.facing}</b></span>
                    <span className="ml-2">조성·입주년</span>
                    <input type="number" value={year} min={1864} max={2100}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-20 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <span className="text-xs text-slate-400">{period}운 ({py0}~{py1})</span>
                </div>
                <p className="text-[11px] text-slate-400">
                    건물이 지어진(입주한) 시기의 운(運)과 좌향으로 비성반을 세웁니다. 좌(坐)는 건물이 등지는 방위, 향(向)은 정면이 바라보는 방위입니다.
                </p>
            </div>

            {chart && (
                <div className="glass-card p-4 space-y-3">
                    <div className="text-center">
                        <span className="text-sm text-slate-500">{chart.period}운 <b className="font-noto-serif text-slate-800 dark:text-slate-100">{chart.sitting}山{chart.facing}向</b> · </span>
                        <span className={"text-sm font-bold " + (chart.structure === "왕산왕향" ? "text-emerald-600 dark:text-emerald-400" : chart.structure === "상산하수" ? "text-rose-500" : "text-[#bf953f]")}>{chart.structure}</span>
                    </div>
                    {/* 배치 토글 — 남상(전통 서적·필기와 동일) / 북상(지도·도면과 동일) */}
                    <div className="flex items-center justify-center gap-1.5 text-xs">
                        <button onClick={() => setMapView(false)}
                            className={"px-3 py-1 rounded-full font-semibold " + (!mapView ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>
                            남상(전통)
                        </button>
                        <button onClick={() => setMapView(true)}
                            className={"px-3 py-1 rounded-full font-semibold " + (mapView ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>
                            북상(지도식)
                        </button>
                        <span className="text-[10px] text-slate-400">{mapView ? "위=북 · 동=오른쪽 (도면과 같은 방향)" : "위=남 · 동=왼쪽 (전통 반 표기)"}</span>
                    </div>
                    {/* 9궁 비성반 (+연자백·조합·팔택) */}
                    <div className="grid grid-cols-3 gap-1.5 max-w-sm mx-auto">
                        {cells.map(({ p, combo, palStar }) => {
                            const isSit = p !== "中" && MOUNTAIN_INFO[chart.sitting].palace === p;
                            const isFace = p !== "中" && MOUNTAIN_INFO[chart.facing].palace === p;
                            const an = annual[p];
                            return (
                                <div key={p} className={"rounded-xl border p-2 text-center " +
                                    (isSit ? "border-[#d4af37] bg-[#d4af37]/10" : isFace ? "border-sky-400 bg-sky-50/60 dark:bg-sky-900/20" : "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40")}>
                                    <div className="flex justify-between text-base font-noto-serif px-1">
                                        <span className={MOOD_COLOR[starMood(chart.mountain[p], chart.period)]}>{chart.mountain[p]}</span>
                                        <span className={MOOD_COLOR[starMood(chart.water[p], chart.period)]}>{chart.water[p]}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">{chart.base[p]} <span className={an === 5 || an === 2 ? "text-rose-500 font-bold" : ""}>年{an}</span></div>
                                    <div className="text-[10px] text-slate-500">{PALACE_DIR[p]}{isSit ? " · 坐" : isFace ? " · 向" : ""}</div>
                                    {combo && <div className={"text-[9px] " + (combo.grade === "길" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>{combo.name}</div>}
                                    {palStar && <div className={"text-[9px] " + (GOOD_STARS.includes(palStar) ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-slate-400")}>택 {palStar}</div>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-[11px] text-slate-400 text-center">각 궁: 좌=산성(인정) · 우=향성(재물) · 아래=운반·年연자백{ming ? " · 택=팔택 팔성" : ""}</div>

                    <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        <b className="text-[#bf953f]">{chart.structure}</b> — {chart.structureNote}
                    </div>

                    {/* 궁별 주요 조합 해설 */}
                    {cells.some((c) => c.combo) && (
                        <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                            {cells.filter((c) => c.combo).map(({ p, combo }) => (
                                <div key={p}>
                                    <b className={combo!.grade === "길" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>{PALACE_DIR[p]} {combo!.name}</b>
                                    <span className="text-slate-500"> — {combo!.note}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 올해의 연자백 주의·추천 */}
                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <div><b className="text-rose-500">⚠ {annualYear}년 주의 방위</b> — {warnDirs.join(", ") || "없음"} <span className="text-slate-400">(연자백 오황·이흑: 공사·침상 배치 회피)</span></div>
                        {ming && bestDirs.length > 0 && (
                            <div><b className="text-emerald-600 dark:text-emerald-400">✦ 추천 방위(팔택 {ming}명 × 향성 왕·생기)</b> — {bestDirs.join(", ")}</div>
                        )}
                    </div>

                    <div className="text-[11px] text-slate-400 leading-relaxed">
                        <span className={MOOD_COLOR["왕기"]}>{STAR_NAMES[chart.period]}</span>=당운 왕기 ·
                        <span className={MOOD_COLOR["생기"]}> 생기</span>(다음 운) ·
                        <span className={MOOD_COLOR["퇴기"]}> 퇴기</span> ·
                        <span className={MOOD_COLOR["쇠살"]}> 쇠살</span>.
                        향성 왕·생기 방위에 물(도로·출입구), 산성 왕·생기 방위에 산(높은 가구·벽)이 이상적입니다. 현공비성 기준이며 유파에 따라 해석이 다를 수 있습니다.
                    </div>

                    <Button onClick={interpret} disabled={interpreting} className="w-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#d4af37] dark:text-slate-900">
                        {interpreting ? "풀이 중..." : "✨ AI 현공 풀이"}
                    </Button>
                </div>
            )}

            {interp && (
                <div className="glass-card p-5">
                    <ReportRenderer text={interp} streaming={interpreting} />
                </div>
            )}
        </div>
    );
}
