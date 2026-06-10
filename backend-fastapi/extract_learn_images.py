"""
학습 모드용 PDF 이미지 추출 스크립트 (개발용 — 서버 런타임에는 불필요)
- data/*.pdf에서 도표·그림(의미 있는 크기)을 추출해 static/learn/<챕터id>/ 에 JPEG로 저장한다
- 실행: venv/bin/python extract_learn_images.py  (재실행 시 기존 산출물 삭제 후 재생성)
- 의존: pymupdf, pillow (로컬 전용)
"""
import io
import shutil
from pathlib import Path

import fitz
from PIL import Image

# PDF 파일명(stem) → 학습 챕터 id 매핑
PDF_TO_CHAPTER = {
    "음양오행": "elements",
    "천간": "stems",
    "지지": "branches",
    "4지장간기초": "jijanggan",
    "5.육친기초": "sipseong",
    "12운성": "unseong",
    "6.합형충파해": "hapchung",
    "12신살": "sinsal",
    "12 (1)": "sinsal",
    "기타신살 (2)": "sinsal",
    "격국용신 (1)": "practice",
}

MIN_W, MIN_H = 200, 150  # 아이콘·장식 제외 기준
MAX_WIDTH = 1200         # 모바일 표시용 충분 폭 — 초과 시 축소
JPEG_QUALITY = 82
OUT_ROOT = Path(__file__).parent / "static" / "learn"


def extract() -> None:
    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    data_dir = Path(__file__).parent / "data"
    summary: dict[str, int] = {}

    for pdf_path in sorted(data_dir.glob("*.pdf")):
        chapter = PDF_TO_CHAPTER.get(pdf_path.stem)
        if not chapter:
            continue
        out_dir = OUT_ROOT / chapter
        out_dir.mkdir(parents=True, exist_ok=True)
        seen_xrefs: set[int] = set()  # 같은 이미지가 여러 페이지에 재사용되는 경우 중복 방지
        idx = summary.get(chapter, 0)

        with fitz.open(pdf_path) as doc:
            for page_no, page in enumerate(doc, start=1):
                for img in page.get_images(full=True):
                    xref, w, h = img[0], img[2], img[3]
                    if xref in seen_xrefs or w < MIN_W or h < MIN_H:
                        continue
                    seen_xrefs.add(xref)
                    pix = fitz.Pixmap(doc, xref)
                    if pix.colorspace and pix.colorspace.n > 3:  # CMYK 등 → RGB 변환
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                    if im.width > MAX_WIDTH:
                        im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
                    idx += 1
                    im.save(out_dir / f"{idx:03d}.jpg", "JPEG", quality=JPEG_QUALITY, optimize=True)
                    pix = None
        summary[chapter] = idx
        print(f"{pdf_path.name} → {chapter} (누적 {idx}장)")

    print("\n챕터별 추출 결과:", summary)


if __name__ == "__main__":
    extract()
