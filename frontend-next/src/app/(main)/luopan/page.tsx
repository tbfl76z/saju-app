"use client";

import { useEffect, useState } from "react";
import Luopan from "@/components/Luopan";
import FlyingStarsView from "@/components/FlyingStarsView";
import SamhapView from "@/components/SamhapView";
import FloorPlanView from "@/components/FloorPlanView";
import { getPrimaryProfile } from "@/lib/storage";

// 연주(年柱) 간지로 입춘 보정 연도를 역산한다.
// 만세력이 낸 연주 간지는 이미 입춘 기준이므로, 양력 연도의 표준 년간지와
// 다르면 입춘 전 출생(→ 전년)으로 판정한다. (근사 보정보다 정확)
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function correctedYear(sajuData: any): number | undefined {
    const bd: string = sajuData?.birth_date || "";
    const y = parseInt(String(bd).slice(0, 4), 10);
    if (!y || y < 1900) return undefined;
    const yz = sajuData?.pillars?.year;
    const gz: string = yz?.pillar || `${yz?.stem ?? ""}${yz?.branch ?? ""}`;
    if (gz.length >= 2) {
        const stdStem = STEMS[((y - 4) % 10 + 10) % 10];
        const stdBranch = BRANCHES[((y - 4) % 12 + 12) % 12];
        // 연주가 전년 간지 = 입춘 전 출생
        if (gz[0] !== stdStem || gz[1] !== stdBranch) return y - 1;
    }
    return y;
}

// "남"/"여"(또는 M/F, male/female) → 컴포넌트가 받는 "male" | "female"
function toGender(g: unknown): "male" | "female" | undefined {
    if (g === "남" || g === "M" || g === "male" || g === 0) return "male";
    if (g === "여" || g === "F" || g === "female" || g === 1) return "female";
    return undefined;
}

type Mode = "팔택" | "현공" | "삼합" | "도면";

export default function LuopanPage() {
    const [ready, setReady] = useState(false);
    const [mode, setMode] = useState<Mode>("팔택");
    const [birthYear, setBirthYear] = useState<number | undefined>(undefined);
    const [gender, setGender] = useState<"male" | "female" | undefined>(undefined);

    // 저장된 '내 명식'이 있으면 본명괘가 자동으로 잡히도록 값을 확정한 뒤 마운트한다
    useEffect(() => {
        const p = getPrimaryProfile();
        const sd = p?.sajuData;
        if (sd) {
            setBirthYear(correctedYear(sd));
            setGender(toGender(sd.gender));
        }
        setReady(true);
    }, []);

    if (!ready) return null;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
            <div className="text-center space-y-2 py-5 md:py-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50 font-noto-serif">🧭 나경(패철)</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm">휴대폰 방위 센서로 좌향을 재고 팔택풍수 길흉 방위를 확인합니다.</p>
            </div>
            {/* 유파 탭: 팔택 나경(센서) / 현공비성 / 삼합수법 / 도면 방위 */}
            <div className="flex gap-1.5 mb-4 flex-wrap justify-center">
                {(["팔택", "현공", "삼합", "도면"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => setMode(m)}
                        className={"px-4 py-2 rounded-full text-sm font-semibold transition-colors " +
                            (mode === m ? "bg-[#d4af37]/15 text-[#bf953f] dark:text-[#e6c35c]"
                                : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60")}>
                        {m === "팔택" ? "팔택 나경" : m === "현공" ? "현공비성" : m === "삼합" ? "삼합수법" : "도면 방위"}
                    </button>
                ))}
            </div>

            {mode === "팔택" && (
                /* 나경은 어두운 배경 전제로 디자인돼 있어, 밝은 배경 카드로 감싸면 텍스트가 흐리다.
                   원 디자인 의도대로 짙은 배경 카드에 담아 가독성을 확보한다. */
                <div style={{
                    background: "linear-gradient(160deg, #1b2233, #10151f)",
                    borderRadius: 20,
                    padding: "22px 10px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                }}>
                    <Luopan birthYear={birthYear} gender={gender} />
                </div>
            )}
            {mode === "현공" && <FlyingStarsView birthYear={birthYear} gender={gender} />}
            {mode === "삼합" && <SamhapView />}
            {mode === "도면" && <FloorPlanView birthYear={birthYear} gender={gender} />}
        </div>
    );
}
