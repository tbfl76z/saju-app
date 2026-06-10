"use client";

import { useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { API_BASE } from "@/lib/learn";

// 원전 자료 도표 갤러리 — PDF 교재에서 추출한 그림·표를 펼쳐 본다.
// 썸네일 그리드 + 탭하면 확대(라이트박스).
export function ChapterGallery({ images }: { images: string[] }) {
    const [open, setOpen] = useState(false);
    const [zoom, setZoom] = useState<string | null>(null);

    if (!images || images.length === 0) return null;

    return (
        <div className="glass-card p-5 space-y-4">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
                <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                    <ImageIcon className="h-5 w-5 text-[#bf953f]" />
                    원전 자료 도표 ({images.length}장)
                </span>
                <span className="text-slate-400 text-sm">{open ? "접기 ▲" : "펼치기 ▼"}</span>
            </button>

            {open && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((src) => (
                        <button
                            key={src}
                            onClick={() => setZoom(src)}
                            className="rounded-xl overflow-hidden border border-[#d4af37]/25 bg-white hover:border-[#d4af37] transition-colors"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`${API_BASE}${src}`}
                                alt="명리학 학습 도표"
                                loading="lazy"
                                className="w-full h-28 object-cover object-top"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* 확대 보기 */}
            {zoom && (
                <div
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setZoom(null)}
                >
                    <button className="absolute top-4 right-4 text-white" aria-label="닫기">
                        <X className="h-8 w-8" />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`${API_BASE}${zoom}`}
                        alt="명리학 학습 도표 확대"
                        className="max-w-full max-h-full rounded-xl bg-white"
                    />
                </div>
            )}
        </div>
    );
}
