"use client";

import { scaleLinear } from "d3-scale";
import geo from "@/lib/map/germany-zones.json";
import { formatGW, formatSigned } from "@/lib/format";
import type { ZoneKey, ZoneNow } from "@/lib/queries/now";

type Props = {
  zones: ZoneNow[];
  flows: { country: string; mw: number }[];
  selected: ZoneKey | null;
  hovered: ZoneKey | null;
  onSelect: (z: ZoneKey) => void;
  onHover: (z: ZoneKey | null) => void;
};

const SURPLUS = ["#e0e7ff", "#818cf8"]; // indigo-100 .. indigo-400
const DEFICIT = ["#fef3c7", "#fbbf24"]; // amber-100 .. amber-400
const ARROW_LEN = 58;

/** Simplified map of the four control areas with balance colouring and cross-border flows. */
export function ZoneMap({ zones, flows, selected, hovered, onSelect, onHover }: Props) {
  const maxAbs = Math.max(3000, ...zones.map((z) => Math.abs(z.balanceMW ?? 0)));
  const surplus = scaleLinear<string>().domain([0, maxAbs]).range(SURPLUS).clamp(true);
  const deficit = scaleLinear<string>().domain([0, maxAbs]).range(DEFICIT).clamp(true);
  const fill = (z?: ZoneNow) =>
    z?.balanceMW == null ? "#e2e8f0" /* stays light: labels on zones are always dark */ : z.balanceMW >= 0 ? surplus(z.balanceMW) : deficit(-z.balanceMW);
  const maxFlow = Math.max(500, ...flows.map((f) => Math.abs(f.mw)));
  const anchors = geo.anchors as unknown as Record<string, { at: [number, number]; dir: [number, number] }>;

  const description = zones
    .map((z) => `${z.key}: Saldo ${z.balanceMW == null ? "unbekannt" : `${formatSigned(z.balanceMW / 1000, 1)} GW`}`)
    .join(", ");

  return (
    <svg viewBox="-175 -100 900 975" className="h-auto w-full" role="img" aria-label={`Karte der vier Übertragungsnetzgebiete. ${description}.`}>
      <defs>
        {(["import", "export"] as const).map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={k === "import" ? "#d97706" : "#4f46e5"} />
          </marker>
        ))}
      </defs>

      {(Object.entries(geo.zones) as unknown as [ZoneKey, { path: string; labels: number[][] }][]).map(([key, z]) => {
        const data = zones.find((d) => d.key === key);
        const active = selected === key;
        const hover = hovered === key;
        return (
          <path
            key={key}
            d={z.path}
            fill={fill(data)}
            fillRule="evenodd"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className="cursor-pointer transition-[filter] duration-150"
            style={{ filter: hover || active ? "brightness(0.95)" : undefined }}
            onMouseEnter={() => onHover(key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(key)}
            aria-hidden
          />
        );
      })}

      {/* Outlines for hover and selection are drawn above all zones, otherwise neighbouring
          zones painted later would cover half of the stroke along shared borders. */}
      {(Object.entries(geo.zones) as unknown as [ZoneKey, { path: string }][])
        .filter(([key]) => key === hovered && key !== selected)
        .map(([key, z]) => (
          <path key={`hover-${key}`} d={z.path} fill="none" stroke="var(--color-slate-500)" strokeWidth={2} strokeLinejoin="round" pointerEvents="none" data-outline="hover" />
        ))}
      {(Object.entries(geo.zones) as unknown as [ZoneKey, { path: string }][])
        .filter(([key]) => key === selected)
        .map(([key, z]) => (
          <path key={`sel-${key}`} d={z.path} fill="none" stroke="#312e81" strokeWidth={3.5} strokeLinejoin="round" pointerEvents="none" data-outline="selected" />
        ))}

      {(Object.entries(geo.zones) as unknown as [ZoneKey, { labels: number[][] }][]).map(([key, z]) => {
        const data = zones.find((d) => d.key === key);
        return z.labels.map(([x, y], i) => (
          <g key={`${key}-${i}`} pointerEvents="none" textAnchor="middle">
            {/* Zone fills stay light in both themes, so labels are always dark with a light halo. */}
            <text x={x} y={y} fill="#0f172a" className="text-[17px] font-semibold" paintOrder="stroke" stroke="#ffffff" strokeWidth={3} strokeOpacity={0.6}>
              {key}
            </text>
            {i === 0 && data?.balanceMW != null ? (
              <text x={x} y={(y ?? 0) + 19} fill="#334155" className="text-[14px] tabular-nums" paintOrder="stroke" stroke="#ffffff" strokeWidth={3} strokeOpacity={0.6}>
                {formatSigned(data.balanceMW / 1000, 1)} GW
              </text>
            ) : null}
          </g>
        ));
      })}

      {flows.map((f) => {
        const a = anchors[f.country];
        if (!a) return null;
        const [ax, ay] = a.at;
        const [ux, uy] = a.dir;
        const ox = ax + ux * ARROW_LEN;
        const oy = ay + uy * ARROW_LEN;
        const isImport = f.mw > 0;
        const width = 1.5 + (Math.abs(f.mw) / maxFlow) * 2.5;
        const color = isImport ? "#d97706" : "#4f46e5";
        // Import: from outside towards the border. Export: from the border outwards.
        const [x1, y1, x2, y2] = isImport ? [ox, oy, ax + ux * 4, ay + uy * 4] : [ax + ux * 4, ay + uy * 4, ox, oy];
        const lx = ox + ux * 16;
        const ly = oy + uy * 16 + 5;
        return (
          <g key={f.country} pointerEvents="none">
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} markerEnd={`url(#arrow-${isImport ? "import" : "export"})`} />
            <text x={lx} y={ly} textAnchor={ux < -0.3 ? "end" : ux > 0.3 ? "start" : "middle"} className="fill-slate-700 text-[14px] tabular-nums">
              <tspan className="font-semibold fill-slate-900">{f.country}</tspan> {formatGW(Math.abs(f.mw))} GW
            </text>
          </g>
        );
      })}
    </svg>
  );
}
