"use client";

// 학습 모드 공용 유틸 — API 타입/호출 + 진도·XP·스트릭 + SM-2 복습(SRS) 저장소.
// 기존 앱 관례(storage.ts)에 맞춰 localStorage 기반으로 관리한다.

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// ---------- API 타입 ----------
export interface ChapterSummary {
    id: string;
    title: string;
    emoji: string;
    subtitle: string;
    card_count: number;
    order: number;
}

export interface ConceptCard {
    title: string;
    body: string;
}

export interface ChapterDetail extends ChapterSummary {
    cards: ConceptCard[];
    total: number;
}

export interface QuizItem {
    key: string;
    question: string;
    choices: string[];
    answer: number;
    explanation: string;
}

// ---------- API 호출 ----------
export async function fetchCurriculum(): Promise<ChapterSummary[]> {
    const res = await fetch(`${API_BASE}/learn/curriculum`);
    if (!res.ok) throw new Error(`curriculum ${res.status}`);
    return res.json();
}

export async function fetchChapter(chapterId: string): Promise<ChapterDetail> {
    const res = await fetch(`${API_BASE}/learn/chapter/${chapterId}`);
    if (!res.ok) throw new Error(`chapter ${res.status}`);
    return res.json();
}

export async function fetchQuiz(chapterId: string, count = 10): Promise<QuizItem[]> {
    const res = await fetch(`${API_BASE}/learn/quiz/${chapterId}?count=${count}`);
    if (!res.ok) throw new Error(`quiz ${res.status}`);
    return res.json();
}

// AI 튜터 스트리밍 (analyzeStream.ts와 동일한 SSE 파싱 패턴)
export async function streamTutor(
    question: string,
    chapterId: string | undefined,
    contextHint: string | undefined,
    onDelta: (accumulated: string) => void
): Promise<string> {
    const res = await fetch(`${API_BASE}/learn/tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chapter_id: chapterId, context_hint: contextHint }),
    });
    if (!res.ok || !res.body) throw new Error(`tutor ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (!json) continue;
            try {
                const evt = JSON.parse(json);
                if (evt.delta) {
                    acc += evt.delta;
                    onDelta(acc);
                }
            } catch {
                // 부분 JSON 무시
            }
        }
    }
    return acc;
}

// ---------- 진도 저장소 ----------
export interface ChapterProgress {
    bestScore: number; // 0~100
    passed: boolean; // 80점 이상 통과
    attempts: number;
    completedAt?: number;
}

export interface LearnProgress {
    chapters: Record<string, ChapterProgress>;
    xp: number;
    streak: number; // 연속 학습일
    lastStudyDay: string; // YYYY-MM-DD
}

const PROGRESS_KEY = "saju-learn-progress";
export const PASS_SCORE = 80;

function emptyProgress(): LearnProgress {
    return { chapters: {}, xp: 0, streak: 0, lastStudyDay: "" };
}

export function getProgress(): LearnProgress {
    if (typeof window === "undefined") return emptyProgress();
    try {
        const raw = window.localStorage.getItem(PROGRESS_KEY);
        if (!raw) return emptyProgress();
        return { ...emptyProgress(), ...JSON.parse(raw) };
    } catch {
        return emptyProgress();
    }
}

function saveProgress(p: LearnProgress): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {
        // 용량 초과 등 무시
    }
}

function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 오늘 학습 발생 → 스트릭 갱신 (어제에 이어서면 +1, 끊겼으면 1로 리셋)
function touchStreak(p: LearnProgress): void {
    const today = todayStr();
    if (p.lastStudyDay === today) return;
    const yesterday = new Date(Date.now() - 86400000);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    p.streak = p.lastStudyDay === yStr ? p.streak + 1 : 1;
    p.lastStudyDay = today;
}

