/**
 * 도면 외곽 자동 검출 — 전부 브라우저 안에서 처리한다(서버 전송 없음).
 *
 * 현공 감정에서 입극점(立極點)은 8궁·24산 분할의 원점이라, 여기가 틀리면
 * 이후 계산이 통째로 어긋난다. 눈대중 탭의 오차를 줄이기 위한 보조 도구.
 *
 * 파이프라인
 *   ① 축소 → ② 붉은 손글씨 제거(감정 필기가 얹힌 도면 대응)
 *   → ③ Otsu 이진화 → ④ 모폴로지 닫힘(벽선 연결) → ⑤ 최대 연결성분
 *   → ⑥ 구멍 메우기 → ⑦ 외곽 경계 추적 → ⑧ Douglas-Peucker 단순화
 *
 * 한계: 사진의 기울기·조명·배경(종이 여백)에 따라 결과가 흔들린다.
 *       **최종 확정은 사용자가 꼭짓점을 보고 판단**하는 것을 전제로 한다.
 */

export type Pt = [number, number];

export interface DetectResult {
    polygon: Pt[];       // 원본 이미지 좌표계
    coverage: number;    // 검출 영역이 이미지에서 차지하는 면적 비율
    points: number;      // 단순화 후 꼭짓점 수
}

const MAX_W = 640; // 처리 해상도 상한(속도)

/** Otsu 임계값 — 히스토그램 기반 자동 이진화 */
function otsu(hist: number[], total: number): number {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) { best = between; thr = t; }
    }
    return thr;
}

/** 8방향 이웃 */
const N8: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Moore 이웃 경계 추적 — 마스크의 바깥 윤곽을 시계방향으로 따라간다 */
function traceBoundary(mask: Uint8Array, w: number, h: number, start: Pt): Pt[] {
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
    const out: Pt[] = [];
    let [cx, cy] = start;
    let dirIdx = 0;
    const first: Pt = [cx, cy];
    let guard = 0;
    do {
        out.push([cx, cy]);
        let found = false;
        // 직전 진행 방향의 반대쪽에서부터 시계방향 탐색
        for (let k = 0; k < 8; k++) {
            const d = (dirIdx + 6 + k) % 8;
            const nx = cx + N8[d][0], ny = cy + N8[d][1];
            if (at(nx, ny)) { cx = nx; cy = ny; dirIdx = d; found = true; break; }
        }
        if (!found) break;
        guard++;
    } while ((cx !== first[0] || cy !== first[1]) && guard < w * h * 4);
    return out;
}

/** 수직 거리 */
function perpDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Douglas-Peucker 단순화 */
function simplify(pts: Pt[], eps: number): Pt[] {
    if (pts.length < 3) return pts;
    let maxD = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
    const left = simplify(pts.slice(0, idx + 1), eps);
    const right = simplify(pts.slice(idx), eps);
    return [...left.slice(0, -1), ...right];
}

/**
 * 도면 이미지에서 평면 외곽 폴리곤을 추정한다.
 * @param src 이미지 요소(로드 완료 상태)
 * @param natW/natH 원본 크기
 */
