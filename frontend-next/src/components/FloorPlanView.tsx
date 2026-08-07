"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { exportAsImage } from "@/lib/exportImage";
import { notify } from "@/lib/useToast";
import { MOUNTAIN_INFO, starChart, periodOf, annualChart, starMood, type Palace } from "@/lib/flyingStars";
import { mingGua, starFor, type Trigram, type Star } from "@/lib/eightMansions";

// 도면 방위 오버레이 — 도면/위성사진을 불러와 중심점을 찍고 북쪽을 맞추면
// 24산 방사선(+팔택/현공 정보)을 겹쳐 보여준다. 전부 클라이언트에서 처리(업로드 없음).
// 향후: 주소 검색 → 아파트 도면 API 자동 로드로 확장 예정.

type OverlayMode = "24산" | "팔택" | "현공";
const GOOD_STARS: Star[] = ["생기", "천의", "연년", "복위"];
const GUA8: Trigram[] = ["坎", "艮", "震", "巽", "離", "坤", "兌", "乾"];

// 방위각(0=북, 시계방향) → 이미지 좌표 방향벡터
function dir(deg: number): [number, number] {
    const rad = (deg * Math.PI) / 180;
    return [Math.sin(rad), -Math.cos(rad)];
}

interface Props {
    birthYear?: number;
    gender?: "male" | "female";
}

