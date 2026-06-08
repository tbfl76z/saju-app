"use client";

// 결과 DOM을 이미지/PDF로 내보내는 클라이언트 유틸.
// html2canvas / jspdf는 번들 크기가 크므로 동적 import로 호출 시점에만 로드한다.

// 캡처 시 다크 배경이 투명/검정으로 깨지지 않도록 현재 테마에 맞는 배경색을 고른다.
function resolveBackground(): string {
    if (typeof document === "undefined") return "#ffffff";
    return document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff";
}

async function capture(node: HTMLElement): Promise<HTMLCanvasElement> {
    // html2canvas-pro: Tailwind v4의 oklch()/lab()/color() 등 최신 색상 함수 지원
    const { default: html2canvas } = await import("html2canvas-pro");
    return html2canvas(node, {
        backgroundColor: resolveBackground(),
        scale: 2, // 고해상도
        useCORS: true,
        logging: false,
    });
}

// PNG 이미지로 저장
export async function exportAsImage(node: HTMLElement, filename = "destiny-code"): Promise<void> {
    const canvas = await capture(node);
    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

// A4 PDF로 저장 (긴 콘텐츠는 여러 페이지로 분할)
export async function exportAsPdf(node: HTMLElement, filename = "destiny-code"): Promise<void> {
    const canvas = await capture(node);
    const { jsPDF } = await import("jspdf");

    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
        heightLeft -= pageH;
    }
    pdf.save(`${filename}.pdf`);
}
