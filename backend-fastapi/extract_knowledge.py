import os
from pathlib import Path


TEXT_EXTENSIONS = {".md", ".txt"}
PDF_EXTENSION = ".pdf"


def _extract_pdf_text(path):
    try:
        import fitz

        with fitz.open(path) as doc:
            return "\n".join(page.get_text("text") for page in doc)
    except ImportError:
        from pypdf import PdfReader

        reader = PdfReader(path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)


def _iter_knowledge_files(data_dir):
    data_path = Path(data_dir)
    for root, dirnames, filenames in os.walk(data_path):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for filename in sorted(filenames):
            if filename.startswith("."):
                continue
            path = Path(root) / filename
            if path.suffix.lower() in TEXT_EXTENSIONS or path.suffix.lower() == PDF_EXTENSION:
                yield path


def extract_text_from_sources(data_dir, output_file):
    data_path = Path(data_dir)
    with open(output_file, "w", encoding="utf-8") as f:
        for path in _iter_knowledge_files(data_path):
            source_name = path.relative_to(data_path).as_posix()
            print(f"Extracting from {source_name}...")
            f.write(f"\n\n### SOURCE: {source_name} ###\n\n")
            if path.suffix.lower() == PDF_EXTENSION:
                f.write(_extract_pdf_text(path) + "\n")
            else:
                f.write(path.read_text(encoding="utf-8") + "\n")
    print(f"Extraction complete. Saved to {output_file}")


extract_text_from_pdfs = extract_text_from_sources

if __name__ == "__main__":
    # 데이터 디렉토리 설정 (main.py 기준 상대 경로 또는 절대 경로)
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
    output_file = os.path.abspath(os.path.join(os.path.dirname(__file__), 'knowledge_base.txt'))
    extract_text_from_sources(data_dir, output_file)
