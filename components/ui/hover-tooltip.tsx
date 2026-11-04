import type { ReactNode } from "react";

/**
 * Small tooltip box for custom SVG charts. Position is given in percent of the chart container
 * (which must be `relative`); near the edges the box is aligned so it never overflows.
 */
export function HoverTooltip({ xPct, yPct = 0, children }: { xPct: number; yPct?: number; children: ReactNode }) {
  const align = xPct < 18 ? "0%" : xPct > 82 ? "-100%" : "-50%";
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md tabular-nums"
      style={{ left: `${xPct}%`, top: `${yPct}%`, transform: `translate(${align}, calc(-100% - 6px))` }}
    >
      {children}
    </div>
  );
}

/** Converts a mouse event over an SVG into viewBox coordinates. */
export function svgPoint(e: React.MouseEvent<SVGSVGElement>, viewBox: { x: number; y: number; w: number; h: number }) {
  const r = e.currentTarget.getBoundingClientRect();
  return {
    x: viewBox.x + ((e.clientX - r.left) / r.width) * viewBox.w,
    y: viewBox.y + ((e.clientY - r.top) / r.height) * viewBox.h,
  };
}
