"use client";

// 저장된 명식 1건의 구조
export interface SavedProfile {
    id: string;
    label: string; // 표시용 이름 (성함 + 생년월일)
    savedAt: number; // epoch ms
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sajuData: any; // /calculate 응답 전체
    aiAnalysis?: string; // 선택: AI 리포트 본문
}

const KEY = "destiny-saved-profiles";
const MAX_PROFILES = 30; // localStorage 용량 보호 상한

// /saved → 홈으로 선택 명식을 전달하는 sessionStorage 브리지 키
export const LOAD_PROFILE_KEY = "destiny-load-profile";

// SSR 가드: 서버 렌더링 시 window가 없으므로 빈 배열 반환
function readAll(): SavedProfile[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeAll(profiles: SavedProfile[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(profiles.slice(0, MAX_PROFILES)));
    } catch {
        // 용량 초과 등 무시
    }
}

// 최신순 목록
export function listProfiles(): SavedProfile[] {
    return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function getProfile(id: string): SavedProfile | undefined {
    return readAll().find((p) => p.id === id);
}

// 저장(동일 label이 있으면 갱신). 저장된 항목을 반환.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveProfile(sajuData: any, aiAnalysis?: string): SavedProfile {
    const all = readAll();
    const name = sajuData?.name || "이름 없음";
    const birth = sajuData?.birth_date || "";
    const label = birth ? `${name} · ${birth}` : name;
    const existing = all.find((p) => p.label === label);
    const id = existing?.id || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const profile: SavedProfile = {
        id,
        label,
        savedAt: Date.now(),
        sajuData,
        aiAnalysis: aiAnalysis ?? existing?.aiAnalysis,
    };
    const next = [profile, ...all.filter((p) => p.id !== id)];
    writeAll(next);
    return profile;
}

export function deleteProfile(id: string): void {
    writeAll(readAll().filter((p) => p.id !== id));
    // 기본 명식이 삭제되면 지정도 해제
    if (getPrimaryId() === id) setPrimaryId(null);
}

// ---------- '내 명식' 기본 지정 ----------
// 오늘의 운세·통변·내 명식 퀴즈 등에서 매번 고르지 않도록 기본 명식 1개를 기억한다
const PRIMARY_KEY = "destiny-primary-profile";

export function getPrimaryId(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(PRIMARY_KEY);
    } catch {
        return null;
    }
}

export function setPrimaryId(id: string | null): void {
    if (typeof window === "undefined") return;
    try {
        if (id) window.localStorage.setItem(PRIMARY_KEY, id);
        else window.localStorage.removeItem(PRIMARY_KEY);
    } catch {
        // 무시
    }
}

// 기본 명식 우선, 없으면 최신 저장 명식
export function getPrimaryProfile(): SavedProfile | undefined {
    const list = listProfiles();
    const id = getPrimaryId();
    return list.find((p) => p.id === id) ?? list[0];
}

// 기본 명식이 맨 앞에 오는 목록 (선택 드롭다운용)
export function listProfilesPrimaryFirst(): SavedProfile[] {
    const list = listProfiles();
    const id = getPrimaryId();
    const idx = list.findIndex((p) => p.id === id);
    if (idx <= 0) return list;
    return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
}

// ---------- 최근 입력값 기억 ----------
// 매번 생년월일을 다시 치지 않도록 마지막 계산 입력을 기억한다
const LAST_INPUT_KEY = "destiny-last-input";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLastInput(): Record<string, any> | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(LAST_INPUT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setLastInput(data: Record<string, any>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(LAST_INPUT_KEY, JSON.stringify(data));
    } catch {
        // 무시
    }
}

// ---------- AI 풀이 보관함 ----------
// 토큰을 들여 생성한 AI 리포트를 자동 보관해 재호출 없이 다시 본다
export interface SavedReport {
    id: string;
    title: string; // 예: "올해의 운세"
    profileLabel: string; // 예: "하늘 · 1990-01-01"
    type: string; // analysis_type
    text: string;
    savedAt: number;
    pinned?: boolean; // 즐겨찾기(핀) 고정 여부
}

const REPORTS_KEY = "destiny-saved-reports";
const MAX_REPORTS = 50;

function readReports(): SavedReport[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(REPORTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeReports(reports: SavedReport[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, MAX_REPORTS)));
    } catch {
        // 용량 초과 시 오래된 절반을 버리고 재시도
        try {
            window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, Math.floor(MAX_REPORTS / 2))));
        } catch {
            /* 무시 */
        }
    }
}

export function listReports(): SavedReport[] {
    // 핀 고정 항목을 맨 앞에, 그다음 최신순
    return readReports().sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return b.savedAt - a.savedAt;
    });
}

// 리포트 즐겨찾기(핀) 토글
export function toggleReportPin(id: string): void {
    const all = readReports();
    writeReports(all.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)));
}

export function saveReport(input: { title: string; profileLabel: string; type: string; text: string }): void {
    if (!input.text || input.text.length < 50) return; // 오류 메시지 등은 보관하지 않음
    const all = readReports();
    const report: SavedReport = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        savedAt: Date.now(),
        ...input,
    };
    // 같은 명식·같은 종류의 같은 날 리포트는 최신 것으로 교체 (중복 방지)
    const day = new Date().toDateString();
    const next = [
        report,
        ...all.filter((r) => !(r.profileLabel === input.profileLabel && r.type === input.type && new Date(r.savedAt).toDateString() === day)),
    ];
    writeReports(next);
}

export function deleteReport(id: string): void {
    writeReports(readReports().filter((r) => r.id !== id));
}
