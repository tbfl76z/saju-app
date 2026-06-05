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
}
