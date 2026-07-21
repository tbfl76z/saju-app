"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, FolderOpen, Bookmark, Star, ScrollText, Search, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/ReportRenderer";
import {
    listProfiles, deleteProfile, LOAD_PROFILE_KEY, type SavedProfile,
    getPrimaryId, setPrimaryId,
    listReports, deleteReport, toggleReportPin, type SavedReport,
} from "@/lib/storage";
import { notify } from "@/lib/useToast";

// 저장된 명식 + AI 풀이 보관함 관리 라우트
export default function SavedPage() {
    const router = useRouter();
    const [profiles, setProfiles] = useState<SavedProfile[]>([]);
    const [primaryId, setPrimary] = useState<string | null>(null);
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [openReportId, setOpenReportId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [mounted, setMounted] = useState(false);

    const refresh = () => {
        setProfiles(listProfiles());
        setPrimary(getPrimaryId());
        setReports(listReports());
    };

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

    // '내 명식' 지정/해제 — 오늘의 운세·통변·내 명식 퀴즈가 이 명식을 기본으로 쓴다
    const handlePrimary = (id: string) => {
        const next = primaryId === id ? null : id;
        setPrimaryId(next);
        setPrimary(next);
        notify.success(next ? "내 명식으로 지정했습니다" : "내 명식 지정을 해제했습니다",
            next ? "오늘의 운세·학습 메뉴가 이 명식을 기본으로 사용해요." : undefined);
    };

    // 리포트 즐겨찾기(핀) 토글 — 핀 항목은 보관함 맨 위에 고정된다
    const handlePin = (id: string) => {
        toggleReportPin(id);
        refresh();
    };

    // 검색 필터 — 명식은 이름/생일 라벨, 리포트는 제목+명식 라벨 기준
    const q = query.trim().toLowerCase();
    const filteredProfiles = q ? profiles.filter((p) => p.label.toLowerCase().includes(q)) : profiles;
    const filteredReports = q ? reports.filter((r) => `${r.title} ${r.profileLabel}`.toLowerCase().includes(q)) : reports;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-3 py-5 md:py-10">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif flex items-center justify-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-pouch.svg" alt="" className="w-9 h-9 md:w-10 md:h-10" /> 저장된 명식
                </h2>
                <p className="text-slate-600 dark:text-slate-400">★을 누르면 「내 명식」으로 지정되어 모든 메뉴가 자동으로 사용합니다.</p>
            </div>

            {/* 검색 — 저장된 명식·풀이가 하나라도 있을 때만 노출 */}
            {(profiles.length > 0 || reports.length > 0) && (
                <div className="relative mb-5">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="이름·생년월일·풀이 제목으로 검색"
                        className="w-full pl-11 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 text-sm focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                    {query && (
                        <button onClick={() => setQuery("")} aria-label="검색어 지우기" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg">×</button>
                    )}
                </div>
            )}

            {profiles.length === 0 ? (
                <div className="glass-card p-10 text-center space-y-4">
                    <Bookmark className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="text-slate-600 dark:text-slate-300">저장된 명식이 없습니다.</p>
                    <Link href="/">
                        <Button className="rounded-full bg-gradient-to-r from-[#d4af37] to-[#bf953f] text-white">명식 계산하러 가기 →</Button>
                    </Link>
                </div>
            ) : filteredProfiles.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">검색 결과가 없습니다.</p>
            ) : (
                <div className="space-y-3">
                    {filteredProfiles.map((p) => (
                        <div key={p.id} className={`glass-card flex items-center justify-between gap-3 p-4 ${primaryId === p.id ? "!border-[#d4af37]" : ""}`}>
                            <button
                                onClick={() => handlePrimary(p.id)}
                                aria-label="내 명식으로 지정"
                                title="내 명식으로 지정"
                                className="shrink-0"
                            >
                                <Star className={`h-5 w-5 transition-colors ${primaryId === p.id ? "fill-[#d4af37] text-[#d4af37]" : "text-slate-300 dark:text-slate-600 hover:text-[#d4af37]"}`} />
                            </button>
                            <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {p.label}
                                    {primaryId === p.id && <span className="ml-2 text-[10px] font-bold text-[#bf953f] bg-[#d4af37]/15 px-2 py-0.5 rounded-full align-middle">내 명식</span>}
                                </div>
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

            {/* AI 풀이 보관함 — 생성된 리포트는 자동 보관되어 토큰 재사용 없이 다시 본다 */}
            <div className="mt-10">
                <h3 className="section-title text-lg md:text-xl mb-4"><span className="flex items-center gap-2"><ScrollText className="h-5 w-5 text-[#bf953f]" /> AI 풀이 보관함</span></h3>
                {reports.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
                        아직 보관된 풀이가 없습니다. AI 풀이를 받으면 자동으로 여기에 보관돼요.
                    </p>
                ) : filteredReports.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">검색 결과가 없습니다.</p>
                ) : (
                    <div className="space-y-3">
                        {filteredReports.map((r) => (
                            <div key={r.id} className={`glass-card p-4 ${r.pinned ? "!border-[#d4af37]" : ""}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <button onClick={() => handlePin(r.id)} aria-label="즐겨찾기 고정" title="즐겨찾기 고정" className="shrink-0">
                                        <Pin className={`h-4 w-4 transition-colors ${r.pinned ? "fill-[#d4af37] text-[#d4af37]" : "text-slate-300 dark:text-slate-600 hover:text-[#d4af37]"}`} />
                                    </button>
                                    <button onClick={() => setOpenReportId(openReportId === r.id ? null : r.id)} className="min-w-0 flex-1 text-left">
                                        <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                            {r.title} <span className="font-normal text-slate-400">— {r.profileLabel}</span>
                                        </div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500">
                                            {new Date(r.savedAt).toLocaleString("ko-KR")} · {openReportId === r.id ? "접기 ▲" : "다시 보기 ▼"}
                                        </div>
                                    </button>
                                    <Button
                                        variant="ghost" size="icon" aria-label="풀이 삭제"
                                        onClick={() => { deleteReport(r.id); refresh(); }}
                                        className="rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                {openReportId === r.id && (
                                    <div className="mt-4 border-t border-[#d4af37]/20 pt-4">
                                        <ReportRenderer text={r.text} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
