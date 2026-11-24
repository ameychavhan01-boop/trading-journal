import { useEffect, useRef, useState, type ReactNode } from 'react';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(200, e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface Series {
  name: string;
  color: string; // a CSS var, e.g. 'var(--accent)'
  points: number[]; // cumulative value after each trade
}

/**
 * Line chart for equity curves. One series = area fill + line.
 * Several series (Compare) = lines only with legend.
 */
export function LineChart({
  series,
  height = 220,
  baseline = 0,
  format,
  xLabel = (i: number) => `Trade ${i}`,
}: {
  series: Series[];
  height?: number;
  baseline?: number;
  format: (v: number) => string;
  xLabel?: (i: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 8;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const all = series.flatMap((s) => [baseline, ...s.points]);
  const n = Math.max(...series.map((s) => s.points.length), 1);
  if (!series.some((s) => s.points.length)) {
    return (
      <div className="empty" style={{ height }}>
        No closed trades yet.
      </div>
    );
  }
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const W = width;
  const H = height;
  const x = (i: number) => padL + (i / Math.max(n, 1)) * (W - padL - padR); // i = 0 is the start (before trade 1)
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + f * (H - padT - padB));
  const single = series.length === 1;

  const onMove = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const rel = (clientX - r.left - padL) / (r.width - padL - padR);
    const i = Math.round(rel * n);
    setHover(Math.max(1, Math.min(n, i)));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {!single && (
        <div className="row wrap small" style={{ gap: 16, marginBottom: 8 }}>
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 6 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color }} />
              <span className="muted">{s.name}</span>
            </span>
          ))}
        </div>
      )}
      <svg
        width={W}
        height={H}
        style={{ display: 'block', touchAction: 'pan-y' }}
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
        onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
        onTouchEnd={() => setTimeout(() => setHover(null), 1500)}
      >
        {grid.map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={g} y2={g} stroke="var(--grid)" strokeWidth={1} />
        ))}
        <line x1={padL} x2={W - padR} y1={y(baseline)} y2={y(baseline)} stroke="var(--text3)" strokeDasharray="4 4" strokeWidth={1} />
        {series.map((s) => {
          const pts = [baseline, ...s.points].map((v, i) => [x(i), y(v)] as const);
          const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              {single && (
                <path
                  d={`${d} L${pts[pts.length - 1][0]},${H - padB} L${pts[0][0]},${H - padB} Z`}
                  fill={s.color}
                  opacity={0.1}
                />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--text3)" strokeWidth={1} />
            {series.map((s) =>
              s.points[hover - 1] != null ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.points[hover - 1])} r={5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}
        <text x={padL} y={H - 6} fontSize={11} fill="var(--text3)">
          {xLabel(1)}
        </text>
        <text x={W - padR} y={H - 6} fontSize={11} fill="var(--text3)" textAnchor="end">
          {xLabel(n)}
        </text>
      </svg>
      {hover != null && (
        <Tip x={x(hover)} width={W}>
          <div className="bold">{xLabel(hover)}</div>
          {series.map((s) =>
            s.points[hover - 1] != null ? (
              <div key={s.name} className="row" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {!single && <span className="muted">{s.name}</span>}
                <span className="bold">{format(s.points[hover - 1])}</span>
              </div>
            ) : null,
          )}
        </Tip>
      )}
    </div>
  );
}

function Tip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x - 70, 0), width - 160);
  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        left,
        minWidth: 140,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: 'var(--shadow)',
        fontSize: 12.5,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {children}
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  sub?: string; // tooltip extra line
  count?: number; // 0 = no trades, shows "–"
  short?: string; // label used when the chart is narrow
}

/** Vertical bars around a zero line: green above, red below, value label above each. */
export function BarChart({ data, height = 150, format }: { data: BarDatum[]; height?: number; format: (v: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 0.0001);
  const top = 22;
  const bottom = 22;
  const hasNeg = data.some((d) => d.value < 0);
  const hasPos = data.some((d) => d.value > 0) || !hasNeg;
  const plotH = height - top - bottom;
  const posH = hasNeg && hasPos ? plotH * 0.7 : plotH;
  const negH = plotH - (hasPos ? posH : 0);
  const zero = top + (hasPos ? posH : 0);
  const scale = Math.max(hasPos ? posH : 0, hasNeg ? negH : 0) / maxAbs;
  const slot = width / data.length;
  const bw = Math.min(36, slot * 0.5);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const cx = slot * i + slot / 2;
          const h = Math.max(Math.abs(d.value) * scale, d.value === 0 ? 0 : 2);
          const pos = d.value >= 0;
          const yTop = pos ? zero - h : zero;
          const color = d.value > 0 ? 'var(--profit)' : 'var(--loss)';
          const r = Math.min(4, h / 2);
          // rounded only on the data end
          const path = pos
            ? `M${cx - bw / 2},${zero} V${yTop + r} Q${cx - bw / 2},${yTop} ${cx - bw / 2 + r},${yTop} H${cx + bw / 2 - r} Q${cx + bw / 2},${yTop} ${cx + bw / 2},${yTop + r} V${zero} Z`
            : `M${cx - bw / 2},${zero} V${zero + h - r} Q${cx - bw / 2},${zero + h} ${cx - bw / 2 + r},${zero + h} H${cx + bw / 2 - r} Q${cx + bw / 2},${zero + h} ${cx + bw / 2},${zero + h - r} V${zero} Z`;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
              style={{ cursor: 'default' }}
            >
              <rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              <line x1={slot * i + 4} x2={slot * (i + 1) - 4} y1={zero} y2={zero} stroke="var(--border)" />
              {h > 0 && <path d={path} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
              <text x={cx} y={14} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={d.count === 0 || d.value === 0 ? 'var(--text3)' : color}>
                {d.count === 0 ? '–' : format(d.value)}
              </text>
              <text x={cx} y={height - 5} textAnchor="middle" fontSize={11} fill="var(--text2)">
                {slot < 62 && d.short ? d.short : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover].sub && (
        <Tip x={slot * hover + slot / 2} width={width}>
          <div className="bold">{data[hover].label}</div>
          <div>{format(data[hover].value)}</div>
          <div className="muted">{data[hover].sub}</div>
        </Tip>
      )}
    </div>
  );
}
