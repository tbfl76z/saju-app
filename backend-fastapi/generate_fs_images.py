"""현공 학습용 도해 SVG 생성 — fengshui_engine 계산값으로 정확하게 그린다."""
import os
import fengshui_engine as fe

OUT = "static/learn"
GRID = [["巽", "離", "坤"], ["震", "中", "兌"], ["艮", "坎", "乾"]]
DIR = {"坎": "북", "艮": "북동", "震": "동", "巽": "남동", "離": "남", "坤": "남서", "兌": "서", "乾": "북서", "中": "중궁"}


def svg_head(w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'font-family="Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, Noto Sans CJK KR, sans-serif">'
            f'<rect width="{w}" height="{h}" fill="#fdf9ef"/>')


def cell(x, y, s, lines, fill="#ffffff", stroke="#b09b62"):
    out = f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{fill}" stroke="{stroke}" stroke-width="2" rx="10"/>'
    n = len(lines)
    for i, (txt, size, color, bold) in enumerate(lines):
        ty = y + s / 2 + (i - (n - 1) / 2) * (size + 8) + size * 0.35
        w = ' font-weight="bold"' if bold else ""
        out += f'<text x="{x + s / 2}" y="{ty:.0f}" font-size="{size}" fill="{color}" text-anchor="middle"{w}>{txt}</text>'
    return out


def grid9(cells, title, note=""):
    """cells: dict palace -> list of (text,size,color,bold)"""
    s, pad, top = 150, 24, 64
    w = s * 3 + pad * 2 + 16
    h = top + s * 3 + 16 + (34 if note else 8) + 20
    out = svg_head(w, h)
    out += f'<text x="{w/2}" y="40" font-size="24" fill="#5b4a1e" text-anchor="middle" font-weight="bold">{title}</text>'
    for r, row in enumerate(GRID):
        for c, g in enumerate(row):
            x = pad + c * (s + 8)
            y = top + r * (s + 8)
            fill = "#fff8e6" if g == "中" else "#ffffff"
            out += cell(x, y, s, cells[g], fill)
    if note:
        out += f'<text x="{w/2}" y="{h-14}" font-size="15" fill="#8a744a" text-anchor="middle">{note}</text>'
    return out + "</svg>"


def save(chapter, name, svg):
    d = f"{OUT}/{chapter}"
    os.makedirs(d, exist_ok=True)
    with open(f"{d}/{name}.svg", "w") as f:
        f.write(svg)
    print(f"{d}/{name}.svg")


# ── fs-coord: 낙서 9궁 ──
cells = {g: [(DIR[g], 16, "#8a744a", False), (g, 34, "#2b2b2b", True), (str(fe.PALACE_NUM[g]), 26, "#bf953f", True)] for g in fe.PALACE_NUM}
save("fs-coord", "01-nakseo", grid9(cells, "낙서 9궁 — 궁·방위·수", "위=남(전통 배치) · 각 칸: 방위 / 궁 이름 / 낙서 수"))

# ── fs-coord: 24산 원판 ──
import math
w = h = 560
out = svg_head(w, h)
out += f'<text x="{w/2}" y="36" font-size="22" fill="#5b4a1e" text-anchor="middle" font-weight="bold">24산 — 궁마다 지원·천원·인원 세 산</text>'
cx, cy, r1, r2 = w / 2, h / 2 + 14, 130, 235
for m, info in fe.MOUNTAIN_INFO.items():
    a1, a2 = info["deg"] - 7.5, info["deg"] + 7.5
    def pt(r, a):
        rad = math.radians(a)
        return cx + r * math.sin(rad), cy - r * math.cos(rad)
    x1, y1 = pt(r2, a1); x2, y2 = pt(r2, a2); x3, y3 = pt(r1, a2); x4, y4 = pt(r1, a1)
    yy = fe.MOUNTAIN_YINYANG[m]
    fill = "#fff3d6" if yy == 1 else "#eef3fb"
    out += (f'<path d="M{x1:.0f},{y1:.0f} A{r2},{r2} 0 0 1 {x2:.0f},{y2:.0f} '
            f'L{x3:.0f},{y3:.0f} A{r1},{r1} 0 0 0 {x4:.0f},{y4:.0f} Z" fill="{fill}" stroke="#b09b62"/>')
    tx, ty = pt((r1 + r2) / 2, info["deg"])
    out += f'<text x="{tx:.0f}" y="{ty:.0f}" font-size="24" fill="#2b2b2b" text-anchor="middle" font-weight="bold" transform="rotate({info["deg"]} {tx:.0f} {ty:.0f})">{m}</text>'
