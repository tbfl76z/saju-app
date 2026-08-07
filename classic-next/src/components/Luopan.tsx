"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  combinedMansions, compatibility, houseGuaFromFacing, houseOf, kuaNumber,
  mingGua, placementAdvice, solarYearForBazi, starFor, trigramAt, voidCheck,
  HOUSE_INFO, MOUNTAINS, STAR_INFO, VOID_NOTE,
  type Gender, type Star, type Trigram,
} from "@/lib/eightMansions";

/** 두 기준 종합: 0 둘 다 흉 / 1 한쪽만 길 / 2 둘 다 길 */
const SCORE_COLOR = ["#8C2F26", "#8A7443", "#1F7A57"];

const STAR_COLOR: Record<Star, string> = {
  생기: "#1F7A57", 천의: "#2E8B6B", 연년: "#4E9C82", 복위: "#7BAE9A",
  화해: "#C08A5A", 육살: "#B5734A", 오귀: "#A5503C", 절명: "#8C2F26",
};

/** 자침편차(서울 인근) — NOAA WMM-2025: 2025-02-24 기준 8.95°W, 연 0.04°W씩 증가.
 *  서편각은 음수(진북 = 자북 방위각 − 편각). 경과 연수만큼 자동 반영한다. */
const DECLINATION = -(8.95 + 0.04 * Math.max(0, new Date().getFullYear() + (new Date().getMonth() + 0.5) / 12 - 2025.15));
/** 버튼 표기용 반올림 값 (예: 9.0) */
const DECL_LABEL = Math.abs(DECLINATION).toFixed(1);

type Source = "absolute-event" | "orientation-sensor" | "relative" | null;
const RANK: Record<string, number> = {
  "absolute-event": 3, "orientation-sensor": 2, relative: 1,
};
const SOURCE_LABEL: Record<string, string> = {
  "absolute-event": "절대 방위 이벤트",
  "orientation-sensor": "OrientationSensor",
  relative: "상대 방위",
};

