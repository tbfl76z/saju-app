#!/usr/bin/env bash
# 나경 파일을 프로젝트에 배치하고 기본 점검을 돌린다.
#
#   ./install-luopan.sh /path/to/saju-app
#
# 다운로드한 eightMansions.ts, Luopan.tsx, CLAUDE_CODE_TASK.md 가
# 이 스크립트와 같은 폴더에 있어야 한다.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${1:-.}"

cd "$PROJECT"
PROJECT="$(pwd)"
echo "대상 프로젝트: $PROJECT"

[ -f package.json ] || { echo "package.json이 없습니다. 프로젝트 루트를 지정하세요."; exit 1; }

for f in eightMansions.ts Luopan.tsx; do
  [ -f "$SRC/$f" ] || { echo "$f 를 $SRC 에서 찾을 수 없습니다."; exit 1; }
done

# ── 라우터 판별 ────────────────────────────────
if   [ -d app ];     then ROUTER=app;     PAGE_DIR=app/luopan
elif [ -d src/app ]; then ROUTER=app;     PAGE_DIR=src/app/luopan
elif [ -d pages ];   then ROUTER=pages;   PAGE_DIR=pages
elif [ -d src/pages ];then ROUTER=pages;  PAGE_DIR=src/pages
else echo "app/ 도 pages/ 도 없습니다. 수동으로 배치하세요."; exit 1
fi

BASE=""
[ -d src ] && [ -d "src/$ROUTER" ] && BASE="src/"
LIB="${BASE}lib"
COMP="${BASE}components"
echo "라우터: $ROUTER · 라이브러리: $LIB · 컴포넌트: $COMP"

# ── 별칭 확인 ──────────────────────────────────
if ! grep -q '"@/\*"' tsconfig.json 2>/dev/null; then
  echo
  echo "  주의: tsconfig.json 에 @/* 별칭이 없습니다."
  echo "  Luopan.tsx 의 import 경로를 직접 고쳐야 합니다."
  echo
fi

# ── 배치 ───────────────────────────────────────
mkdir -p "$LIB" "$COMP" "$PAGE_DIR"

copy_safe() {
  local from=$1 to=$2
  if [ -f "$to" ]; then
    cp "$to" "$to.bak"
    echo "  기존 파일 백업 → $to.bak"
  fi
  cp "$from" "$to"
  echo "  $to"
}

echo "파일 배치:"
copy_safe "$SRC/eightMansions.ts" "$LIB/eightMansions.ts"
copy_safe "$SRC/Luopan.tsx"       "$COMP/Luopan.tsx"

# ── 페이지 ─────────────────────────────────────
if [ "$ROUTER" = app ]; then
  PAGE="$PAGE_DIR/page.tsx"
else
  PAGE="$PAGE_DIR/luopan.tsx"
fi

if [ -f "$PAGE" ]; then
  echo "  $PAGE 가 이미 있어 건너뜁니다."
else
  cat > "$PAGE" <<'TSX'
import Luopan from "@/components/Luopan";

export const metadata = {
  title: "나경 · Destiny Code",
  description: "휴대폰 방위 센서로 좌향을 재고 팔택풍수 길흉 방위를 확인합니다.",
};

export default function Page() {
  return (
    <main style={{ padding: "24px 16px" }}>
      <Luopan />
    </main>
  );
}
TSX
  [ "$ROUTER" = pages ] && sed -i.tmp '/export const metadata/,/};/d' "$PAGE" && rm -f "$PAGE.tmp"
  echo "  $PAGE"
fi

# ── 점검 ───────────────────────────────────────
echo
echo "타입 체크:"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"
if [ -z "$TSC_OUT" ]; then
  echo "  통과"
else
  echo "$TSC_OUT" | head -20
  echo
  echo "  react 나 jsx 관련 오류만 보인다면 의존성 설치 여부와"
  echo "  tsconfig.json 의 jsx 설정을 확인하세요."
fi

cat <<'EOF'

──────────────────────────────────────────────
남은 작업은 Claude Code 에 맡기세요.

  claude "CLAUDE_CODE_TASK.md 를 읽고 3번(내비게이션)과
          4번(명식 연동)을 처리해줘. 0번 사전 확인부터 보고할 것."

배치와 페이지 생성은 끝났고, 헤더 메뉴 연결과
저장된 생년·성별 연동은 프로젝트 구조를 봐야 합니다.

센서는 실제 안드로이드 기기의 크롬에서만 확인됩니다.
데스크톱과 개발 서버(http)에서는 동작하지 않습니다.
──────────────────────────────────────────────
EOF