# 8괘 라벨
for g, num in fe.PALACE_NUM.items():
    if g == "中":
        continue
    deg = {"坎": 0, "艮": 45, "震": 90, "巽": 135, "離": 180, "坤": 225, "兌": 270, "乾": 315}[g]
    rad = math.radians(deg)
    tx, ty = cx + 92 * math.sin(rad), cy - 92 * math.cos(rad)
    out += f'<text x="{tx:.0f}" y="{ty:.0f}" font-size="22" fill="#6b532a" text-anchor="middle" font-weight="bold">{g}</text>'
out += f'<text x="{cx}" y="{cy+6}" font-size="16" fill="#8a744a" text-anchor="middle">노랑=양(순비)</text>'
out += f'<text x="{cx}" y="{cy+28}" font-size="16" fill="#8a744a" text-anchor="middle">파랑=음(역비)</text>'
out += f'<text x="{w/2}" y="{h-12}" font-size="15" fill="#8a744a" text-anchor="middle">위=북(子) · 시계방향 15°씩</text>'
save("fs-coord", "02-24mountains", out + "</svg>")

# ── fs-unban: 순비 경로 ──
order = fe.FLY_ORDER
idx = {g: i + 1 for i, g in enumerate(order)}
cells = {g: [(DIR[g], 14, "#8a744a", False), (g, 30, "#2b2b2b", True), (f"{idx[g]}번째", 18, "#c0392b", True)] for g in fe.PALACE_NUM}
save("fs-unban", "01-flypath", grid9(cells, "순비(順飛) 경로 — 숫자가 나는 순서",
                                     "中→乾→兌→艮→離→坎→坤→震→巽 · 9 다음은 1로"))

# 9운 운반
base = fe.fly_chart(9, True)
cells = {g: [(DIR[g], 14, "#8a744a", False), (str(base[g]), 40, "#bf953f" if base[g] == 9 else "#2b2b2b", True)] for g in fe.PALACE_NUM}
save("fs-unban", "02-unban9", grid9(cells, "9운 운반 — 9를 중궁에 넣고 순비", "금색 9 = 당운수"))

# ── fs-stars: 9운 子山午向 완성반 ──
c = fe.star_chart("子", 9)
def star_cells(c, period):
    cells = {}
    for g in fe.PALACE_NUM:
        m, wtr, b = c["mountain"][g], c["water"][g], c["base"][g]
        mark = ""
        if g == fe.MOUNTAIN_INFO[c["sitting"]]["palace"]:
            mark = "坐"
        elif g == fe.MOUNTAIN_INFO[c["facing"]]["palace"]:
            mark = "向"
        mc = "#c0392b" if m == period else "#2b2b2b"
        wc = "#c0392b" if wtr == period else "#1d4f8f"
        cells[g] = [(DIR[g] + (" " + mark if mark else ""), 14, "#8a744a", bool(mark)),
                    (f"{m}&#160;&#160;{wtr}", 34, "#2b2b2b", True),
                    (f"운반 {b}", 15, "#8a744a", False)]
        # 색 구분을 위해 산성·향성 분리 렌더
        cells[g][1] = (f'<tspan fill="{mc}">{m}</tspan>&#160;&#160;<tspan fill="{wc}">{wtr}</tspan>', 34, "#2b2b2b", True)
    return cells
save("fs-stars", "01-jasan9", grid9(star_cells(c, 9), "9운 子山午向 완성반 — 쌍성회좌",
                                    "왼쪽=산성 · 오른쪽=향성(파랑) · 붉은 9=당운수 · 두 9가 좌궁(坎)에"))

# ── fs-structure: 격국 4형 개념도 (2x2 미니 그리드 4개는 복잡 — 대표 왕산왕향 8운 예) ──
c8 = fe.star_chart("乾", 8)
save("fs-structure", "01-wangsan8", grid9(star_cells(c8, 8), "8운 乾山巽向 — 왕산왕향",
                                          "산성 8이 좌궁(乾), 향성 8이 향궁(巽) — 각자 제자리 = 최길국"))
c9 = fe.star_chart("午", 9)
save("fs-structure", "02-ssanghyang9", grid9(star_cells(c9, 9), "9운 午山子向 — 쌍성회향",
                                             "산·향성의 9가 모두 향궁(坎)에 모임 — 재왕정쇠"))

# ── fs-annual: 2026 연자백 ──
an = fe.annual_chart(2026)
cells = {g: [(DIR[g], 14, "#8a744a", False),
             (str(an[g]), 40, "#c0392b" if an[g] in (5, 2) else "#2b2b2b", True),
             ("오황!" if an[g] == 5 else ("이흑!" if an[g] == 2 else ""), 16, "#c0392b", True)] for g in fe.PALACE_NUM}
save("fs-annual", "01-annual2026", grid9(cells, "2026년 연자백 — 1白 입중",
                                         "붉은 칸(오황=남, 이흑=북서)은 올해 공사·이사 회피"))