const norm = (d: number) => ((d % 360) + 360) % 360;
const pt = (deg: number, r: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [200 + r * Math.cos(a), 200 + r * Math.sin(a)];
};
const sector = (a0: number, a1: number, r0: number, r1: number) => {
  const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1);
  const [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r1} ${r1} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${big} 0 ${x3} ${y3} Z`;
};

interface Props {
  /** 명식에서 넘겨받은 출생 연도. 이미 입춘 보정된 값이어야 한다. */
  birthYear?: number;
  /** 연도 대신 생년월일을 넘기면 입춘을 근사 보정해서 쓴다. birthYear가 있으면 무시된다. */
  birthDate?: Date;
  gender?: Gender;
  /** 공망 허용 오차(도). 유파에 따라 1.5 ~ 3을 쓴다. */
  voidTolerance?: number;
  /** 전통 나경은 자침(자북) 기준이라 기본 false */
  defaultTrueNorth?: boolean;
  className?: string;
}

export default function Luopan({
  birthYear, birthDate, gender, voidTolerance = 3,
  defaultTrueNorth = false, className,
}: Props) {
  const dialRef = useRef<SVGGElement | null>(null);
  const smoothRef = useRef(0);
  const sourceRef = useRef<Source>(null);
  const relOffsetRef = useRef(0);
  const heldRef = useRef(false);
  const trueNorthRef = useRef(defaultTrueNorth);
  const lastTextRef = useRef(0);

  const [source, setSource] = useState<Source>(null);
  const [trueNorth, setTrueNorth] = useState(defaultTrueNorth);
  const [held, setHeld] = useState(false);
  const [started, setStarted] = useState(false);
  const [heading, setHeading] = useState(0);
  const [note, setNote] = useState("시작을 누르면 방위 센서에 연결합니다.");

  /* 프롭이 없으면 자체 입력으로 대체 (독립 페이지로도 쓸 수 있게) */
  const propYear = birthYear ?? (birthDate ? solarYearForBazi(birthDate) : undefined);
  const [yearIn, setYearIn] = useState<string>(propYear ? String(propYear) : "");
  const [genderIn, setGenderIn] = useState<Gender | null>(gender ?? null);
  const year = propYear ?? (/^\d{4}$/.test(yearIn) ? Number(yearIn) : null);
  const sex = gender ?? genderIn;

  trueNorthRef.current = trueNorth;
  heldRef.current = held;

  const ming: Trigram | null = year && sex ? mingGua(year, sex) : null;
  const [houseGua, setHouseGua] = useState<Trigram | null>(null);
  const rows = useMemo(() => combinedMansions(ming, houseGua), [ming, houseGua]);
  const fit = ming && houseGua ? compatibility(ming, houseGua) : null;

  /* ── 신호 출처 선점: 더 정확한 경로가 나타나면 교체 ── */
  const claim = useCallback((src: Exclude<Source, null>) => {
    const cur = sourceRef.current;
    if (cur === src) return true;
    if (cur && RANK[cur] >= RANK[src]) return false;
    sourceRef.current = src;
    setSource(src);
    return true;
  }, []);

  const push = useCallback((deg: number) => {
    if (heldRef.current) return;
    let d = norm(deg) - smoothRef.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    smoothRef.current = norm(smoothRef.current + d * 0.18);
  }, []);

  /* 판 회전은 DOM에 직접, 텍스트는 10Hz로만 갱신 */
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const h = norm(smoothRef.current + (trueNorthRef.current ? DECLINATION : 0));
      if (dialRef.current) dialRef.current.style.transform = `rotate(${-h}deg)`;
      if (t - lastTextRef.current > 100) {
        lastTextRef.current = t;
        setHeading(h);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ── 센서 연결 ── */
  const start = useCallback(async () => {
    setStarted(true);
    setNote("센서 신호를 기다리는 중…");

    const DOE = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    }) | undefined;

    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        if ((await DOE.requestPermission()) !== "granted") {
          setNote("센서 권한이 거부되었습니다. 설정에서 동작 및 방향 접근을 허용해 주세요.");
          return;
        }
      } catch {
        setNote("권한 요청에 실패했습니다.");
        return;
      }
    }

    const onOrient = (e: DeviceOrientationEvent) => {
      const compass = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (typeof compass === "number") {
        if (claim("absolute-event")) push(compass);
        return;
      }
      if (e.alpha === null) return;
      if (e.absolute === true || e.type === "deviceorientationabsolute") {
        if (claim("absolute-event")) push(360 - e.alpha);
      } else if (claim("relative")) {
        push(360 - e.alpha + relOffsetRef.current);
      }
    };

    window.addEventListener("deviceorientationabsolute", onOrient as EventListener, true);
    window.addEventListener("deviceorientation", onOrient, true);

    /* 가속도계 + 자기계 융합. 안드로이드 크롬에서 가장 안정적인 경로. */
    const AOS = (window as unknown as {
      AbsoluteOrientationSensor?: new (o: object) => {
        quaternion: number[] | null;
        addEventListener(t: string, f: () => void): void;
        start(): void; stop(): void;
      };
    }).AbsoluteOrientationSensor;

    let sensor: { start(): void; stop(): void } | null = null;
    if (AOS) {
      try {
        const s = new AOS({ frequency: 20, referenceFrame: "device" });
        s.addEventListener("reading", () => {
          const q = s.quaternion;
          if (!q) return;
          const [x, y, z, w] = q;
          /* 기기 +Y축(화면 위쪽)을 ENU로 회전 → 동/북 성분으로 방위각 */
          const east = 2 * (x * y - z * w);
          const north = 1 - 2 * (x * x + z * z);
          if (claim("orientation-sensor")) push(norm((Math.atan2(east, north) * 180) / Math.PI));
        });
        s.start();
        sensor = s;
      } catch {
        /* 미지원 또는 권한 거부 — 이벤트 경로로 대체 */
      }
    }

    window.setTimeout(() => {
      const src = sourceRef.current;
      if (src === "absolute-event" || src === "orientation-sensor") {
        setNote("연결됨. 8자 모양으로 몇 번 돌려 보정하고, 휴대폰을 수평으로 두고 측정하세요.");
      } else if (src === "relative") {
        setNote("상대 방위만 잡힙니다. 실제 북쪽으로 화면 위쪽을 향한 뒤 ‘여기가 북’을 눌러 주세요.");
      } else {
        setNote("센서 신호가 없습니다. 브라우저 사이트 설정에서 모션 센서 허용을 확인해 주세요.");
      }
    }, 2500);

    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient as EventListener, true);
      window.removeEventListener("deviceorientation", onOrient, true);
      sensor?.stop();
    };
  }, [claim, push]);

  const setNorthHere = useCallback(() => {
    relOffsetRef.current = norm(relOffsetRef.current - smoothRef.current);
    smoothRef.current = 0;
    setNote("북쪽 기준을 잡았습니다. 값이 틀어지면 다시 눌러 주세요.");
  }, []);

  /* ── 판독값 ── */
  const faceIdx = Math.floor(norm(heading + 7.5) / 15);
  const sitIdx = (faceIdx + 12) % 24;
  const faceTrigram = trigramAt(heading);
  const faceStar: Star | null = ming ? starFor(ming, faceTrigram) : null;
  const faceHouseStar: Star | null = houseGua ? starFor(houseGua, faceTrigram) : null;
  const voided = voidCheck(heading, voidTolerance);
  const placements = useMemo(() => placementAdvice(ming, houseGua), [ming, houseGua]);

  const captureHouse = useCallback(() => {
    setHouseGua(houseGuaFromFacing(smoothRef.current + (trueNorthRef.current ? DECLINATION : 0)));
  }, []);

  /* ── 정적 눈금 ── */
  const rings = useMemo(() => {
    const ticks: React.ReactElement[] = [];
    for (let d = 0; d < 360; d += 2.5) {
      const major = d % 15 === 0, mid = d % 5 === 0;
      const [x1, y1] = pt(d, 186);
      const [x2, y2] = pt(d, major ? 170 : mid ? 177 : 181);
      ticks.push(<line key={`t${d}`} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={major ? "#6F5A28" : "#9C8756"} strokeWidth={major ? 1.3 : 0.6} />);
    }
    const degs: React.ReactElement[] = [];
    for (let d = 0; d < 360; d += 30) {
      const [x, y] = pt(d, 163);
      degs.push(<text key={`d${d}`} x={x} y={y} fill="#7A6836" fontSize={9.5}
        textAnchor="middle" dominantBaseline="middle" fontFamily="ui-monospace, monospace"
        transform={`rotate(${d} ${x} ${y})`}>{d}</text>);
    }
    const mountains: React.ReactElement[] = [];
    MOUNTAINS.forEach(({ hanja, hangul, kind }, i) => {
      const c = i * 15;
      const [bx1, by1] = pt(c - 7.5, 150), [bx2, by2] = pt(c - 7.5, 108);
      const [hx, hy] = pt(c, 133), [kx, ky] = pt(c, 115);
      const fill = kind === "支" ? "#1F1B16" : kind === "干" ? "#B23428" : "#2F5E52";
      mountains.push(
        <g key={`m${i}`}>
          <line x1={bx1} y1={by1} x2={bx2} y2={by2} stroke="#8A7443" strokeWidth={0.7} />
          <text x={hx} y={hy} fill={fill} fontSize={19} textAnchor="middle"
            dominantBaseline="middle" transform={`rotate(${c} ${hx} ${hy})`}>{hanja}</text>
          <text x={kx} y={ky} fill="#6B6154" fontSize={8.5} textAnchor="middle"
            dominantBaseline="middle" transform={`rotate(${c} ${kx} ${ky})`}>{hangul}</text>
        </g>
      );
    });
    return { ticks, degs, mountains };
  }, []);

  /* ── 안쪽 3층: 팔괘 / 택괘 팔성 / 본명괘 팔성 ── */
  const guaRing = useMemo(() => {
    return rows.map((m, i) => {
      const c = m.deg;
      const [bx1, by1] = pt(c - 22.5, 108), [bx2, by2] = pt(c - 22.5, 42);
      const [gx, gy] = pt(c, 97), [hx, hy] = pt(c, 75), [mx, my] = pt(c, 53);
      const both = m.mingStar && m.houseStar;
      return (
        <g key={`g${i}`}>
          {both && (
            <path d={sector(c - 22.5, c + 22.5, 86, 108)}
              fill={SCORE_COLOR[m.score]} fillOpacity={m.score === 1 ? 0.07 : 0.16} />
          )}
          {m.houseStar && (
            <path d={sector(c - 22.5, c + 22.5, 64, 86)} fill={STAR_COLOR[m.houseStar]}
              fillOpacity={STAR_INFO[m.houseStar].good ? 0.17 : 0.1} />
          )}
          {m.mingStar && (
            <path d={sector(c - 22.5, c + 22.5, 42, 64)} fill={STAR_COLOR[m.mingStar]}
              fillOpacity={STAR_INFO[m.mingStar].good ? 0.17 : 0.1} />
          )}
          <line x1={bx1} y1={by1} x2={bx2} y2={by2} stroke="#8A7443" strokeWidth={0.7} />
          <text x={gx} y={gy} fill="#3B352C" fontSize={15} textAnchor="middle"
            dominantBaseline="middle" transform={`rotate(${c} ${gx} ${gy})`}>{m.trigram}</text>
          {m.houseStar && (
            <text x={hx} y={hy} fill={STAR_COLOR[m.houseStar]} fontSize={10} fontWeight={600}
              textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(${c} ${hx} ${hy})`}>{m.houseStar}</text>
          )}
          {m.mingStar && (
            <text x={mx} y={my} fill={STAR_COLOR[m.mingStar]} fontSize={10} fontWeight={600}
              textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(${c} ${mx} ${my})`}>{m.mingStar}</text>
          )}
        </g>
      );
    });
  }, [rows]);

  const btn: React.CSSProperties = {
    font: "inherit", fontSize: 12.5, letterSpacing: "0.1em", color: "#DCCEAE",
    background: "transparent", border: "1px solid #33443A", borderRadius: 2,
    padding: "11px 15px", cursor: "pointer",
  };
  const btnOn: React.CSSProperties = { ...btn, borderColor: "#C9A24B", color: "#C9A24B" };
  const cap: React.CSSProperties = {
    fontFamily: "ui-monospace, monospace", fontSize: 9.5,
    letterSpacing: "0.28em", color: "#6E7C72", marginBottom: 7,
  };

  return (
    <div className={className} style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'Nanum Myeongjo', Batang, serif", color: "#EDE3CB",
    }}>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
        {!started && <button style={btn} onClick={start}>센서 켜기</button>}
        <button style={trueNorth ? btnOn : btn} aria-pressed={trueNorth}
          onClick={() => setTrueNorth((v) => !v)}>진북 보정 −{DECL_LABEL}°</button>
        <button style={held ? btnOn : btn} aria-pressed={held}
          onClick={() => setHeld((v) => !v)}>{held ? "고정 해제" : "측정값 고정"}</button>
        {source === "relative" && <button style={btn} onClick={setNorthHere}>여기가 북</button>}
      </div>
      {/* 판을 탭하면 현재 방위로 고정/해제 — 초기화가 아니라 그 자리에서 멈춰 하단 결과를 본다 */}
      <div
        onClick={() => setHeld((v) => !v)}
        role="button"
        tabIndex={0}
        aria-pressed={held}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHeld((v) => !v); } }}
        title={held ? "탭하면 다시 회전합니다" : "탭하면 현재 방위로 고정됩니다"}
        style={{ position: "relative", width: "min(94vw, 420px)", aspectRatio: "1", cursor: "pointer" }}
      >
        <svg viewBox="0 0 400 400" style={{ width: "100%", display: "block", pointerEvents: "none" }}
          role="img" aria-label={`나경 방위판, 현재 ${heading.toFixed(0)}도${held ? " (고정됨)" : ""}`}>
          <defs>
            <radialGradient id="lp-plate" cx="42%" cy="34%">
              <stop offset="0%" stopColor="#F4ECD9" />
              <stop offset="72%" stopColor="#E1D3B2" />
              <stop offset="100%" stopColor="#C4B189" />
            </radialGradient>
            <linearGradient id="lp-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E0BE6C" />
              <stop offset="48%" stopColor="#A98736" />
              <stop offset="100%" stopColor="#6F581F" />
            </linearGradient>
            <radialGradient id="lp-hub" cx="38%" cy="32%">
              <stop offset="0%" stopColor="#2C3630" />
              <stop offset="100%" stopColor="#0C110E" />
            </radialGradient>
          </defs>

          <circle cx={200} cy={200} r={198} fill="url(#lp-rim)" />
          <circle cx={200} cy={200} r={190} fill="url(#lp-plate)" />

          <g ref={dialRef} style={{ transformOrigin: "200px 200px" }}>
            {guaRing}
            {[186, 158, 86, 64, 42].map((r) => (
              <circle key={r} cx={200} cy={200} r={r} fill="none" stroke="#8A7443" strokeWidth={0.8} />
            ))}
            {[150, 108].map((r) => (
              <circle key={r} cx={200} cy={200} r={r} fill="none" stroke="#8A7443" strokeWidth={1.4} />
            ))}
            {rings.ticks}
            {rings.degs}
            {rings.mountains}
            <path d="M200 166 L204 200 L200 234 L196 200 Z" fill="#1F1B16" />
            <path d="M200 166 L204 200 L196 200 Z" fill="#B23428" />
            <circle cx={200} cy={200} r={6} fill="url(#lp-hub)" stroke="#C9A24B" strokeWidth={1.2} />
          </g>

          {/* 고정 십자선 · 향(向) */}
          <line x1={200} y1={8} x2={200} y2={392} stroke="#B23428" strokeWidth={1} opacity={0.55} />
          <line x1={8} y1={200} x2={392} y2={200} stroke="#B23428" strokeWidth={0.6} opacity={0.3} />
          <path d="M200 2 L210 22 L190 22 Z" fill="#B23428" />
          <text x={222} y={20} fontSize={13} fill="#B23428">向</text>
          <text x={222} y={390} fontSize={13} fill="#5C6C62">坐</text>
        </svg>
      </div>

      <div style={{
        marginTop: 14, fontFamily: "ui-monospace, monospace", fontSize: 26,
        color: "#C9A24B", fontVariantNumeric: "tabular-nums",
      }}>{heading.toFixed(1)}°</div>
      <div style={{ fontSize: 12.5, letterSpacing: "0.2em", color: "#7E8C83", marginTop: 4 }}>
        {faceTrigram}괘 · {trueNorth ? "진북" : "자북"} 기준
      </div>

      {voided.level && (
        <div role="status" style={{
          width: "min(94vw, 420px)", marginTop: 12, padding: "11px 14px", borderRadius: 2,
          border: `1px solid ${voided.level === "대공망" ? "#8C2F26" : "#C08A5A"}`,
          background: voided.level === "대공망" ? "#8C2F2618" : "#C08A5A14",
        }}>
          <div style={{
            fontSize: 14, color: voided.level === "대공망" ? "#C9635A" : "#C08A5A",
          }}>
            {voided.level} · {voided.between[0]}／{voided.between[1]} 경계
            <span style={{ fontSize: 11.5, marginLeft: 8, opacity: 0.85 }}>
              {voided.boundary}°에서 {voided.distance.toFixed(1)}°
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#8A968D", lineHeight: 1.7 }}>
            {VOID_NOTE[voided.level]}
          </div>
        </div>
      )}

      <div style={{
        width: "min(94vw, 420px)", marginTop: 18,
        borderTop: "1px solid #2A3A31", borderBottom: "1px solid #2A3A31",
        display: "grid", gridTemplateColumns: "1fr 1px 1fr",
      }}>
        <div style={{ padding: "15px 8px", textAlign: "center" }}>
          <div style={cap}>향 · FACING</div>
          <div style={{ fontSize: 40, lineHeight: 1, color: "#B23428" }}>{MOUNTAINS[faceIdx].hanja}</div>
          <div style={{ marginTop: 7, fontSize: 12.5, letterSpacing: "0.16em", color: "#9AA79F" }}>
            {MOUNTAINS[faceIdx].hangul}향
          </div>
        </div>
        <div style={{ background: "#2A3A31" }} />
        <div style={{ padding: "15px 8px", textAlign: "center" }}>
          <div style={cap}>좌 · SITTING</div>
          <div style={{ fontSize: 40, lineHeight: 1 }}>{MOUNTAINS[sitIdx].hanja}</div>
          <div style={{ marginTop: 7, fontSize: 12.5, letterSpacing: "0.16em", color: "#9AA79F" }}>
            {MOUNTAINS[sitIdx].hangul}좌
          </div>
        </div>
      </div>

      {/* ── 命 사람 설정 ── */}
      {!ming && (
        <div style={{ width: "min(94vw, 420px)", marginTop: 18, textAlign: "center" }}>
          <div style={cap}>命 · 본명괘</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <input value={yearIn} onChange={(e) => setYearIn(e.target.value)}
              inputMode="numeric" placeholder="출생연도" aria-label="출생연도"
              style={{ ...btn, width: 110, textAlign: "center", cursor: "text" }} />
            <button style={genderIn === "male" ? btnOn : btn}
              onClick={() => setGenderIn("male")}>남</button>
            <button style={genderIn === "female" ? btnOn : btn}
              onClick={() => setGenderIn("female")}>여</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "#5F6D64" }}>
            입춘 이전 출생이면 전년도로 넣으세요
          </div>
        </div>
      )}

      {/* ── 宅 집 설정 ── */}
      <div style={{ width: "min(94vw, 420px)", marginTop: 18, textAlign: "center" }}>
        <div style={cap}>宅 · 택괘</div>
        {houseGua ? (
          <div style={{ fontSize: 14, color: "#DCCEAE", lineHeight: 1.7 }}>
            {HOUSE_INFO[houseGua].name} {houseGua}宅 · {houseOf(houseGua)}택
            <div style={{ fontSize: 11.5, color: "#6E7C72" }}>
              {HOUSE_INFO[houseGua].sitFace} · {HOUSE_INFO[houseGua].plain}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "#5F6D64", lineHeight: 1.7 }}>
            집 중심에 서서 대문이나 주된 창이 바라보는 쪽으로<br />
            화면 위쪽을 맞춘 뒤 아래 버튼을 누르세요
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
          <button style={btn} onClick={captureHouse}>
            {houseGua ? "좌향 다시 잡기" : "지금 향을 집 향으로"}
          </button>
          <select value={houseGua ?? ""} aria-label="택괘 직접 선택"
            onChange={(e) => setHouseGua((e.target.value || null) as Trigram | null)}
            style={{ ...btn, cursor: "pointer" }}>
            <option value="">직접 선택</option>
            {(Object.keys(HOUSE_INFO) as Trigram[]).map((t) => (
              <option key={t} value={t}>
                {HOUSE_INFO[t].name} · {HOUSE_INFO[t].sitFace}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 배합 판정 ── */}
      {fit && (
        <div style={{
          width: "min(94vw, 420px)", marginTop: 16, padding: "13px 15px", borderRadius: 2,
          border: `1px solid ${fit.match ? "#1F7A57" : "#B5734A"}`,
          background: fit.match ? "#1F7A5714" : "#B5734A14",
        }}>
          <div style={{ fontSize: 15, color: fit.match ? "#4E9C82" : "#C08A5A", textAlign: "center" }}>
            {fit.label} · {fit.mingHouse}명 + {fit.houseHouse}택
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#8A968D", lineHeight: 1.75 }}>
            {fit.note}
          </div>
        </div>
      )}

      {/* ── 현재 향하는 방위 판정 ── */}
      {(faceStar || faceHouseStar) && (
        <div style={{ width: "min(94vw, 420px)", marginTop: 16 }}>
          <div style={{ ...cap, textAlign: "center" }}>
            지금 향한 {faceTrigram} 방위
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {(
              [
                { label: "命 본명괘 기준", star: faceStar },
                { label: "宅 택괘 기준", star: faceHouseStar },
              ].filter((r) => r.star !== null) as { label: string; star: Star }[]
            ).map(({ label, star }) => (
                <div key={label} style={{
                  border: `1px solid ${STAR_COLOR[star]}66`, borderRadius: 2,
                  padding: "12px 14px", background: `${STAR_COLOR[star]}12`,
                }}>
                  <div style={{ fontSize: 11, color: "#6E7C72", letterSpacing: "0.16em" }}>{label}</div>
                  <div style={{ fontSize: 19, color: STAR_COLOR[star], marginTop: 5 }}>
                    {star} {STAR_INFO[star].hanja}
                    <span style={{ fontSize: 11.5, marginLeft: 8, opacity: 0.85 }}>
                      {STAR_INFO[star].good ? "길방" : "흉방"}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12.5, color: "#8A968D", lineHeight: 1.7 }}>
                    {STAR_INFO[star].meaning} · 어울리는 용도 {STAR_INFO[star].use}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 여덟 방위 종합 ── */}
      {ming && (
        <div style={{ width: "min(94vw, 420px)", marginTop: 16 }}>
          <div style={{ ...cap, textAlign: "center" }}>여덟 방위 종합</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {rows.slice().sort((a, b) => b.score - a.score ||
              STAR_INFO[a.mingStar!].rank - STAR_INFO[b.mingStar!].rank).map((m) => (
              <div key={m.trigram} style={{
                textAlign: "center", padding: "9px 2px", borderRadius: 2,
                border: `1px solid ${SCORE_COLOR[m.score]}44`,
                background: `${SCORE_COLOR[m.score]}12`,
              }}>
                <div style={{ fontSize: 12.5, color: "#DCCEAE" }}>{m.label}</div>
                <div style={{ fontSize: 10.5, color: STAR_COLOR[m.mingStar!], marginTop: 4 }}>
                  命 {m.mingStar}
                </div>
                {m.houseStar && (
                  <div style={{ fontSize: 10.5, color: STAR_COLOR[m.houseStar] }}>
                    宅 {m.houseStar}
                  </div>
                )}
              </div>
            ))}
          </div>
          {ming && year && sex && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "#5F6D64", textAlign: "center" }}>
              본명괘 {kuaNumber(year, sex)} {ming} · {houseOf(ming)}명
            </div>
          )}
        </div>
      )}

      {/* ── 용도별 배치 ── */}
      {(ming || houseGua) && (
        <div style={{ width: "min(94vw, 420px)", marginTop: 20 }}>
          <div style={{ ...cap, textAlign: "center" }}>용도별 배치</div>
          <div style={{ display: "grid", gap: 1, background: "#2A3A31", border: "1px solid #2A3A31" }}>
            {placements.map((p) => {
              const hit = p.directions?.some((d) => d.trigram === faceTrigram);
              return (
                <div key={p.room} style={{
                  background: hit ? "#1B2620" : "#121A16", padding: "11px 13px",
                  borderLeft: hit ? "2px solid #C9A24B" : "2px solid transparent",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 13.5, color: "#DCCEAE" }}>{p.room}</span>
                    <span style={{ fontSize: 10.5, color: "#5F6D64", whiteSpace: "nowrap" }}>
                      {p.basis === "命" ? "본명괘" : "택괘"} 기준
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12.5, lineHeight: 1.6 }}>
                    {p.directions ? p.directions.map((d, i) => (
                      <span key={d.trigram} style={{ color: STAR_COLOR[d.star] }}>
                        {i > 0 && <span style={{ color: "#3D4B43" }}> · </span>}
                        {d.label}
                        <span style={{ fontSize: 10.5, opacity: 0.8 }}>({d.star})</span>
                      </span>
                    )) : (
                      <span style={{ color: "#5F6D64" }}>
                        {p.basis === "命" ? "본명괘" : "택괘"}를 먼저 정하세요
                      </span>
                    )}
                  </div>
                  {p.note && (
                    <div style={{ marginTop: 5, fontSize: 11.5, color: "#6E7C72", lineHeight: 1.65 }}>
                      {p.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 9, fontSize: 11, color: "#5F6D64", textAlign: "center", lineHeight: 1.7 }}>
            팔택파 기준입니다. 현공비성·구성학 계열은 결론이 다를 수 있습니다.
          </div>
        </div>
      )}

      <p style={{
        maxWidth: "min(94vw, 420px)", marginTop: 16, fontSize: 12,
        lineHeight: 1.75, color: "#CBD4C8", textAlign: "center",
      }}>
        {note}
        {source && <><br /><span style={{ color: "#AAB6AB" }}>신호 출처: {SOURCE_LABEL[source]}</span></>}
      </p>
    </div>
  );
}