export function detectOutline(src: CanvasImageSource, natW: number, natH: number): DetectResult | null {
    const scale = Math.min(1, MAX_W / natW);
    const w = Math.max(8, Math.round(natW * scale));
    const h = Math.max(8, Math.round(natH * scale));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h).data;

    // ② 붉은 손글씨 제거 + 명도 계산 (붉은 획은 배경(밝음)으로 간주)
    const lum = new Uint8Array(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
        const r = img[i], g = img[i + 1], b = img[i + 2];
        const isRed = r > 90 && r - Math.max(g, b) > 35;   // 감정 필기(붉은 펜)
        const v = isRed ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        lum[p] = v;
        hist[v]++;
    }

    // ③ Otsu 이진화 — 잉크(어두운 선) = 1
    const thr = otsu(hist, w * h);
    let ink = new Uint8Array(w * h);
    // Otsu의 t는 "0~t를 어두운 쪽 클래스로" 나누는 값이라 경계값을 포함해야 한다.
    // (< 로 두면 잉크가 단일 명도인 도면에서 마스크가 통째로 비어버린다)
    for (let p = 0; p < w * h; p++) ink[p] = lum[p] <= thr ? 1 : 0;

    // ④ 모폴로지 닫힘(팽창→침식) — 끊긴 벽선을 잇는다
    const R = Math.max(1, Math.round(Math.min(w, h) / 120));
    const morph = (m: Uint8Array, grow: boolean) => {
        const o = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let hit = grow ? 0 : 1;
            for (let dy = -R; dy <= R && (grow ? !hit : hit); dy++) {
                for (let dx = -R; dx <= R; dx++) {
                    const nx = x + dx, ny = y + dy;
                    const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : m[ny * w + nx];
                    if (grow && v) { hit = 1; break; }
                    if (!grow && !v) { hit = 0; break; }
                }
            }
            o[y * w + x] = hit;
        }
        return o;
    };
    ink = morph(morph(ink, true), false);

    // ⑤ 최대 연결성분(4방향 BFS)
    const label = new Int32Array(w * h).fill(-1);
    let bestId = -1, bestSize = 0, id = 0;
    const stack: number[] = [];
    for (let s = 0; s < w * h; s++) {
        if (!ink[s] || label[s] !== -1) continue;
        let size = 0;
        stack.length = 0; stack.push(s); label[s] = id;
        while (stack.length) {
            const p = stack.pop()!;
            size++;
            const x = p % w, y = (p / w) | 0;
            if (x > 0 && ink[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
            if (x < w - 1 && ink[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
            if (y > 0 && ink[p - w] && label[p - w] === -1) { label[p - w] = id; stack.push(p - w); }
            if (y < h - 1 && ink[p + w] && label[p + w] === -1) { label[p + w] = id; stack.push(p + w); }
        }
        if (size > bestSize) { bestSize = size; bestId = id; }
        id++;
    }
    if (bestId < 0 || bestSize < w * h * 0.005) return null;

    const comp = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) comp[p] = label[p] === bestId ? 1 : 0;

    // ⑥ 구멍 메우기 — 테두리에서 배경을 flood fill, 닿지 않은 곳은 내부
    const outside = new Uint8Array(w * h);
    stack.length = 0;
    for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
    while (stack.length) {
        const p = stack.pop()!;
        if (p < 0 || p >= w * h || outside[p] || comp[p]) continue;
        outside[p] = 1;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
    }
    const solid = new Uint8Array(w * h);
    let area = 0;
    for (let p = 0; p < w * h; p++) { solid[p] = outside[p] ? 0 : 1; area += solid[p]; }

    // ⑦ 외곽 경계 추적 — 첫 solid 픽셀부터
    let start: Pt | null = null;
    for (let p = 0; p < w * h && !start; p++) if (solid[p]) start = [p % w, (p / w) | 0];
    if (!start) return null;
    const boundary = traceBoundary(solid, w, h, start);
    if (boundary.length < 8) return null;

    // ⑧ 단순화 — 너무 잘게 쪼개지지 않도록 eps를 키워가며 30점 이하로
    let eps = Math.min(w, h) * 0.012;
    let poly = simplify(boundary, eps);
    for (let i = 0; i < 6 && poly.length > 30; i++) { eps *= 1.6; poly = simplify(boundary, eps); }
    if (poly.length >= 2 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1]) poly.pop();
    if (poly.length < 3) return null;

    // 원본 좌표로 환산
    const inv = 1 / scale;
    return {
        polygon: poly.map(([x, y]) => [x * inv, y * inv] as Pt),
        coverage: area / (w * h),
        points: poly.length,
    };
}