export default function FloorPlanView({ birthYear, gender }: Props) {
    const [img, setImg] = useState<string | null>(null);
    const [natural, setNatural] = useState<[number, number]>([1000, 750]);
    const [center, setCenter] = useState<[number, number] | null>(null);
    const [northDeg, setNorthDeg] = useState(0);      // 도면 상단이 가리키는 실제 방위각
    const [mode, setMode] = useState<OverlayMode>("24산");
    // 현공 모드용 좌산 — 현공비성 탭에서 실측한 값이 있으면 이어받는다(실측 우선 플로우)
    const [sitting, setSitting] = useState(() => {
        try {
            const saved = typeof window !== "undefined" ? window.localStorage.getItem("destiny-luopan-sitting") : null;
            return saved && MOUNTAIN_INFO[saved] ? saved : "子";
        } catch { return "子"; }
    });
    const [year, setYear] = useState(new Date().getFullYear());
    const [saving, setSaving] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    const [natW, natH] = natural;
    const cx = center?.[0] ?? natW / 2;
    const cy = center?.[1] ?? natH / 2;
    const L = Math.hypot(natW, natH);                 // 화면 밖까지 뻗는 선 길이
    const rLabel = Math.min(natW, natH) * 0.4;

    const ming: Trigram | null = useMemo(() => {
        if (!birthYear || !gender) return null;
        try { return mingGua(birthYear, gender); } catch { return null; }
    }, [birthYear, gender]);

    const chart = useMemo(() => {
        try { return starChart(sitting, periodOf(year)); } catch { return null; }
    }, [sitting, year]);
    const now = new Date();
    const annualYear = now.getMonth() + 1 < 2 || (now.getMonth() + 1 === 2 && now.getDate() < 4) ? now.getFullYear() - 1 : now.getFullYear();
    const annual = useMemo(() => annualChart(annualYear), [annualYear]);

    // 파일 업로드 → dataURL (서버 전송 없음)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
            const url = String(rd.result);
            const im = new Image();
            im.onload = () => { setNatural([im.naturalWidth, im.naturalHeight]); setCenter(null); setImg(url); };
            im.src = url;
        };
        rd.readAsDataURL(f);
    };

    // 이미지 클릭 → 중심점 지정 (렌더 좌표 → 원본 좌표 변환)
    const onPick = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = boxRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setCenter([((e.clientX - r.left) / r.width) * natW, ((e.clientY - r.top) / r.height) * natH]);
    };

    // 방위각 → 화면 각도(도면 상단이 northDeg를 가리키므로 그만큼 보정)
    const screenDeg = (d: number) => d - northDeg;

    const handleSave = async () => {
        if (!boxRef.current) return;
        setSaving(true);
        try { await exportAsImage(boxRef.current, "destiny-도면방위"); notify.success("이미지를 저장했습니다"); }
        catch { notify.error("저장에 실패했습니다"); }
        finally { setSaving(false); }
    };

    // 8괘 부채꼴(반투명) — 팔택/현공 모드 배경
    const wedge = (midDeg: number): string => {
        const a1 = screenDeg(midDeg - 22.5), a2 = screenDeg(midDeg + 22.5);
        const [dx1, dy1] = dir(a1); const [dx2, dy2] = dir(a2);
        // 중심→부채꼴(반지름 L) — 이미지 밖은 클리핑됨
        return `M${cx},${cy} L${cx + dx1 * L},${cy + dy1 * L} A${L},${L} 0 0 1 ${cx + dx2 * L},${cy + dy2 * L} Z`;
    };

    return (
        <div className="space-y-3">
            {/* 실측 우선 경고 — 도면 오버레이는 실측 좌향이 있어야 의미가 있다 */}
            <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                <b>도면 오버레이는 참고용입니다.</b> 아파트는 동마다 배치각이 달라 도면이 얼마나 틀어져 있는지 실측 없이는 알 수 없습니다.
                먼저 <b>현공비성 탭에서 좌향을 실측</b>(또는 실물 패철로 측정)한 뒤, 그 값에 맞춰 아래 &lsquo;도면 상단의 실제 방위&rsquo;를 조정하세요.
                위성지도 캡처는 대개 위=북(0°)이라 그대로 쓸 수 있습니다.
            </div>
            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <label className="inline-flex items-center px-3 py-1.5 rounded-full border border-[#d4af37]/40 text-[#bf953f] text-xs font-bold cursor-pointer hover:bg-[#d4af37]/10">
                        📐 도면/사진 불러오기
                        <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                    </label>
                    <span className="mx-1">모드</span>
                    {(["24산", "팔택", "현공"] as OverlayMode[]).map((m) => (
                        <button key={m} onClick={() => setMode(m)}
                            className={"px-3 py-1 rounded-full text-xs font-semibold " + (mode === m ? "bg-[#d4af37]/15 text-[#bf953f]" : "text-slate-400")}>
                            {m}{m === "팔택" && !ming ? "(명식 필요)" : ""}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <span>도면 상단의 실제 방위</span>
                    <input type="range" min={0} max={359} value={northDeg} onChange={(e) => setNorthDeg(Number(e.target.value))} className="w-36 accent-[#d4af37]" />
                    <input type="number" min={0} max={359} value={northDeg} onChange={(e) => setNorthDeg(Number(e.target.value))}
                        className="w-16 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                    <span className="text-xs text-slate-400">° (위성지도 캡처는 대개 0=북)</span>
                </div>
                {mode === "현공" && (
                    <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                        <span>좌(坐)</span>
                        <select value={sitting} onChange={(e) => setSitting(e.target.value)}
                            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                            {Object.keys(MOUNTAIN_INFO).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <span>입주년</span>
                        <input type="number" value={year} min={1864} max={2100} onChange={(e) => setYear(Number(e.target.value))}
                            className="w-20 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                        {chart && <span className="text-xs text-[#bf953f] font-semibold">{chart.period}운 {chart.sitting}山{chart.facing}向 · {chart.structure}</span>}
                    </div>
                )}
                <p className="text-[11px] text-slate-400">
                    도면을 불러온 뒤 <b>집(터) 중심을 탭</b>하면 방위선이 그 점 기준으로 그려집니다. 이미지는 기기에서만 처리되며 서버로 전송되지 않습니다.
                </p>
            </div>

            {img ? (
                <>
                    <div ref={boxRef} onClick={onPick} className="relative rounded-2xl overflow-hidden border border-[#d4af37]/30 cursor-crosshair bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="도면" className="w-full block" />
                        <svg viewBox={`0 0 ${natW} ${natH}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                            {/* 8괘 반투명 부채꼴 (팔택/현공) */}
                            {mode !== "24산" && GUA8.map((g, i) => {
                                const mid = i * 45;
                                let fill = "transparent";
                                if (mode === "팔택" && ming) {
                                    const st = starFor(ming, g);
                                    fill = GOOD_STARS.includes(st) ? "rgba(46,139,107,0.16)" : "rgba(165,48,60,0.14)";
                                } else if (mode === "현공" && chart) {
                                    const mood = starMood(chart.water[g as Palace], chart.period);
                                    fill = mood === "왕기" ? "rgba(212,175,55,0.22)" : mood === "생기" ? "rgba(46,139,107,0.16)"
                                        : mood === "쇠살" ? "rgba(165,48,60,0.10)" : "rgba(120,120,120,0.06)";
                                }
                                return <path key={g} d={wedge(mid)} fill={fill} />;
                            })}
                            {/* 24산 경계선 */}
                            {Array.from({ length: 24 }, (_, k) => 7.5 + k * 15).map((b) => {
                                const [dx, dy] = dir(screenDeg(b));
                                return <line key={b} x1={cx} y1={cy} x2={cx + dx * L} y2={cy + dy * L}
                                    stroke="rgba(191,149,63,0.55)" strokeWidth={natW / 700} strokeDasharray={`${natW / 250},${natW / 250}`} />;
                            })}
                            {/* 정사방(자오묘유) 굵은 선 */}
                            {[0, 90, 180, 270].map((d) => {
                                const [dx, dy] = dir(screenDeg(d));
                                return <line key={d} x1={cx} y1={cy} x2={cx + dx * L} y2={cy + dy * L}
                                    stroke={d === 0 ? "rgba(192,57,43,0.8)" : "rgba(191,149,63,0.8)"} strokeWidth={natW / 450} />;
                            })}
                            {/* 24산 라벨 */}
                            {Object.entries(MOUNTAIN_INFO).map(([m, info]) => {
                                const [dx, dy] = dir(screenDeg(info.deg));
                                const x = cx + dx * rLabel, y = cy + dy * rLabel;
                                const fs = Math.min(natW, natH) / 24;
                                return (
                                    <text key={m} x={x} y={y + fs / 3} fontSize={fs} fontWeight={700} textAnchor="middle"
                                        fontFamily="'Noto Serif KR',serif" fill="#7a5c14" stroke="#fff" strokeWidth={fs / 8} paintOrder="stroke">
                                        {m}
                                    </text>
                                );
                            })}
                            {/* 현공: 8방위 산성·향성·연자백 표기 */}
                            {mode === "현공" && chart && GUA8.map((g, i) => {
                                const mid = i * 45;
                                const [dx, dy] = dir(screenDeg(mid));
                                const r = rLabel * 0.55;
                                const fs = Math.min(natW, natH) / 30;
                                const an = annual[g as Palace];
                                return (
                                    <text key={g} x={cx + dx * r} y={cy + dy * r} fontSize={fs} fontWeight={700} textAnchor="middle"
                                        fill="#1c2f52" stroke="#fff" strokeWidth={fs / 7} paintOrder="stroke">
                                        {chart.mountain[g as Palace]}·{chart.water[g as Palace]}
                                        <tspan fontSize={fs * 0.72} fill={an === 5 || an === 2 ? "#c0392b" : "#556"}> 年{an}</tspan>
                                    </text>
                                );
                            })}
                            {/* 팔택: 8방위 팔성 표기 */}
                            {mode === "팔택" && ming && GUA8.map((g, i) => {
                                const mid = i * 45;
                                const [dx, dy] = dir(screenDeg(mid));
                                const r = rLabel * 0.55;
                                const fs = Math.min(natW, natH) / 30;
                                const st = starFor(ming, g);
                                return (
                                    <text key={g} x={cx + dx * r} y={cy + dy * r} fontSize={fs} fontWeight={700} textAnchor="middle"
                                        fill={GOOD_STARS.includes(st) ? "#1f7a57" : "#a5303c"} stroke="#fff" strokeWidth={fs / 7} paintOrder="stroke">
                                        {st}
                                    </text>
                                );
                            })}
                            {/* 중심점 */}
                            <circle cx={cx} cy={cy} r={Math.min(natW, natH) / 90} fill="#c0392b" stroke="#fff" strokeWidth={natW / 500} />
                        </svg>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] text-slate-400">
                            {mode === "팔택" && ming && <>본명괘 <b className="font-noto-serif">{ming}</b> 기준 — 초록=길방, 붉음=흉방. </>}
                            {mode === "현공" && <>부채꼴: 향성 기준 <span className="text-[#bf953f]">금색=왕기</span>·초록=생기·붉음=쇠살. 숫자는 산성·향성, 年=연자백({annualYear}). </>}
                            북쪽 붉은 선 기준으로 방위를 확인하세요.
                        </p>
                        <Button onClick={handleSave} disabled={saving} variant="outline" size="sm" className="rounded-full">
                            {saving ? "저장 중..." : "📷 이미지로 저장"}
                        </Button>
                    </div>
                </>
            ) : (
                <div className="glass-card p-10 text-center text-slate-400 text-sm">
                    도면·위성사진 이미지를 불러오면 방위 오버레이가 시작됩니다.<br />
                    <span className="text-[11px]">향후 주소 검색으로 아파트 도면을 자동으로 불러오는 기능을 계획 중입니다.</span>
                </div>
            )}
        </div>
    );
}
