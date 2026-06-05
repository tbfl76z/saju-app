"use client";

import { useEffect, useState } from "react";
import { CompatibilitySection } from "@/components/CompatibilitySection";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/\/$/, "");

// 두 사람 명식 궁합 분석 라우트
export default function CompatibilityPage() {
    const [terms, setTerms] = useState<Record<string, string>>({});

    useEffect(() => {
        fetch(`${API_BASE}/terms`)
            .then((res) => (res.ok ? res.json() : {}))
            .then((data) => setTerms(data))
            .catch((err) => console.error("Failed to fetch terms", err));
    }, []);

    return (
        <div className="max-w-4xl mx-auto px-6">
            <div className="text-center space-y-3 py-10">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">💞 인연의 궁합</h2>
                <p className="text-slate-600 dark:text-slate-400">두 사람의 명식을 입력하면 기운의 조화를 살펴드립니다.</p>
            </div>
            <CompatibilitySection apiBase={API_BASE} terms={terms} />
        </div>
    );
}
