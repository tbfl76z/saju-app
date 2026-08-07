"use client";

// 저장된 명식 목록을 보여주는 모달 컴포넌트
import { useEffect, useState } from "react";
import { X, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/useToast";
import {
  listProfiles,
  deleteProfile,
  type SavedProfile,
} from "@/lib/storage";

// 컴포넌트 props 타입 정의
interface SavedProfilesModalProps {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelect: (sajuData: any) => void;
}

export default function SavedProfilesModal({
  open,
  onClose,
  onSelect,
}: SavedProfilesModalProps) {
  // 저장된 명식 목록 상태
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);

  // 모달이 열릴 때마다 목록을 새로 불러온다
  useEffect(() => {
    if (open) {
      setProfiles(listProfiles());
    }
  }, [open]);

  // 닫혀 있으면 아무것도 렌더하지 않는다
  if (!open) return null;

  // 저장 시각을 한국어 형식 문자열로 변환한다
  const formatDate = (epochMs: number): string =>
    new Date(epochMs).toLocaleString("ko-KR");

  // 명식 불러오기 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelect = (sajuData: any) => {
    onSelect(sajuData);
    onClose();
  };

  // 명식 삭제 처리 후 목록 갱신
  const handleDelete = (id: string) => {
    deleteProfile(id);
    setProfiles(listProfiles());
    notify.info("명식을 삭제했습니다");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* 백드롭: 클릭 시 모달을 닫는다 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 모달 패널 */}
      <div className="glass-card relative z-10 w-full max-w-md max-h-[80vh] overflow-auto rounded-3xl p-6">
        {/* 헤더: 제목 + 닫기 버튼 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-noto-serif text-xl font-semibold text-[#d4af37] dark:text-[#e5c558]">
            저장된 명식
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 목록이 비어 있을 때 안내 */}
        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              저장된 명식이 없습니다
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-[#d4af37]/20 bg-white/40 p-3 dark:border-[#d4af37]/15 dark:bg-white/5"
              >
                {/* 명식 정보 */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                    {p.label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(p.savedAt)}
                  </p>
                </div>

                {/* 불러오기 버튼 */}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSelect(p.sajuData)}
                  className="shrink-0 rounded-xl bg-[#d4af37] text-white hover:bg-[#c19f2f] dark:bg-[#d4af37] dark:hover:bg-[#e5c558] dark:text-black"
                >
                  불러오기
                </Button>

                {/* 삭제 버튼 */}
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  aria-label="삭제"
                  className="shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
