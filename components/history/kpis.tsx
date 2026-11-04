"use client";

import { Pill } from "@/components/ui/card";
import { CARRIERS } from "@/lib/carriers";
import { formatNumber, formatSigned } from "@/lib/format";
import { carrierTotals, completeRows, type Row } from "@/lib/history/derive";
import { type HistoryQuery, regionLabel } from "@/lib/history/query";
import type { TimeseriesResponse } from "@/lib/history/types";
import { bucketLabel } from "./format";

function energyText(mwh: number) {
  return mwh >= 1_000_000 ? { v: formatNumber(mwh / 1_000_000, 1), u: "TWh" } : { v: formatNumber(mwh / 1000, 1), u: "GWh" };
}

/** Energy-weighted renewable share from per-carrier totals (renewable metrics map to these carriers). */
function shareOf(totals: Record<string, number>) {
  const all = Object.values(totals).reduce((a, b) => a + b, 0);
  // "other" mixes renewable and conventional; it is counted as non-renewable here.
  const re = ["hydro", "biomass", "wind", "solar"].reduce((a, k) => a + (totals[k] ?? 0), 0);
  return all > 0 ? (re / all) * 100 : null;
}

export function KpiTiles({ data, rows, query: q }: { data: TimeseriesResponse; rows: Row[]; query: HistoryQuery }) {
  const totals = carrierTotals(data.main, q.regions);
  const prev = data.compare ? carrierTotals(data.compare, q.regions) : null;
  const selected = (t: Record<string, number>) => CARRIERS.filter((c) => q.carriers.includes(c.key)).reduce((a, c) => a + t[c.key]!, 0);
  const gen = selected(totals);
  const genPrev = prev ? selected(prev) : null;
  const e = energyText(gen);

  const share = shareOf(totals);
  const sharePrev = prev ? shareOf(prev) : null;
  // First/last comparisons only use complete buckets (no partial week or month at the edges).
  const full = completeRows(rows);
  const firstRow = full.find((r) => r.reShare != null);
  const lastRow = [...full].reverse().find((r) => r.reShare != null);

  const coal = (r: Row) => (r.carriers.lignite ?? 0) + (r.carriers.hardcoal ?? 0);
  const coalTotal = totals.lignite + totals.hardcoal;
  const coalPrev = prev ? prev.lignite + prev.hardcoal : null;
  const coalChange =
    coalPrev != null && coalPrev > 0
      ? { pct: ((coalTotal - coalPrev) / coalPrev) * 100, note: "ggü. Vorjahreszeitraum" }
      : full.length >= 2 && firstRow && lastRow && firstRow !== lastRow && coal(firstRow) > 0 && q.carriers.includes("lignite")
        ? { pct: ((coal(lastRow) - coal(firstRow)) / coal(firstRow)) * 100, note: `${bucketLabel(lastRow.label, data.res)} ggü. ${bucketLabel(firstRow.label, data.res)}` }
        : null;

  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <Tile title="Nettoerzeugung">
        <Value v={e.v} u={e.u} />
        <p className="mt-2 text-xs text-slate-500">Auswahl, {regionLabel(q.regions)}</p>
        {genPrev ? <Delta pct={((gen - genPrev) / genPrev) * 100} /> : null}
      </Tile>

      <Tile title="EE-Anteil">
        <Value v={formatNumber(share, 1)} u="%" />
        <p className="mt-2 text-xs text-slate-500">an der Erzeugung im Zeitraum</p>
        {sharePrev != null && share != null ? (
          <div className="mt-2">
            <Pill tone="indigo">Vorjahr: {formatNumber(sharePrev, 1)} %</Pill>
          </div>
        ) : full.length >= 2 && firstRow?.reShare != null ? (
          <div className="mt-2">
            <Pill tone="indigo">
              {bucketLabel(firstRow.label, data.res, true)}: {formatNumber(firstRow.reShare, 1)} %
            </Pill>
          </div>
        ) : null}
      </Tile>

      <Tile title="Kohleverstromung">
        {coalChange ? (
          <>
            <Value v={formatSigned(coalChange.pct, 0)} u="%" />
            <p className="mt-2 text-xs text-slate-500">{coalChange.note}</p>
          </>
        ) : (
          <>
            <Value v={energyText(coalTotal).v} u={energyText(coalTotal).u} />
            <p className="mt-2 text-xs text-slate-500">Braun- und Steinkohle im Zeitraum</p>
          </>
        )}
      </Tile>

      {data.kpi.matchedHours != null ? (
        <Tile title="Stunden mit allen Bedingungen">
          <Value v={`≈ ${formatNumber(data.kpi.matchedHours, 0)}`} u="h" />
          <p className="mt-2 text-xs text-slate-500">
            {formatNumber((data.kpi.matchedHours / data.kpi.totalHours) * 100, 1)} % des Zeitraums
          </p>
        </Tile>
      ) : data.kpi.negativePriceHours != null ? (
        <Tile title="Stunden mit Preis < 0">
          <Value v={`≈ ${formatNumber(data.kpi.negativePriceHours, 0)}`} u="h" />
          <p className="mt-2 text-xs text-slate-500">im gewählten Zeitraum</p>
        </Tile>
      ) : (
        <Tile title="CO₂-Intensität Ø">
          <Value v={formatNumber(rows.length ? rows.reduce((a, r) => a + (r.co2 ?? 0), 0) / rows.filter((r) => r.co2 != null).length : null, 0)} u="g/kWh" />
          <p className="mt-2 text-xs text-slate-500">Mittel der Abschnitte</p>
        </Tile>
      )}
    </div>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card min-h-36 p-6">
      <h2 className="text-sm text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Value({ v, u }: { v: string; u: string }) {
  return (
    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
      {v}
      <span className="ml-1 text-base font-medium text-slate-500">{u}</span>
    </p>
  );
}

function Delta({ pct }: { pct: number }) {
  return (
    <div className="mt-2">
      <Pill tone={pct >= 0 ? "indigo" : "amber"}>{formatSigned(pct, 1)} % ggü. Vorjahr</Pill>
    </div>
  );
}
