"use client";

import { TableDetails } from "./table-details";

/**
 * Generic heatmap (rows x columns) as SVG. Used for "hour x calendar week" on the history page
 * and "weekday x hour" in the visitor statistics.
 */
export function Heatmap({
  values,
  rowLabels,
  colLabels,
  color,
  format,
  ariaLabel,
  rowTickEvery = 1,
  colTicks,
}: {
  values: (number | null)[][];
  rowLabels: string[];
  colLabels: string[];
  color: (v: number) => string;
  format: (v: number | null) => string;
  ariaLabel: string;
  rowTickEvery?: number;
  /** Column index -> label for the x axis (others unlabelled). */
  colTicks?: Map<number, string>;
}) {
  const cols = colLabels.length;
  const rows = rowLabels.length;
  const cw = 10;
  const ch = 9;
  const left = 34;
  const bottom = 18;
  const width = left + cols * cw;
  const height = rows * ch + bottom;
  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {values.map((row, r) =>
          row.map((v, c) => (
            <rect key={`${r}-${c}`} x={left + c * cw + 0.5} y={r * ch + 0.5} width={cw - 1} height={ch - 1} rx={1.2} fill={v == null ? "#f1f5f9" : color(v)}>
              <title>{`${rowLabels[r]}, ${colLabels[c]}: ${format(v)}`}</title>
            </rect>
          )),
        )}
        {rowLabels.map((l, r) =>
          r % rowTickEvery === 0 ? (
            <text key={l} x={left - 5} y={r * ch + ch * 0.75} textAnchor="end" className="fill-slate-500 text-[7px]">
              {l}
            </text>
          ) : null,
        )}
        {[...(colTicks ?? new Map(colLabels.map((l, i) => [i, l])))].map(([i, l]) => (
          <text key={i} x={left + i * cw + cw / 2} y={rows * ch + 12} textAnchor="middle" className="fill-slate-500 text-[7px]">
            {l}
          </text>
        ))}
      </svg>
      <TableDetails
        head={["", ...colLabels]}
        rows={values.map((row, r) => [rowLabels[r], ...row.map((v) => format(v))])}
      />
    </>
  );
}
