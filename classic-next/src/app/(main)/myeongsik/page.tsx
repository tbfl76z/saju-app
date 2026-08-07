"use client";

import { useEffect, useState } from "react";
import { Trash2, Star, Bookmark } from "lucide-react";
import { SajuForm } from "@/components/SajuForm";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/useToast";
import {
    listProfiles, saveProfile, deleteProfile, getPrimaryId, setPrimaryId, type SavedProfile,
} from "@/lib/storage";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:8001" : "https://saju-app-11.onrender.com")).replace(/\/$/, "");

// 명식 관리 — 고전(자미·기문·택일·래정)이 사용할 명식을 입력·저장한다.
// ★로 '내 명식'을 지정하면 고전 화면이 기본으로 사용한다.
export default function MyeongsikPage() {
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [primaryId, setPrimary] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    const refresh = () => { setProfiles(listProfiles()); setPrimary(getPrimaryId()); };
    useEffect(() => { setMounted(true); refresh(); }, []);
    if (!mounted) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleCalculate = async (formData: any) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/calculate`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (!data?.pillars) throw new Error("invalid");
            const p = saveProfile(data);
            if (!getPrimaryId()) setPrimaryId(p.id); // 첫 명식은 자동으로 '내 명식'
            refresh();
            notify.success("명식을 저장했습니다", "고전 화면에서 바로 사용할 수 있어요.");
        } catch {
            notify.error("계산 중 오류가 발생했습니다", "잠시 후 다시 시도해 주세요.");
        } finally { setLoading(false); }
    };

    const handlePrimary = (id: string) => {
        const next = primaryId === id ? null : id;
        setPrimaryId(next); setPrimary(next);
        notify.success(next ? "내 명식으로 지정했습니다" : "내 명식 지정을 해제했습니다");
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-2 py-5 md:py-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">📜 명식 관리</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm">고전 풀이에 사용할 명식을 입력하고 ★로 기본 명식을 지정하세요.</p>
            </div>

            <SajuForm onCalculate={handleCalculate} isLoading={loading} />

            <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                    <Bookmark className="h-5 w-5 text-[#bf953f]" /> 저장된 명식
                </h3>
                {profiles.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">저장된 명식이 없습니다. 위에서 생년월일시를 입력해 주세요.</p>
                ) : (
                    <div className="space-y-3">
                        {profiles.map((p) => (
                            <div key={p.id} className={`glass-card flex items-center justify-between gap-3 p-4 ${primaryId === p.id ? "!border-[#d4af37]" : ""}`}>
                                <button onClick={() => handlePrimary(p.id)} aria-label="내 명식으로 지정" className="shrink-0">
                                    <Star className={`h-5 w-5 transition-colors ${primaryId === p.id ? "fill-[#d4af37] text-[#d4af37]" : "text-slate-300 dark:text-slate-600 hover:text-[#d4af37]"}`} />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                        {p.label}
                                        {primaryId === p.id && <span className="ml-2 text-[10px] font-bold text-[#bf953f] bg-[#d4af37]/15 px-2 py-0.5 rounded-full align-middle">내 명식</span>}
                                    </div>
                                    <div className="text-xs text-slate-400">{new Date(p.savedAt).toLocaleString("ko-KR")}</div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => { deleteProfile(p.id); refresh(); }} aria-label="삭제"
                                    className="rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
