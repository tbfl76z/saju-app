/**
 * 도면 작업 상태 보관 — IndexedDB.
 *
 * 도면 이미지(dataURL)는 위성지도 기준 300~400KB, 촬영 사진은 수 MB까지 간다.
 * localStorage는 5MB 남짓이고 문자열 하나가 커지면 다른 저장값까지 같이 위험해지므로
 * 이미지와 찍어둔 좌표는 IndexedDB에 따로 둔다.
 *
 * 보관 대상은 "다시 만들기 번거로운 것"만이다 —
 * 도면 이미지 / 외곽선 / 입극점 / 도면 상단 방위 / 방 핀.
 * 계산으로 즉시 복원되는 값(비성반 등)은 저장하지 않는다.
 */

const DB_NAME = "destiny-fengshui";
const STORE = "floorplan";
const KEY = "current";
const DB_VER = 1;

export interface PlanSnapshot {
    img: string;                       // dataURL
    natural: [number, number];
    center: [number, number] | null;
    northDeg: number;
    northLocked: boolean;              // 위성지도로 불러와 방위가 확정된 상태인지
    aligned: boolean;
    outline: [number, number][];
    rooms: { name: string; x: number; y: number }[];
    mapInfo: { address: string; mpp: number; provider: string } | null;
    savedAt: number;
}

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB 없음")); return; }
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** 저장 — 실패해도 앱 흐름을 막지 않는다(보조 기능이므로) */
export async function savePlan(snap: PlanSnapshot): Promise<void> {
    try {
        const db = await open();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(snap, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch { /* 저장 실패는 무시 — 작업 자체는 계속된다 */ }
}

export async function loadPlan(): Promise<PlanSnapshot | null> {
    try {
        const db = await open();
        const snap = await new Promise<PlanSnapshot | null>((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(KEY);
            req.onsuccess = () => resolve((req.result as PlanSnapshot) ?? null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return snap;
    } catch { return null; }
}

export async function clearPlan(): Promise<void> {
    try {
        const db = await open();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch { /* 무시 */ }
}
