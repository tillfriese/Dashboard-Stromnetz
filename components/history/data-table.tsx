"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { CARRIERS } from "@/lib/carriers";
import { formatNumber } from "@/lib/format";
import { energyUnit, type Row } from "@/lib/history/derive";
import { type HistoryQuery, regionLabel, type Resolution } from "@/lib/history/query";
import { bucketLabel } from "./format";

const LIMIT = 400;

/** Table of the current selection (selected control areas summed), newest first. */
export function DataTable({ rows, res, query: q, publicMode }: { rows: Row[]; res: Resolution; query: HistoryQuery; publicMode: boolean }) {
  const carriers = CARRIERS.filter((c) => q.carriers.includes(c.key));
  const { unit, factor } = energyUnit(res, Math.max(0, ...rows.map((r) => r.total ?? 0)));
  const shown = [...rows].reverse().slice(0, LIMIT);
  const extra = [
    q.metrics.includes("load") ? { key: "load", label: "Netzlast [GW]", v: (r: Row) => formatNumber(r.loadMW == null ? null : r.loadMW / 1000, 1) } : null,
    q.metrics.includes("price") && !publicMode ? { key: "price", label: "Preis [€/MWh]", v: (r: Row) => formatNumber(r.price, 2) } : null,
    q.conditions.length ? { key: "matched", label: "Stunden mit Bedingungen", v: (r: Row) => formatNumber(r.matchedHours, 1) } : null,
  ].filter((x): x is { key: string; label: string; v: (r: Row) => string } => x != null);

  return (
    <Card labelledBy="table-title">
      <CardTitle id="table-title" right={<span className="text-sm text-slate-500">{unit} je Abschnitt · {regionLabel(q.regions)}</span>}>
        Tabellenansicht
      </CardTitle>
      <div className="mt-4 max-h-[520px] overflow-auto">
        <table className="w-full text-right text-sm whitespace-nowrap tabular-nums">
          <thead className="sticky top-0 bg-white text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              <th scope="col" className="py-2.5 pr-4 text-left font-medium">
                Zeitraum
              </th>
              {carriers.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-2.5 font-medium">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 font-medium">
                Summe
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                EE-Anteil
              </th>
              {extra.map((x) => (
                <th key={x.key} scope="col" className="px-3 py-2.5 font-medium">
                  {x.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.label} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="py-2.5 pr-4 text-left font-medium whitespace-nowrap">
                  {bucketLabel(r.label, res)}
                </th>
                {carriers.map((c) => (
                  <td key={c.key} className="px-3 py-2.5">
                    {formatNumber(r.carriers[c.key] == null ? null : r.carriers[c.key]! * factor, unit === "TWh" ? 1 : 1)}
                  </td>
                ))}
                <td className="px-3 py-2.5 font-medium">{formatNumber(r.total == null ? null : r.total * factor, 1)}</td>
                <td className="px-3 py-2.5 font-medium">{r.reShare == null ? "–" : `${formatNumber(r.reShare, 1)} %`}</td>
                {extra.map((x) => (
                  <td key={x.key} className="px-3 py-2.5">
                    {x.v(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Keine Daten für diese Auswahl.</p> : null}
      </div>
      {rows.length > LIMIT ? (
        <p className="mt-3 text-xs text-slate-500">
          Die neuesten {LIMIT} von {rows.length} Zeilen werden angezeigt. Alle Werte enthält der CSV-Export.
        </p>
      ) : null}
    </Card>
  );
}
