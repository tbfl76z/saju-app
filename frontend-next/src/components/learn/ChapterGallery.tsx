"use client";

import { useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { API_BASE } from "@/lib/learn";

// 원전 자료 도표 갤러리 — PDF 교재에서 추출한 그림·표를 펼쳐 본다.
// 썸네일 그리드 + 탭하면 확대(라이트박스).
const _CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

export function ChapterGallery({ images, label = "원전 자료 도표", defaultOpen = false }: { images: string[]; label?: string; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const [zoom, setZoom] = useState<string | null>(null);

    if (!images || images.length === 0) return null;

    return (
        <div className="glass-card p-5 space-y-4">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
                <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                    <ImageIcon className="h-5 w-5 text-[#bf953f]" />
                    {label} ({images.length}장)
                </span>
                <span className="text-slate-400 text-sm">{open ? "접기 ▲" : "펼치기 ▼"}</span>
            </button>

            {open && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((src, i) => (
                        <button
                            key={src}
                            onClick={() => setZoom(src)}
                            className="relative rounded-xl overflow-hidden border border-[#d4af37]/25 bg-white hover:border-[#d4af37] transition-colors"
                        >
                            <span className="absolute top-1 left-1 z-10 bg-[#bf953f] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{_CIRCLED[i] || i + 1}</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`${API_BASE}${src}`}
                                alt={`도표 ${i + 1}`}
                                loading="lazy"
                                className="w-full h-36 object-contain bg-white"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* 확대 보기 */}
            {zoom && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 overflow-auto p-2 sm:p-4"
                    onClick={() => setZoom(null)}
                >
                    <button onClick={() => setZoom(null)} className="fixed top-3 right-3 z-10 text-white bg-black/60 rounded-full p-1.5" aria-label="닫기">
                        <X className="h-7 w-7" />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`${API_BASE}${zoom}`}
                        alt="명리학 학습 도표 확대"
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-4xl mx-auto rounded-lg bg-white"
                    />
                </div>
            )}
        </div>
    );
}
