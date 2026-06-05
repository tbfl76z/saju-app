"use client";

// 결과 화면 상단 액션 바: 명식 저장 / 이미지 / PDF / 링크 공유
import { useState } from "react";
import { Save, Image as ImageIcon, FileDown, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/useToast";
import { saveProfile } from "@/lib/storage";
import { exportAsImage, exportAsPdf } from "@/lib/exportImage";

// 컴포넌트 props 타입 정의
interface SaveShareBarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sajuData: any;
  aiAnalysis?: string;
  captureRef: React.RefObject<HTMLElement | null>;
  apiBase: string;
}

// 진행 중인 비동기 작업 종류
type Pending = "save" | "image" | "pdf" | "share" | null;

export default function SaveShareBar({
  sajuData,
  aiAnalysis,
  captureRef,
  apiBase,
}: SaveShareBarProps) {
  // 현재 로딩 중인 액션을 추적
  const [pending, setPending] = useState<Pending>(null);

  // 내보내기 파일명 생성 (이름-생년월일)
  const fileName = `${sajuData?.name || "destiny"}-${sajuData?.birth_date || ""}`;

  // 1) 명식 저장
  const handleSave = () => {
    setPending("save");
    try {
      saveProfile(sajuData, aiAnalysis);
      notify.success("명식을 저장했습니다");
    } catch {
      notify.error("저장에 실패했습니다", "잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  // 2) 이미지로 내보내기
  const handleImage = async () => {
    if (!captureRef.current) {
      notify.error("캡처할 영역을 찾을 수 없습니다");
      return;
    }
    setPending("image");
    try {
      await exportAsImage(captureRef.current, fileName);
    } catch {
      notify.error("이미지 저장에 실패했습니다");
    } finally {
      setPending(null);
    }
  };

  // 3) PDF로 내보내기
  const handlePdf = async () => {
    if (!captureRef.current) {
      notify.error("캡처할 영역을 찾을 수 없습니다");
      return;
    }
    setPending("pdf");
    try {
      await exportAsPdf(captureRef.current, fileName);
    } catch {
      notify.error("PDF 저장에 실패했습니다");
    } finally {
      setPending(null);
    }
  };

  // 4) 링크 공유 (서버에 코드 발급 요청 후 클립보드 복사)
  const handleShare = async () => {
    setPending("share");
    try {
      const res = await fetch(`${apiBase}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saju_data: sajuData,
          ai_analysis: aiAnalysis,
          label: sajuData?.name,
        }),
      });
      if (!res.ok) throw new Error("share failed");
      const data: { code: string } = await res.json();
      const url = `${window.location.origin}/shared/${data.code}`;
      await navigator.clipboard.writeText(url);
      notify.success("공유 링크를 복사했습니다", url);
    } catch {
      notify.error("링크 공유에 실패했습니다", "잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  // 공통 버튼 스타일 (glass 톤 + 다크 대응)
  const btnClass = cn(
    "rounded-full gap-2 border-[#d4af37]/40 bg-white/40 backdrop-blur-sm",
    "text-neutral-800 hover:bg-[#d4af37]/10 hover:text-[#d4af37]",
    "dark:border-[#d4af37]/30 dark:bg-white/5 dark:text-neutral-100",
    "dark:hover:bg-[#d4af37]/15 dark:hover:text-[#d4af37]"
  );

  // 액션별 버튼 구성
  const actions: {
    key: Exclude<Pending, null>;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }[] = [
    { key: "save", label: "명식 저장", icon: <Save className="h-4 w-4" />, onClick: handleSave },
    { key: "image", label: "이미지", icon: <ImageIcon className="h-4 w-4" />, onClick: handleImage },
    { key: "pdf", label: "PDF", icon: <FileDown className="h-4 w-4" />, onClick: handlePdf },
    { key: "share", label: "링크 공유", icon: <Share2 className="h-4 w-4" />, onClick: handleShare },
  ];

  return (
    <div
      className={cn(
        "glass-card rounded-2xl border border-[#d4af37]/20 p-3",
        "dark:border-[#d4af37]/15",
        // 모바일 2열 그리드 / 데스크탑 가로 정렬
        "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center"
      )}
    >
      {actions.map((action) => {
        const isLoading = pending === action.key;
        // 한 작업이 진행 중이면 다른 버튼도 비활성화
        const disabled = pending !== null;
        return (
          <Button
            key={action.key}
            type="button"
            variant="outline"
            className={btnClass}
            disabled={disabled}
            onClick={action.onClick}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
            <span>{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
