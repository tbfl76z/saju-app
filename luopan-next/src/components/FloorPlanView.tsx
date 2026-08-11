"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { exportAsImage } from "@/lib/exportImage";
import { notify } from "@/lib/useToast";
import { MOUNTAIN_INFO, starChart, periodOf, annualChart, starMood, type Palace } from "@/lib/flyingStars";
import { mingGua, starFor, type Trigram, type Star } from "@/lib/eightMansions";
import { detectOutline } from "@/lib/floorPlanDetect";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:8001" : "https://saju-app-11.onrender.com")).replace(/\/$/, "");

/** AI 도면 판독 결과 — 좌표가 아니라 '산입 범위 판단'만 받는다 */
interface PlanRead {
    spaces?: { name: string; decision: "include" | "exclude" | "uncertain"; reason: string }[];
    living_window_side?: string;
    entrance_side?: string;
    shape?: string;
    caution?: string;
}

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

/* ── 입극점(立極點) 자동 산출 — 다각형 평면의 면적 가중 중심 ──
   현공 감정 절차 5단계 "평면도상 기하학적 방법으로 중심점 산출"에 해당.
   ㄷ자(U형)처럼 중심이 집 밖으로 나가면 "가장 가까운 꺾임부"를 취하는 특칙까지 반영. */
type Pt = [number, number];

/** 신발끈 공식 — 다각형 면적(부호 없음) */
function polygonArea(p: Pt[]): number {
    let s = 0;
    for (let i = 0, n = p.length; i < n; i++) {
        const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
        s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
}

/** 다각형 도심(centroid) — 면적 가중. 면적이 0에 가까우면 산술평균으로 대체 */
function polygonCentroid(p: Pt[]): Pt {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = p.length; i < n; i++) {
        const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
        const f = x1 * y2 - x2 * y1;
        a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
    }
    if (Math.abs(a) < 1e-9) {
        const n = p.length;
        return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n];
    }
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a)];
}

