import argparse
import re
from pathlib import Path

import fitz


def _clean_text(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def convert_pdf_to_markdown(pdf_path, output_dir):
    pdf_path = Path(pdf_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    lines = [
        f"# {pdf_path.stem}",
        "",
        f"Source: {pdf_path.name}",
        "",
    ]

    with fitz.open(pdf_path) as doc:
        for page_number, page in enumerate(doc, start=1):
            text = _clean_text(page.get_text("text"))
            if not text:
                continue
            lines.extend([f"## Page {page_number}", "", text, ""])

    output_path = output_dir / f"{pdf_path.stem}.md"
    output_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return output_path


def convert_directory(source_dir, output_dir):
    source_dir = Path(source_dir)
    pdfs = sorted(source_dir.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDF files found in {source_dir}")

    converted = []
    for pdf_path in pdfs:
        output_path = convert_pdf_to_markdown(pdf_path, output_dir)
        converted.append(output_path)
        print(f"Converted {pdf_path.name} -> {output_path}")
    return converted


def main():
    parser = argparse.ArgumentParser(description="Convert PDF learning files to Markdown.")
    parser.add_argument("source_dir", help="Directory containing PDF files.")
    parser.add_argument("output_dir", help="Directory where Markdown files will be written.")
    args = parser.parse_args()

    convert_directory(args.source_dir, args.output_dir)


if __name__ == "__main__":
    main()
