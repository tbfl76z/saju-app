"use client";

/**
 * 폰 정렬 방법 그림.
 *
 * "폰 위쪽을 창밖으로", "긴 변을 벽에 맞추고" 같은 말로는 전달이 안 된다.
 * 긴 변은 좌우 두 개고, 평행하게만 놓으면 앞뒤 180°가 모호하다.
 * 센서(webkitCompassHeading / 360-alpha)가 읽는 것은 **눕힌 폰의 위쪽 끝이
 * 가리키는 방위**이므로, 그림으로 화살표를 창밖으로 못박아 보여준다.
 */
export default function AlignDiagram() {
    return (
        <div className="flex items-start gap-3 justify-center">
            {/* ── 맞는 자세 ── */}
            <figure className="flex-1 max-w-[160px] m-0">
                <svg viewBox="0 0 120 150" className="w-full h-auto" role="img" aria-label="맞는 자세: 폰의 화살표가 창밖을 향하고 폰 위쪽 끝이 창면과 나란함">
                    {/* 창면(벽) */}
                    <text x={60} y={11} fontSize={9} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">창밖</text>
                    <line x1={8} y1={26} x2={112} y2={26} strokeWidth={4} strokeLinecap="round"
                        className="stroke-slate-400 dark:stroke-slate-500" />
                    {/* 향(向) 화살표 — 창면을 수직으로 뚫고 나간다 */}
                    <line x1={60} y1={60} x2={60} y2={38} strokeWidth={3.5} strokeLinecap="round"
                        className="stroke-sky-600 dark:stroke-sky-300" />
                    <polygon points="60,30 54,42 66,42" className="fill-sky-600 dark:fill-sky-300" />
                    <text x={72} y={46} fontSize={11} fontWeight={700} className="fill-sky-600 dark:fill-sky-300" style={{ fontFamily: "'Noto Serif KR',serif" }}>向</text>
                    {/* 폰 — 위쪽 끝(짧은 변)이 창면과 나란하다 */}
                    <rect x={43} y={62} width={34} height={62} rx={6} strokeWidth={2.5}
                        className="fill-white dark:fill-slate-800 stroke-sky-600 dark:stroke-sky-300" />
                    <rect x={47} y={68} width={26} height={50} rx={3}
                        className="fill-sky-100 dark:fill-slate-700" />
                    {/* 위쪽 끝이 창면과 평행함을 보이는 보조선 */}
                    <line x1={35} y1={62} x2={85} y2={62} strokeWidth={1.5} strokeDasharray="3,3"
                        className="stroke-sky-500 dark:stroke-sky-400" />
                    <text x={60} y={137} fontSize={9} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">등 뒤 = 坐</text>
                    {/* ✓ 배지 */}
                    <circle cx={14} cy={112} r={10} className="fill-emerald-500" />
                    <path d="M9,112 l3.5,3.5 l6,-7" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <figcaption className="mt-1 text-[10.5px] leading-snug text-center text-emerald-700 dark:text-emerald-300">
                    폰 <b>위쪽 끝(짧은 변)</b>을 창면과 나란히<br />→ 화살표가 창밖을 뚫고 나간다
                </figcaption>
            </figure>

            {/* ── 틀린 자세 ── */}
            <figure className="flex-1 max-w-[160px] m-0">
                <svg viewBox="0 0 120 150" className="w-full h-auto" role="img" aria-label="틀린 자세: 폰을 창면과 나란히 눕혀 화살표가 벽을 따라 옆으로 향함">
                    <text x={60} y={11} fontSize={9} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">창밖</text>
                    <line x1={8} y1={26} x2={112} y2={26} strokeWidth={4} strokeLinecap="round"
                        className="stroke-slate-400 dark:stroke-slate-500" />
                    {/* 폰이 창면과 나란히 누우면 화살표가 벽을 따라 옆으로 간다 */}
                    <rect x={22} y={70} width={62} height={34} rx={6} strokeWidth={2.5}
                        className="fill-white dark:fill-slate-800 stroke-rose-500" />
                    <rect x={28} y={74} width={50} height={26} rx={3}
                        className="fill-rose-100 dark:fill-slate-700" />
                    <line x1={86} y1={87} x2={102} y2={87} strokeWidth={3.5} strokeLinecap="round" className="stroke-rose-500" />
                    <polygon points="110,87 98,81 98,93" className="fill-rose-500" />
                    {/* 90° 어긋남 표시 */}
                    <path d="M60,66 A 22,22 0 0 1 82,88" fill="none" strokeWidth={1.5} strokeDasharray="3,3" className="stroke-rose-400" />
                    <text x={88} y={64} fontSize={10} fontWeight={700} className="fill-rose-500">90°</text>
                    {/* ✗ 배지 */}
                    <circle cx={14} cy={124} r={10} className="fill-rose-500" />
                    <path d="M10,120 l8,8 M18,120 l-8,8" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
                </svg>
                <figcaption className="mt-1 text-[10.5px] leading-snug text-center text-rose-600 dark:text-rose-400">
                    폰을 창면과 <b>나란히 눕히면</b><br />화살표가 벽을 따라 옆으로 → 90° 어긋남
                </figcaption>
            </figure>
        </div>
    );
}