/** 점이 다각형 안에 있는가 — ray casting */
function pointInPolygon([x, y]: Pt, p: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i], [xj, yj] = p[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** 다각형 변 위에서 주어진 점에 가장 가까운 지점 — U형 중심이 집 밖으로 나갈 때 사용 */
function nearestOnPolygon([x, y]: Pt, p: Pt[]): Pt {
    let best: Pt = p[0], bd = Infinity;
    for (let i = 0, n = p.length; i < n; i++) {
        const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        const qx = x1 + t * dx, qy = y1 + t * dy;
        const d = (x - qx) ** 2 + (y - qy) ** 2;
        if (d < bd) { bd = d; best = [qx, qy]; }
    }
    return best;
}

interface Props {
    birthYear?: number;
    gender?: "male" | "female";
    /** 현공 탭 내장용 — 좌산·준공년을 현공 상태와 동기하고 입력 UI를 숨긴다 */
    sitting?: string;
    year?: number;
    embedded?: boolean;
    /** 실측 좌향 각도(도) — 있으면 도면 자동 정렬에 사용 */
    measuredDeg?: number | null;
}

export default function FloorPlanView({ birthYear, gender, sitting: extSitting, year: extYear, embedded = false, measuredDeg = null }: Props) {
    const [img, setImg] = useState<string | null>(null);
    const [natural, setNatural] = useState<[number, number]>([1000, 750]);
    const [center, setCenter] = useState<[number, number] | null>(null);
    const [northDeg, setNorthDeg] = useState(0);      // 도면 상단이 가리키는 실제 방위각
    const [mode, setMode] = useState<OverlayMode>(embedded ? "현공" : "24산");
    // 현공 모드용 좌산 — 현공비성 탭에서 실측한 값이 있으면 이어받는다(실측 우선 플로우)
    const [sittingIn, setSitting] = useState(() => {
        try {
            const saved = typeof window !== "undefined" ? window.localStorage.getItem("destiny-luopan-sitting") : null;
            return saved && MOUNTAIN_INFO[saved] ? saved : "子";
        } catch { return "子"; }
    });
    const [yearIn, setYear] = useState(() => {
        // 현공비성 탭에서 쓰던 준공년을 이어받는다(운이 어긋나지 않게)
        try { const v = parseInt(window.localStorage.getItem("destiny-luopan-year") || "", 10); return v >= 1864 && v <= 2100 ? v : new Date().getFullYear(); } catch { return new Date().getFullYear(); }
    });
    const [saving, setSaving] = useState(false);
    // 탭 단계: ⓪ 외곽선(선택) → ① 집 중심 → ② 집 정면(베란다) 방향
    const [pickMode, setPickMode] = useState<"outline" | "center" | "facing">("center");
    const [aligned, setAligned] = useState(false);   // ②까지 완료(자동 정렬 적용) 여부
    const [outline, setOutline] = useState<Pt[]>([]); // 평면 외곽선 — 입극점 자동 산출용
    const [centerNote, setCenterNote] = useState(""); // 중심 산출 결과 안내
    const [detecting, setDetecting] = useState(false); // 외곽 자동 검출 중
    const [aiBusy, setAiBusy] = useState(false);       // AI 도면 판독 중
    const [aiRead, setAiRead] = useState<PlanRead | null>(null);
    const [fitView, setFitView] = useState(true);      // 긴 도면을 화면 높이에 맞춰 축소
    const imgElRef = useRef<HTMLImageElement>(null);
    // 내장 모드: 현공 탭의 좌향·준공년을 그대로 사용(실측 → 도면 즉시 적용)
    const sitting = extSitting ?? sittingIn;
    const year = extYear ?? yearIn;
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
    const curPeriod = periodOf(now.getFullYear());   // 당운 — 왕쇠 색칠 기준(반은 준공년 원운으로 세움)

    // 파일 업로드 → dataURL (서버 전송 없음)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
            const url = String(rd.result);
            const im = new Image();
            im.onload = () => {
                setNatural([im.naturalWidth, im.naturalHeight]);
                setCenter(null); setAligned(false); setPickMode("center");
                setImg(url);
                notify.success("도면을 불러왔습니다", "① 사진 속 집(터)의 한가운데를 탭하세요.");
            };
            im.src = url;
        };
        rd.readAsDataURL(f);
    };

    // 탭 2단계: ① 집 중심 → ② 집 정면(베란다) 방향 — 실측 향각과 매칭해 도면 회전 자동 계산
    // 실측 향각: 실측 좌향각 있으면 +180, 없으면 좌산 중심각 +180
    const facingDeg = measuredDeg != null
        ? ((measuredDeg + 180) % 360 + 360) % 360
        : ((MOUNTAIN_INFO[sitting]?.deg ?? 0) + 180) % 360;
    // 탭·드래그는 전부 포인터 이벤트로 처리한다.
    // (터치에서 합성되는 click은 clientX/Y가 0으로 오는 경우가 있어, 첫 점이
    //  손가락 위치가 아니라 좌상단 구석에 찍히는 일이 생긴다)
    const dragIdx = useRef<number | null>(null);
    const dragged = useRef(false);
    const tapStart = useRef<{ x: number; y: number } | null>(null);
    const TAP_SLOP = 12;  // 이보다 많이 움직이면 탭이 아니라 스크롤/드래그로 본다
    const toImgXY = (e: { clientX: number; clientY: number }): Pt | null => {
        const el = boxRef.current;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * natW, ((e.clientY - r.top) / r.height) * natH];
    };
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!img) return;
        dragged.current = false;
        dragIdx.current = null;
        tapStart.current = { x: e.clientX, y: e.clientY };
        if (pickMode !== "outline" || !outline.length) return;
        const p = toImgXY(e);
        if (!p) return;
        const thr = Math.min(natW, natH) * 0.05;   // 손가락으로도 잡히는 반경
        let best = -1, bd = thr;
        outline.forEach((q, i) => {
            const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if (d < bd) { bd = d; best = i; }
        });
        if (best >= 0) {
            dragIdx.current = best;
            e.currentTarget.setPointerCapture?.(e.pointerId);
        }
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragIdx.current == null) return;
        const p = toImgXY(e);
        if (!p) return;
        dragged.current = true;
        const i = dragIdx.current;
        setOutline((prev) => prev.map((q, k) => (k === i ? p : q)));
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const wasDrag = dragIdx.current != null && dragged.current;
        dragIdx.current = null;
        dragged.current = false;
        const st = tapStart.current;
        tapStart.current = null;
        if (wasDrag || !st) return;                                        // 꼭짓점 이동이었으면 점 추가 안 함
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > TAP_SLOP) return;  // 스크롤 제스처
        const p = toImgXY(e);
        if (p) onPick(p[0], p[1]);
    };
    const onPointerCancel = () => { dragIdx.current = null; dragged.current = false; tapStart.current = null; };

    const onPick = (x: number, y: number) => {
        if (!img) return;
        if (pickMode === "outline") {
            setOutline((prev) => [...prev, [x, y] as Pt]);
            return;
        }
        if (pickMode === "center") {
            setCenter([x, y]);
            setCenterNote("");
            setAligned(false);
            setPickMode("facing");
            notify.success("① 중심 설정 완료", "이제 창(베란다)·정면 방향을 한 번 더 탭하세요.");
        } else {
            // 중심과 너무 가까우면 각도가 불안정 — 다시 탭 유도
            if (Math.hypot(x - cx, y - cy) < Math.min(natW, natH) * 0.04) {
                notify.error("중심과 너무 가깝습니다", "중심에서 창(정면) 쪽으로 더 떨어진 지점을 탭해 주세요.");
                return;
            }
            // 화면상 정면 방향(0=위, 시계+) → 실측 향각과 매칭 → 도면 상단의 실제 방위 산출
            const phi = (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
            const nd = Math.round(((facingDeg - phi) % 360 + 360) % 360);
            setNorthDeg(nd);
            setAligned(true);
            setPickMode("center");
            notify.success("✅ 도면 정렬 완료", `실측 향 ${facingDeg.toFixed(0)}°에 맞춰 도면 상단 방위를 ${nd}°로 설정했습니다.`);
        }
    };
    const resetPick = () => {
        setCenter(null); setAligned(false); setPickMode("center");
        setOutline([]); setCenterNote("");
    };

    // 이미지 처리로 평면 외곽을 자동 추정 — 전부 기기 안에서 처리(업로드 없음)
    const autoDetect = () => {
        const el = imgElRef.current;
        if (!el || !el.complete) { notify.error("도면을 먼저 불러오세요"); return; }
        setDetecting(true);
        // 무거운 동기 연산이라 페인트 한 프레임 양보
        setTimeout(() => {
            try {
                const res = detectOutline(el, natW, natH);
                if (!res) {
                    notify.error("외곽을 찾지 못했습니다", "도면이 잘 보이게 잘라서 다시 올리거나, 외곽선을 직접 찍어 주세요.");
                    return;
                }
                setOutline(res.polygon);
                setPickMode("outline");
                setCenterNote(`자동 검출: 꼭짓점 ${res.points}개 · 사진의 ${(res.coverage * 100).toFixed(0)}% 영역. 어긋난 점은 직접 다시 찍고, 맞으면 '완료'를 누르세요.`);
                notify.success(`외곽 자동 검출 완료 — ${res.points}점`, "결과를 확인하고 '완료 → 중심 계산'을 누르세요.");
            } catch {
                notify.error("자동 검출에 실패했습니다", "외곽선을 직접 찍어 주세요.");
            } finally {
                setDetecting(false);
            }
        }, 30);
    };

    // 도면 자세 보정 — 거울상·회전된 사진을 바로잡는다.
    // 좌우 반전 도면을 그대로 쓰면 동서가 뒤바뀌어(震↔兌, 巽↔坤) 궁 판정이 통째로 틀어진다.
    // 좌표 변환을 따로 하지 않고 **이미지 자체를 고쳐** 이후 단계가 전부 그대로 동작하게 한다.
    const transformImage = (mode: "flipH" | "rot90") => {
        const el = imgElRef.current;
        if (!el || !el.complete || !img) { notify.error("도면을 먼저 불러오세요"); return; }
        const swap = mode === "rot90";
        const cv = document.createElement("canvas");
        cv.width = swap ? natH : natW;
        cv.height = swap ? natW : natH;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        if (mode === "flipH") { ctx.translate(natW, 0); ctx.scale(-1, 1); }
        else { ctx.translate(natH, 0); ctx.rotate(Math.PI / 2); }
        ctx.drawImage(el, 0, 0);
        setNatural([cv.width, cv.height]);
        setImg(cv.toDataURL("image/png"));
        setCenter(null); setOutline([]); setAligned(false); setPickMode("center");
        setCenterNote(""); setAiRead(null);
        notify.success(mode === "flipH" ? "좌우 반전 적용" : "90도 회전 적용", "찍은 점은 초기화됐습니다.");
    };

    // AI 도면 판독 — 좌표가 아니라 '어느 공간을 전유부로 볼 것인가'를 받는다.
    // 비전 모델은 픽셀 좌표를 정밀하게 못 찍으므로 외곽선은 위 자동 검출이 맡는다.
    const analyzeWithAI = async () => {
        const el = imgElRef.current;
        if (!el || !el.complete || !img) { notify.error("도면을 먼저 불러오세요"); return; }
        setAiBusy(true);
        try {
            // 전송 전 축소(장변 1024px, JPEG) — 트래픽·한도 절약
            const S = 1024;
            const sc = Math.min(1, S / Math.max(natW, natH));
            const cv = document.createElement("canvas");
            cv.width = Math.round(natW * sc); cv.height = Math.round(natH * sc);
            cv.getContext("2d")?.drawImage(el, 0, 0, cv.width, cv.height);
            const dataUrl = cv.toDataURL("image/jpeg", 0.85);
            const r = await fetch(`${API_BASE}/classic/floorplan/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: dataUrl, mime_type: "image/jpeg" }),
            });
            if (!r.ok) throw new Error(String(r.status));
            const j: PlanRead = await r.json();
            setAiRead(j);
            notify.success("도면 판독 완료", "산입 범위 권고를 확인하고 외곽선을 조정하세요.");
        } catch {
            notify.error("판독에 실패했습니다", "잠시 후 다시 시도하거나 직접 판단해 주세요.");
        } finally {
            setAiBusy(false);
        }
    };

    // 외곽선으로 입극점 자동 산출 — 면적 가중 중심(도심), U형 특칙 포함
    const applyOutline = () => {
        if (outline.length < 3) {
            notify.error("점이 부족합니다", "평면 외곽을 최소 3점 이상 찍어 주세요.");
            return;
        }
        const c = polygonCentroid(outline);
        const inside = pointInPolygon(c, outline);
        const final = inside ? c : nearestOnPolygon(c, outline);
        setCenter(final);
        setAligned(false);
        setPickMode("facing");
        const areaRatio = polygonArea(outline) / (natW * natH);
        setCenterNote(
            inside
                ? `외곽선 ${outline.length}점의 면적 가중 중심(도심)으로 입극점을 잡았습니다. (평면이 사진의 ${(areaRatio * 100).toFixed(0)}% 차지)`
                : `⚠ 도심이 집 밖(ㄷ자·요철 평면)에 떨어져, 현공 특칙에 따라 **가장 가까운 꺾임부**로 이동시켰습니다.`
        );
        notify.success(
            inside ? "입극점 자동 산출 완료" : "입극점 보정 완료(꺾임부)",
            "이제 창(정면) 방향을 탭하면 도면이 정렬됩니다."
        );
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
            {/* 내장 모드: STEP 1 연동 상태를 분명히 / 단독 모드: 실측 우선 경고 */}
            {embedded ? (
                <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-300">
                    🔗 <b>STEP 1 값이 연동되어 있습니다</b> — 坐 <b className="font-noto-serif">{sitting}</b>
                    {measuredDeg != null ? ` (실측 ${measuredDeg.toFixed(1)}°)` : " (직접 선택값)"} · 준공년 {year}.
                    도면에서 <b>① 중심 → ② 창(정면)</b>을 차례로 탭하면 이 각도에 맞춰 도면이 자동 정렬됩니다.
                </div>
            ) : (
                <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                    <b>도면 오버레이는 참고용입니다.</b> 아파트는 동마다 배치각이 달라 도면이 얼마나 틀어져 있는지 실측 없이는 알 수 없습니다.
                    먼저 <b>현공비성 탭에서 좌향을 실측</b>(또는 실물 패철로 측정)한 뒤, 그 값에 맞춰 아래 &lsquo;도면 상단의 실제 방위&rsquo;를 조정하세요.
                    위성지도 캡처는 대개 위=북(0°)이라 그대로 쓸 수 있습니다.
                </div>
            )}
            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                    <label className="inline-flex items-center px-3 py-1.5 rounded-full border border-[#d4af37]/40 text-[#bf953f] text-xs font-bold cursor-pointer hover:bg-[#d4af37]/10">
                        📐 도면/사진 불러오기
                        <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                    </label>
                    {img && (
                        <>
                            <Button onClick={() => transformImage("flipH")} variant="outline" className="h-7 rounded-full text-[11px]">↔ 좌우 반전</Button>
                            <Button onClick={() => transformImage("rot90")} variant="outline" className="h-7 rounded-full text-[11px]">↻ 90°</Button>
                            <Button onClick={() => setFitView((v) => !v)} variant="outline" className="h-7 rounded-full text-[11px]">
                                {fitView ? "🔍 크게 보기" : "🖥 화면에 맞추기"}
                            </Button>
                        </>
                    )}
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
                {mode === "현공" && embedded && chart && (
                    <p className="text-[11px] text-slate-400">위 현공 반의 <b className="text-[#bf953f] font-noto-serif">{chart.sitting}山{chart.facing}向 · {chart.period}운</b>이 그대로 적용됩니다.</p>
                )}
                {mode === "현공" && !embedded && (
                    <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                        <span>좌(坐)</span>
                        <select value={sitting} onChange={(e) => { setSitting(e.target.value); try { window.localStorage.setItem("destiny-luopan-sitting", e.target.value); } catch { /* 무시 */ } }}
                            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm font-noto-serif">
                            {Object.keys(MOUNTAIN_INFO).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <span>준공년</span>
                        <input type="number" value={year} min={1864} max={2100} onChange={(e) => setYear(Number(e.target.value))}
                            className="w-20 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-sm text-center" />
                        {chart && <span className="text-xs text-[#bf953f] font-semibold">{chart.period}운 {chart.sitting}山{chart.facing}向 · {chart.structure}</span>}
                    </div>
                )}
                {/* 거울상 경고 — 방위 판정을 통째로 뒤집는 함정이라 눈에 띄게 둔다 */}
                {img && (
                    <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200/60 dark:border-rose-800/40 px-3 py-2 text-[12px] text-rose-800 dark:text-rose-300">
                        🪞 <b>도면이 거울상은 아닌지 먼저 확인하세요.</b> 부동산 사이트 캡처 중에는 좌우가 뒤집힌 것이 있습니다 —
                        <b> 글자가 뒤집혀 보이면 반전된 도면</b>입니다. 그대로 쓰면 <b>동서가 통째로 바뀌어</b>(진궁↔태궁, 손궁↔곤궁)
                        산성·향성 판정이 정반대가 됩니다. 위의 <b>↔ 좌우 반전</b>으로 바로잡고 시작하세요.
                    </div>
                )}

                {/* ⓪ 외곽선으로 입극점 자동 산출 — 다각형 평면에서 눈대중 오차를 없앤다 */}
                <div className="rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/5 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="font-bold text-[#bf953f]">📐 입극점(立極點) 자동 산출</span>
                        <span className="text-slate-500 dark:text-slate-400">— ㄱ자·ㄷ자처럼 반듯하지 않은 평면에 권장</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Button onClick={autoDetect} disabled={!img || detecting}
                            className="h-7 rounded-full text-[11px] bg-slate-900 text-white dark:bg-[#d4af37] dark:text-slate-900">
                            {detecting ? "검출 중…" : "🤖 외곽 자동 검출"}
                        </Button>
                        {pickMode !== "outline" ? (
                            <Button onClick={() => { setOutline([]); setCenterNote(""); setPickMode("outline"); }}
                                disabled={!img} variant="outline" className="h-7 rounded-full text-[11px]">
                                직접 찍기
                            </Button>
                        ) : (
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                외곽 {outline.length}점 찍음 — 되돌리기·완료 버튼은 도면 아래에 있습니다
                            </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                            {pickMode === "outline"
                                ? "평면 바깥 모서리를 순서대로 탭하세요(발코니·피난테라스 포함 여부는 직접 선택)"
                                : "건너뛰고 중심을 직접 탭해도 됩니다"}
                        </span>
                    </div>
                    {centerNote && <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{centerNote}</p>}

                    {/* AI 도면 판독 — 산입 범위 판단(좌표 아님) */}
                    <div className="pt-1 border-t border-[#d4af37]/20 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Button onClick={analyzeWithAI} disabled={!img || aiBusy} variant="outline"
                                className="h-7 rounded-full text-[11px]">
                                {aiBusy ? "판독 중…" : "🧠 AI 도면 판독(산입 범위)"}
                            </Button>
                            <span className="text-[10px] text-slate-400">
                                어느 공간을 면적에 넣을지 판단해 줍니다 — 좌표는 위 자동 검출이 맡습니다
                            </span>
                        </div>
                        {aiRead && (
                            <div className="rounded-lg bg-white/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-2.5 space-y-1.5 text-[11px]">
                                {aiRead.shape && <p className="text-slate-600 dark:text-slate-300"><b>평면 형태</b> — {aiRead.shape}</p>}
                                {!!aiRead.spaces?.length && (
                                    <div className="space-y-0.5">
                                        {aiRead.spaces.map((s, i) => (
                                            <div key={i} className="flex gap-1.5">
                                                <span className={"shrink-0 w-11 font-bold " + (s.decision === "include" ? "text-emerald-600 dark:text-emerald-400" : s.decision === "exclude" ? "text-rose-500" : "text-amber-600 dark:text-amber-400")}>
                                                    {s.decision === "include" ? "포함" : s.decision === "exclude" ? "제외" : "판단필요"}
                                                </span>
                                                <span className="text-slate-600 dark:text-slate-300"><b>{s.name}</b> — {s.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="text-slate-500 dark:text-slate-400">
                                    거실 큰 창 <b>{aiRead.living_window_side || "불명"}</b> 쪽 · 현관 <b>{aiRead.entrance_side || "불명"}</b> 쪽
                                    <span className="text-slate-400"> — ② 창(정면) 방향을 탭할 때 참고하세요</span>
                                </p>
                                {aiRead.caution && <p className="text-amber-700 dark:text-amber-400">⚠ {aiRead.caution}</p>}
                                <p className="text-[10px] text-slate-400">
                                    ※ 발코니·확장부 산입 여부는 <b>문헌 근거가 확인되지 않은 판단 영역</b>입니다. 최종 결정은 직접 하시고,
                                    감정 기록에는 &lsquo;발코니 제외 / 전유부 기준&rsquo;처럼 산입 기준을 남겨 두세요.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 정렬 진행 표시 — 지금 어느 단계인지, 적용됐는지를 분명하게 */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold">
                    <span className={"px-2.5 py-1 rounded-full border " + (!img
                        ? "opacity-40 border-slate-200 dark:border-slate-700 text-slate-400"
                        : center ? "border-emerald-400/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                            : "border-[#d4af37] bg-[#d4af37]/15 text-[#bf953f] animate-pulse")}>
                        ① 집 중심 탭{center ? " ✓" : ""}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">→</span>
                    <span className={"px-2.5 py-1 rounded-full border " + (aligned
                        ? "border-emerald-400/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                        : center ? "border-[#d4af37] bg-[#d4af37]/15 text-[#bf953f] animate-pulse"
                            : "opacity-40 border-slate-200 dark:border-slate-700 text-slate-400")}>
                        ② 창(정면) 방향 탭{aligned ? " ✓" : ""}
                    </span>
                    {center && (
                        <button onClick={resetPick}
                            className="ml-1 px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-600 text-slate-500 hover:text-rose-500 hover:border-rose-300">
                            ↺ 다시 찍기
                        </button>
                    )}
                </div>
                <p className="text-[11px] text-slate-400">
                    {!img
                        ? <>도면을 불러오면 시작합니다. (이미지는 기기에서만 처리됩니다)</>
                        : pickMode === "outline"
                            ? <><b className="text-blue-600 dark:text-blue-400">파란 점 ①</b>부터 <b>바깥 모서리를 차례로 탭</b>하세요. 잘못 찍은 점은 <b>손가락(마우스)으로 끌어서 옮기면</b> 됩니다.
                                점선은 마지막 점과 ①이 이어질 선입니다. 다 되면 &lsquo;완료&rsquo; → <b>면적 가중 중심(도심)</b>으로 입극점이 잡힙니다.</>
                            : !center
                            ? <>① 사진 속 우리 집(터)의 <b>한가운데를 탭</b>하세요.</>
                            : !aligned
                                ? <>② 이제 <b>창(베란다)·정면 방향을 한 번 더 탭</b>하세요 — 실측 향({facingDeg.toFixed(0)}°)에 맞춰 도면이 자동 회전됩니다.</>
                                : <>✅ <b className="text-emerald-600 dark:text-emerald-400">정렬 완료</b> — 파란 선이 창(정면=向) 방향입니다. 어긋나 보이면 슬라이더로 미세 조정하거나 &lsquo;다시 찍기&rsquo;를 누르세요.</>}
                </p>
            </div>

            {img ? (
                <>
                    <div ref={boxRef}
                        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
                        style={{
                            touchAction: pickMode === "outline" ? "none" : undefined,
                            aspectRatio: `${natW} / ${natH}`,
                            // 세로로 긴 도면이 화면을 넘지 않게 — 높이 기준으로 폭을 제한한다
                            maxWidth: fitView ? `calc(72vh * ${natW / natH})` : undefined,
                        }}
                        className={"relative w-full mx-auto rounded-2xl overflow-hidden border bg-white "
                            + (pickMode === "outline" ? "border-blue-500 ring-2 ring-blue-400/40 cursor-crosshair" : "border-[#d4af37]/30 cursor-crosshair")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img ref={imgElRef} src={img} alt="도면" className="w-full h-full block" />
                        <svg viewBox={`0 0 ${natW} ${natH}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                            {/* 8괘 반투명 부채꼴 (팔택/현공) */}
                            {mode !== "24산" && GUA8.map((g, i) => {
                                const mid = i * 45;
                                let fill = "transparent";
                                if (mode === "팔택" && ming) {
                                    const st = starFor(ming, g);
                                    fill = GOOD_STARS.includes(st) ? "rgba(46,139,107,0.16)" : "rgba(165,48,60,0.14)";
                                } else if (mode === "현공" && chart) {
                                    const mood = starMood(chart.water[g as Palace], curPeriod);
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
                            {/* 정렬 완료 후: 창(정면=向) 방향 표시선 — 두 번째 탭이 어디에 적용됐는지 보여준다 */}
                            {aligned && center && (() => {
                                const [fdx, fdy] = dir(screenDeg(facingDeg));
                                const fs = Math.min(natW, natH) / 26;
                                return (
                                    <g>
                                        <line x1={cx} y1={cy} x2={cx + fdx * L} y2={cy + fdy * L}
                                            stroke="rgba(29,79,143,0.85)" strokeWidth={natW / 350} />
                                        <text x={cx + fdx * rLabel * 0.78} y={cy + fdy * rLabel * 0.78} fontSize={fs} fontWeight={700}
                                            textAnchor="middle" fill="#1d4f8f" stroke="#fff" strokeWidth={fs / 7} paintOrder="stroke">向 정면</text>
                                    </g>
                                );
                            })()}
                            {/* 외곽선 — 도면에 묻히지 않게 흰 테두리(halo) + 짙은 파랑 이중선 */}
                            {outline.length > 0 && (() => {
                                const pts = outline.map((p) => p.join(",")).join(" ");
                                const vr = Math.min(natW, natH) / 55;      // 꼭짓점 반경(손가락으로 잡히는 크기)
                                const fs = Math.min(natW, natH) / 62;
                                const closing = pickMode === "outline" && outline.length >= 3;
                                return (
                                    <g>
                                        {/* 채움 + 흰 halo */}
                                        <polygon points={pts} fill="rgba(29,78,216,0.16)" stroke="#fff"
                                            strokeWidth={natW / 90} strokeLinejoin="round" />
                                        <polygon points={pts} fill="none" stroke="#1d4ed8"
                                            strokeWidth={natW / 170} strokeLinejoin="round" />
                                        {/* 아직 찍는 중이면 '닫힐 선'을 점선으로 예고 */}
                                        {closing && (
                                            <line x1={outline[outline.length - 1][0]} y1={outline[outline.length - 1][1]}
                                                x2={outline[0][0]} y2={outline[0][1]}
                                                stroke="#1d4ed8" strokeWidth={natW / 220}
                                                strokeDasharray={`${natW / 90},${natW / 130}`} opacity={0.7} />
                                        )}
                                        {/* 꼭짓점 — 번호를 달아 순서를 보이게, 시작점은 붉게 */}
                                        {outline.map((p, i) => (
                                            <g key={i}>
                                                <circle cx={p[0]} cy={p[1]} r={vr} fill={i === 0 ? "#dc2626" : "#1d4ed8"}
                                                    stroke="#fff" strokeWidth={natW / 300} />
                                                <text x={p[0]} y={p[1] + fs * 0.36} fontSize={fs} fontWeight={700}
                                                    fill="#fff" textAnchor="middle">{i + 1}</text>
                                            </g>
                                        ))}
                                    </g>
                                );
                            })()}
                            {/* 중심점 */}
                            <circle cx={cx} cy={cy} r={Math.min(natW, natH) / 90} fill="#c0392b" stroke="#fff" strokeWidth={natW / 500} />
                        </svg>
                        {/* 다음 탭 안내 오버레이 — 정렬 전까지만 표시(저장 이미지 오염 방지) */}
                        {!aligned && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-slate-900/85 text-white text-[11px] font-bold pointer-events-none whitespace-nowrap">
                                {pickMode === "outline" ? `✏️ 모서리를 차례로 탭 · 점을 끌어 수정 (${outline.length}점)`
                                    : pickMode === "center" ? "👆 ① 집 중심을 탭하세요" : "👆 ② 창(정면) 방향을 탭하세요"}
                            </div>
                        )}
                    </div>
                    {/* 외곽선 편집 액션 바 — 도면 바로 아래에, 스크롤해도 따라오게 */}
                    {pickMode === "outline" && (
                        <div className="sticky bottom-2 z-20 flex items-center gap-1.5 flex-wrap rounded-2xl border border-blue-300 dark:border-blue-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-2.5 py-2 shadow-lg">
                            <span className="text-[12px] font-bold text-blue-700 dark:text-blue-300">
                                {outline.length}점
                            </span>
                            <Button onClick={() => setOutline((p) => p.slice(0, -1))} disabled={!outline.length}
                                variant="outline" className="h-8 rounded-full text-[12px] px-3">↶ 되돌리기</Button>
                            <Button onClick={() => setOutline([])} disabled={!outline.length}
                                variant="outline" className="h-8 rounded-full text-[12px] px-3">🗑 전부 지우기</Button>
                            <Button onClick={() => { setOutline([]); setPickMode("center"); }}
                                variant="outline" className="h-8 rounded-full text-[12px] px-3">그만두기</Button>
                            <Button onClick={applyOutline} disabled={outline.length < 3}
                                className={"h-8 rounded-full text-[12px] px-4 font-bold ml-auto "
                                    + (outline.length >= 3
                                        ? "bg-blue-600 hover:bg-blue-700 text-white animate-pulse"
                                        : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500")}>
                                {outline.length >= 3 ? "✓ 다 찍었어요 → 다음" : `점 ${3 - outline.length}개 더 필요`}
                            </Button>
                        </div>
                    )}
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
