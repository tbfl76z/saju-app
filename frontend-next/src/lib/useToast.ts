"use client";

import { toast } from "sonner";

// 프로젝트 표준 토스트 헬퍼. alert()/에러 문자열을 대체하는 단일 진입점.
export const notify = {
    success: (message: string, description?: string) => toast.success(message, { description }),
    error: (message: string, description?: string) => toast.error(message, { description }),
    info: (message: string, description?: string) => toast(message, { description }),
    loading: (message: string) => toast.loading(message),
    dismiss: (id?: string | number) => toast.dismiss(id),
};

export { toast };
