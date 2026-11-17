"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatINRExact, formatINRShort } from "@/lib/format";

export type ComboDatum = {
  key: string;
  label: string;
  tooltip: string;
  amount: number;
  count: number;
};

const H = 300;
const PAD = { top: 16, right: 52, bottom: 58, left: 64 };

/** 0 → (≥ max) in ~5 round steps (1, 2, 2.5, 5 × 10ⁿ). The last tick always covers max. */
function niceTicks(max: number, steps = 5, integer = false): number[] {
  if (max <= 0) return integer ? [0, 1, 2, 3, 4] : [0, 1000, 2000, 3000, 4000];
  const raw = max / steps;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step =
    [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  if (integer) step = Math.max(1, Math.ceil(step));
  const out = [0];
  while (out[out.length - 1]! < max)
    out.push(Number((out[out.length - 1]! + step).toFixed(6)));
  return out;
}

/** Monotone cubic (Fritsch–Carlson): smooth like Cashfree's line, but never overshoots the data. */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${pts[0]![0]},${pts[0]![1]}`;
  const dx = (i: number) => pts[i + 1]![0] - pts[i]![0];
  const slope = (i: number) => (pts[i + 1]![1] - pts[i]![1]) / dx(i);
  const m: number[] = new Array(n).fill(0);
  m[0] = slope(0);
  m[n - 1] = slope(n - 2);
  for (let i = 1; i < n - 1; i++) {
    const a = slope(i - 1);
    const b = slope(i);
    m[i] =
      a * b <= 0
        ? 0
        : (3 * (dx(i - 1) + dx(i))) /
          ((2 * dx(i) + dx(i - 1)) / a + (dx(i) + 2 * dx(i - 1)) / b);
  }
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx(i) / 3;
    d += ` C${pts[i]![0] + h},${pts[i]![1] + m[i]! * h} ${pts[i + 1]![0] - h},${pts[i + 1]![1] - m[i + 1]! * h} ${pts[i + 1]![0]},${pts[i + 1]![1]}`;
  }
  return d;
}

/**
 * Bars = amount (left axis), line = count (right axis), with gridlines,
 * labelled axes, a legend and a hover tooltip. Pure SVG, sized to its container.
 */
export function ComboChart({
  data,
  amountLabel = "Amount",
  countLabel = "Count",
  barColor = "#b9b2f3",
  barHover = "#8f84ec",
  lineColor = "#5b3cc4",
}: {
  data: ComboDatum[];
  amountLabel?: string;
  countLabel?: string;
  barColor?: string;
  barHover?: string;
  lineColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([e]) => e && setWidth(Math.max(320, Math.floor(e.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const aTicks = niceTicks(Math.max(...data.map((d) => d.amount), 0));
    const cTicks = niceTicks(Math.max(...data.map((d) => d.count), 0), 5, true);
    const aMax = aTicks[aTicks.length - 1]!;
    const cMax = cTicks[cTicks.length - 1]!;
    const band = innerW / Math.max(1, data.length);
    const barW = Math.max(2, Math.min(64, band * 0.6));
    const x = (i: number) => PAD.left + band * i + band / 2;
    const yA = (v: number) => PAD.top + innerH - (v / aMax) * innerH;
    const yC = (v: number) => PAD.top + innerH - (v / cMax) * innerH;
    // Show at most ~14 x labels; rotate them like Cashfree when there are several.
    const every = Math.max(1, Math.ceil(data.length / 14));
    return {
      innerW,
      innerH,
      aTicks,
      cTicks,
      aMax,
      cMax,
      band,
      barW,
      x,
      yA,
      yC,
      every,
      floor: PAD.top + innerH,
    };
  }, [data, width]);

  const line = smoothPath(
    data.map((d, i) => [g.x(i), g.yC(d.count)] as [number, number]),
  );
  const h = hover !== null ? data[hover] : null;
  const rotate = data.length > 7;

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${amountLabel} and ${countLabel} chart`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines + left axis (amount) */}
        {g.aTicks.map((t) => (
          <g key={`a${t}`}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={g.yA(t)}
              y2={g.yA(t)}
              stroke="#e2d6c0"
              strokeDasharray={t === 0 ? undefined : "3 4"}
            />
            <text
              x={PAD.left - 10}
              y={g.yA(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted text-[11px] tabular-nums"
            >
              {formatINRShort(t)}
            </text>
          </g>
        ))}
        {/* Right axis (count) */}
        {g.cTicks.map((t) => (
          <text
            key={`c${t}`}
            x={width - PAD.right + 10}
            y={g.yC(t)}
            dominantBaseline="middle"
            className="fill-muted text-[11px] tabular-nums"
          >
            {t}
          </text>
        ))}
        <text
          transform={`translate(14 ${PAD.top + g.innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-muted text-[11px] font-semibold"
        >
          {amountLabel}
        </text>
        <text
          transform={`translate(${width - 10} ${PAD.top + g.innerH / 2}) rotate(90)`}
          textAnchor="middle"
          className="fill-muted text-[11px] font-semibold"
        >
          {countLabel}
        </text>

        {/* Hover bands (whole column is hoverable) */}
        {data.map((d, i) => (
          <rect
            key={`h${d.key}`}
            x={PAD.left + g.band * i}
            y={PAD.top}
            width={g.band}
            height={g.innerH}
            fill={hover === i ? "rgba(33,40,66,0.04)" : "transparent"}
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const y = g.yA(d.amount);
          const hgt = g.floor - y;
          return d.amount > 0 ? (
            <path
              key={`b${d.key}`}
              d={`M${g.x(i) - g.barW / 2},${g.floor} V${y + Math.min(4, hgt)} q0,-4 4,-4 H${g.x(i) + g.barW / 2 - 4} q4,0 4,4 V${g.floor} Z`}
              fill={hover === i ? barHover : barColor}
              className="pointer-events-none transition-colors"
            />
          ) : null;
        })}

        {/* Count line + points */}
        <path
          d={line}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="pointer-events-none"
        />
        {data.map((d, i) => (
          <circle
            key={`p${d.key}`}
            cx={g.x(i)}
            cy={g.yC(d.count)}
            r={hover === i ? 5 : data.length <= 31 ? 3 : 0}
            fill="#fff"
            stroke={lineColor}
            strokeWidth={2}
            className="pointer-events-none"
          />
        ))}

        {/* X labels */}
        {data.map((d, i) =>
          i % g.every === 0 ? (
            <text
              key={`x${d.key}`}
              x={g.x(i)}
              y={g.floor + 16}
              textAnchor={rotate ? "end" : "middle"}
              transform={
                rotate ? `rotate(-35 ${g.x(i)} ${g.floor + 16})` : undefined
              }
              className="fill-muted text-[11px]"
            >
              {d.label}
            </text>
          ) : null,
        )}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center gap-4 pl-16 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-3 rounded-[3px]"
            style={{ background: barColor }}
          />{" "}
          Total amount
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[3px] w-4 rounded-full"
            style={{ background: lineColor }}
          />{" "}
          Total count
        </span>
      </div>

      {/* Tooltip */}
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[160px] -translate-x-1/2 rounded-xl bg-plum px-3 py-2 text-xs text-milk shadow-lift"
          style={{
            left: Math.min(Math.max(g.x(hover), 90), width - 90),
            top: Math.max(4, Math.min(g.yA(h.amount), g.yC(h.count)) - 74),
          }}
        >
          <p className="font-semibold">{h.tooltip}</p>
          <p className="mt-1 flex justify-between gap-4">
            <span className="text-blush/90">{amountLabel}</span>
            <span className="font-semibold tabular-nums">
              {formatINRExact(h.amount)}
            </span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-blush/90">{countLabel}</span>
            <span className="font-semibold tabular-nums">{h.count}</span>
          </p>
        </div>
      )}
    </div>
  );
}
