"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// next-themes와 연동되는 sonner Toaster (다크모드에서 토스트도 다크로 표시)
const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            position="top-center"
            richColors
            {...props}
        />
    );
};

export { Toaster };
