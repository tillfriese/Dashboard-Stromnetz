"use client";

import { CARRIERS } from "@/lib/carriers";
import { formatGW, formatNumber, formatSigned } from "@/lib/format";
import type { ZoneKey, ZoneNow } from "@/lib/queries/now";

const label = (k: string) => CARRIERS.find((c) => c.key === k)?.label ?? k;
const color = (k: string) => CARRIERS.find((c) => c.key === k)?.color ?? "#8a8f98";

/** Clickable control-area tiles, synchronised with the map selection. */
export function ZoneTiles({
  zones,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  zones: ZoneNow[];
  selected: ZoneKey | null;
  hovered: ZoneKey | null;
  onSelect: (z: ZoneKey) => void;
  onHover: (z: ZoneKey | null) => void;
}) {
  return (
    <ul className="space-y-3" aria-label="Regelzonen">
      {zones.map((z) => {
        const active = selected === z.key;
        const surplus = (z.balanceMW ?? 0) >= 0;
        return (
          <li key={z.key}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(z.key)}
              onMouseEnter={() => onHover(z.key)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(z.key)}
              onBlur={() => onHover(null)}
              className={`w-full rounded-2xl border bg-surface p-4 text-left transition-all duration-200 ${
                active
                  ? "border-indigo-300 ring-2 ring-indigo-100"
                  : hovered === z.key
                    ? "border-slate-300 shadow-sm"
                    : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold tracking-tight">{z.key}</span>
                {z.balanceMW != null ? (
                  <span className={`text-sm font-semibold tabular-nums ${surplus ? "text-indigo-600" : "text-amber-700"}`}>
                    {formatSigned(z.balanceMW / 1000, 1)} GW
                    <span className="sr-only">{surplus ? " Überschuss" : " Defizit"}</span>
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{z.states.join(" · ")}</p>
              <p className="mt-2.5 text-sm text-slate-600 tabular-nums">
                Erzeugung <span className="font-medium text-slate-900">{formatGW(z.generationMW)} GW</span>
                <span className="ml-4">
                  Last <span className="font-medium text-slate-900">{formatGW(z.loadMW)} GW</span>
                </span>
              </p>
              <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                {z.mix
                  .filter((m) => m.mw > 0)
                  .map((m) => (
                    <span key={m.carrier} style={{ width: `${(m.mw / Math.max(1, z.generationMW)) * 100}%`, background: color(m.carrier) }} />
                  ))}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {z.top3.map((t) => `${label(t.carrier)} ${formatNumber(t.share, 0)} %`).join(" · ")}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
