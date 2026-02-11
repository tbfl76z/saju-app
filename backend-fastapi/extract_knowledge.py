import os
from pypdf import PdfReader

def extract_text_from_pdfs(data_dir, output_file):
    with open(output_file, 'w', encoding='utf-8') as f:
        for filename in sorted(os.listdir(data_dir)):
            if filename.endswith('.pdf'):
                print(f"Extracting from {filename}...")
                reader = PdfReader(os.path.join(data_dir, filename))
                f.write(f"\n\n### SOURCE: {filename} ###\n\n")
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        f.write(text + "\n")
            elif filename.endswith('.txt'):
                print(f"Extracting from {filename}...")
                with open(os.path.join(data_dir, filename), 'r', encoding='utf-8') as tf:
                    f.write(f"\n\n### SOURCE: {filename} ###\n\n")
                    f.write(tf.read() + "\n")
    print(f"Extraction complete. Saved to {output_file}")

if __name__ == "__main__":
    # 데이터 디렉토리 설정 (main.py 기준 상대 경로 또는 절대 경로)
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
    output_file = os.path.abspath(os.path.join(os.path.dirname(__file__), 'knowledge_base.txt'))
    extract_text_from_pdfs(data_dir, output_file)
