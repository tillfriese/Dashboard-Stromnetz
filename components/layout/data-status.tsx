"use client";

import { formatBerlin } from "@/lib/format";
import { usePolling } from "@/lib/hooks/use-polling";

type Status = { freshness: Record<string, number | null>; asOf: number | null; coverageFrom: string | null; now: number };

function delayText(ms: number) {
  const min = Math.max(15, Math.round(ms / 60_000 / 5) * 5);
  return min < 90 ? `ca. ${min} min` : `ca. ${Math.round(min / 60)} h`;
}

/**
 * Data freshness line shown below the page title (polled every 60 s).
 * "now": live indicator, delay of generation/load and data timestamp.
 * "history": range of the local data stock.
 */
export function DataStatus({ variant }: { variant: "now" | "history" }) {
  const { data } = usePolling<Status>("/api/status", 60_000);
  // Reserve the line height so the layout does not shift when the status arrives.
  if (!data) return <p className="mt-2 h-5" aria-hidden />;

  // asOf is the start of the latest complete quarter hour; the data is current up to its end.
  const dataEnd = data.asOf != null ? data.asOf + 15 * 60_000 : null;

  if (variant === "history") {
    const [y, m, d] = (data.coverageFrom ?? "").split("-");
    return (
      <p className="mt-2 h-5 text-sm text-slate-500 tabular-nums" aria-live="polite">
        Lokaler Bestand {data.coverageFrom ? `${d}.${m}.${y}` : "–"} – {dataEnd ? formatBerlin(dataEnd, "dd.MM.yyyy") : "–"} · täglich revidiert
      </p>
    );
  }

  const delay = dataEnd != null ? data.now - dataEnd : null;
  const live = delay != null && delay < 4 * 3600_000;
  return (
    <p className="mt-2 flex h-5 flex-wrap items-center gap-x-3 text-sm text-slate-500" aria-live="polite">
      <span className={`inline-flex items-center gap-1.5 font-medium ${live ? "text-slate-900" : "text-slate-400"}`}>
        <span aria-hidden className={`size-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />
        {live ? "Live" : "Keine aktuellen Daten"}
      </span>
      <span>
        Erzeugung &amp; Last {delay != null ? `${delayText(delay)} verzögert` : "mit Verzug"} · Frequenz sekündlich
      </span>
      {dataEnd ? <span className="tabular-nums">Datenstand {formatBerlin(dataEnd, "HH:mm")} Uhr</span> : null}
    </p>
  );
}
