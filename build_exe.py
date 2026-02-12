"""
build_exe.py - PyInstaller를 사용한 사주 앱 EXE 빌드 스크립트
"""

import subprocess
import os

def build():
    print("사주 앱 실행 파일(.exe) 빌드를 시작합니다...")
    
    # PyInstaller 명령어 실행
    # --onefile: 단일 파일로 생성
    # --add-data: 프론트엔드 및 데이터 폴더 포함
    # --windowed: 콘솔 창 없이 실행
    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--add-data", "frontend;frontend",
        "--add-data", "data;data",
        "--name", "사주풀이AI",
        "app.py"
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print("\n빌드가 완료되었습니다! 'dist' 폴더 안의 '사주풀이AI.exe'를 확인하세요.")
    except Exception as e:
        print(f"\n빌드 중 오류 발생: {e}")

if __name__ == "__main__":
    build()
