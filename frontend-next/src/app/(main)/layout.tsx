import { AppHeader } from "@/components/AppHeader";
import { NavBarMobile } from "@/components/NavBar";

// (main) 라우트 그룹 공유 레이아웃: 헤더 + 콘텐츠 + 푸터 + 모바일 하단탭
export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AppHeader />
            <main className="min-h-screen pb-28 md:pb-20 selection:bg-amber-100">
                {children}
            </main>
            <NavBarMobile />
            <footer className="mt-32 border-t border-slate-200/50 dark:border-slate-800/50 py-16 text-center text-xs text-slate-500 dark:text-slate-500 font-sans tracking-wide">
                <div className="max-w-xl mx-auto space-y-4 px-6">
                    <div className="flex justify-center gap-6 mb-8 mt-4 text-slate-300 dark:text-slate-700">
                        <span>✦</span> <span>✦</span> <span>✦</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 font-noto-serif">
                        Destiny Code — 정통 명리학과 AI가 만나는 개인 운명 해석 플랫폼
                    </p>
                    <p className="text-slate-400 dark:text-slate-600">
                        절기 기반 만세력 엔진(sajupy)으로 사주를 계산하고, Google Gemini 2.5로 풀이합니다.
                    </p>
                    <p className="text-[11px] text-slate-400/90 dark:text-slate-600 leading-relaxed">
                        본 서비스가 제공하는 해석은 자기 이해와 성찰을 돕기 위한 참고 정보이며,<br className="hidden sm:block" />
                        중요한 결정은 스스로의 판단으로 신중히 내리시기를 권합니다.
                    </p>
                    <div className="pt-5 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 dark:text-slate-600">
                        Ancient Wisdom · Modern Intelligence
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-600">© 2026 Destiny Code. All rights reserved.</p>
                </div>
            </footer>
        </>
    );
}
