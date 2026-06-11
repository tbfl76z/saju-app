"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, FolderOpen, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listProfiles, deleteProfile, LOAD_PROFILE_KEY, type SavedProfile } from "@/lib/storage";
import { notify } from "@/lib/useToast";

// 저장된 명식 목록 관리 라우트
export default function SavedPage() {
    const router = useRouter();
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [mounted, setMounted] = useState(false);

    const refresh = () => setProfiles(listProfiles());

    useEffect(() => {
        setMounted(true);
        refresh();
    }, []);

    if (!mounted) return null;

    const handleLoad = (id: string) => {
        // 선택 id를 sessionStorage에 두고 홈으로 이동하면 홈이 읽어 복원한다
        try {
            window.sessionStorage.setItem(LOAD_PROFILE_KEY, id);
        } catch {
            /* noop */
        }
        router.push("/");
    };

    const handleDelete = (id: string) => {
        deleteProfile(id);
        refresh();
        notify.info("명식을 삭제했습니다");
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="text-center space-y-3 py-5 md:py-10">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif flex items-center justify-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-pouch.svg" alt="" className="w-9 h-9 md:w-10 md:h-10" /> 저장된 명식
                </h2>
                <p className="text-slate-600 dark:text-slate-400">저장해 둔 명식을 불러오거나 정리할 수 있습니다.</p>
            </div>

            {profiles.length === 0 ? (
                <div className="glass-card p-10 text-center space-y-4">
                    <Bookmark className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="text-slate-600 dark:text-slate-300">저장된 명식이 없습니다.</p>
                    <Link href="/">
                        <Button className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white">명식 계산하러 가기 →</Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {profiles.map((p) => (
                        <div key={p.id} className="glass-card flex items-center justify-between gap-4 p-4">
                            <div className="min-w-0">
                                <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{p.label}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">
                                    {new Date(p.savedAt).toLocaleString("ko-KR")}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Button variant="outline" size="sm" onClick={() => handleLoad(p.id)} className="rounded-full">
                                    <FolderOpen className="h-4 w-4 mr-1" /> 불러오기
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} aria-label="삭제" className="rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