// 퀴즈 완료 기록: 점수 갱신 + XP 적립 + 스트릭 + 오답 SRS 등록. 갱신된 진도를 반환.
export function recordQuizResult(
    chapterId: string,
    scorePct: number,
    wrongItems: QuizItem[]
): LearnProgress {
    const p = getProgress();
    const prev = p.chapters[chapterId] || { bestScore: 0, passed: false, attempts: 0 };
    const passed = prev.passed || scorePct >= PASS_SCORE;
    p.chapters[chapterId] = {
        bestScore: Math.max(prev.bestScore, scorePct),
        passed,
        attempts: prev.attempts + 1,
        completedAt: passed ? prev.completedAt ?? Date.now() : prev.completedAt,
    };
    // XP: 정답당 10, 통과 보너스 50
    p.xp += Math.round(scorePct / 10) * 10 + (scorePct >= PASS_SCORE ? 50 : 0);
    touchStreak(p);
    saveProgress(p);
    addWrongToSrs(chapterId, wrongItems);
    return p;
}

// 챕터 잠금 해제 여부: 첫 챕터이거나 직전 챕터를 통과했으면 열림
export function isUnlocked(order: number, chapters: ChapterSummary[], progress: LearnProgress): boolean {
    if (order === 0) return true;
    const prevChapter = chapters.find((c) => c.order === order - 1);
    return !!(prevChapter && progress.chapters[prevChapter.id]?.passed);
}

// ---------- SM-2 간격 반복 (복습 덱) ----------
export interface SrsCard {
    key: string; // 지식 포인트 식별자 (퀴즈 key)
    chapterId: string;
    question: string;
    choices: string[];
    answer: number;
    explanation: string;
    ef: number; // ease factor (최소 1.3)
    interval: number; // 일 단위
    reps: number; // 연속 정답 횟수
    due: number; // epoch ms
}

const SRS_KEY = "saju-learn-srs";
const MAX_CARDS = 300; // localStorage 보호 상한

function readSrs(): SrsCard[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(SRS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeSrs(cards: SrsCard[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(SRS_KEY, JSON.stringify(cards.slice(0, MAX_CARDS)));
    } catch {
        // 무시
    }
}

// 퀴즈에서 틀린 문제를 복습 덱에 추가 (이미 있으면 다시 처음부터)
export function addWrongToSrs(chapterId: string, wrongItems: QuizItem[]): void {
    if (wrongItems.length === 0) return;
    const cards = readSrs();
    const byKey = new Map(cards.map((c) => [c.key, c]));
    for (const item of wrongItems) {
        byKey.set(item.key, {
            key: item.key,
            chapterId,
            question: item.question,
            choices: item.choices,
            answer: item.answer,
            explanation: item.explanation,
            ef: byKey.get(item.key)?.ef ?? 2.5,
            interval: 0,
            reps: 0,
            due: Date.now(), // 즉시 복습 대상
        });
    }
    writeSrs([...byKey.values()]);
}

export function listDueCards(): SrsCard[] {
    const now = Date.now();
    return readSrs().filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}

export function countSrs(): { total: number; due: number } {
    const cards = readSrs();
    const now = Date.now();
    return { total: cards.length, due: cards.filter((c) => c.due <= now).length };
}

// SM-2 갱신. quality: 0~5 (몰랐다=1, 헷갈렸다=3, 알았다=5)
// 정답(q>=3): 1회차 1일 → 2회차 6일 → 이후 interval×EF. 오답: 처음부터.
export function reviewCard(key: string, quality: 0 | 1 | 2 | 3 | 4 | 5): void {
    const cards = readSrs();
    const card = cards.find((c) => c.key === key);
    if (!card) return;
    if (quality >= 3) {
        card.interval = card.reps === 0 ? 1 : card.reps === 1 ? 6 : Math.round(card.interval * card.ef);
        card.reps += 1;
    } else {
        card.reps = 0;
        card.interval = 1;
    }
    card.ef = Math.max(1.3, card.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    card.due = Date.now() + card.interval * 86400000;
    // 5회 이상 연속 정답이면 졸업(덱에서 제거) — 덱 비대화 방지
    const next = card.reps >= 5 ? cards.filter((c) => c.key !== key) : cards;
    writeSrs(next);
    // 복습도 학습이므로 스트릭 갱신 + XP 소량 적립
    const p = getProgress();
    touchStreak(p);
    p.xp += quality >= 3 ? 5 : 2;
    saveProgress(p);
}
