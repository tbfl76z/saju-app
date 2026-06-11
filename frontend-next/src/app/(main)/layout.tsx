import { AppHeader } from "@/components/AppHeader";
import { NavBarMobile } from "@/components/NavBar";

// (main) 라우트 그룹 공유 레이아웃: 헤더 + 콘텐츠 + 푸터 + 모바일 하단탭
export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AppHeader />
            <main className="pb-6 md:pb-10 selection:bg-amber-100">
                {children}
            </main>
            <NavBarMobile />
            {/* 모바일은 하단 고정 탭바(약 70px)에 가리지 않도록 pb를 크게 잡는다 */}
            <footer className="border-t border-slate-200/50 dark:border-slate-800/50 pt-5 pb-24 md:pb-6 text-center text-xs text-slate-500 dark:text-slate-500 font-sans tracking-wide">
                <p className="text-[10px] text-slate-400 dark:text-slate-600">© 2026 Destiny Code. All rights reserved.</p>
            </footer>
        </>
    );
}
