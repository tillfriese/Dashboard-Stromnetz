"use client";

import { useEffect, useState } from "react";
import { formatBerlin, formatNumber } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/sources/labels";

type Run = {
  id: number;
  source: string;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "error";
  rows: number;
  error: string | null;
};

const selectClass = "rounded-xl border border-slate-200 bg-surface px-3 py-1.5 text-sm";

export function RunsLog() {
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const qs = new URLSearchParams({ ...(source && { source }), ...(status && { status }) });
      const res = await fetch(`/api/admin/ingest-runs?${qs}`, { cache: "no-store" });
      if (res.ok && !cancelled) setRuns((await res.json()).runs);
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [source, status]);

  return (
    <section className="card p-6" aria-labelledby="runs-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="runs-title" className="font-semibold tracking-tight">
            Protokoll
          </h2>
          <p className="mt-1 text-sm text-slate-500">Die letzten 100 Abrufe.</p>
        </div>
        <div className="flex gap-3">
          <label className="text-sm text-slate-600">
            <span className="sr-only">Quelle</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>
              <option value="">Alle Quellen</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <span className="sr-only">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
              <option value="">Alle Status</option>
              <option value="success">Erfolgreich</option>
              <option value="error">Fehler</option>
              <option value="running">Läuft</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Protokoll (scrollbar)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">Start</th>
              <th className="py-2 pr-4 font-medium">Quelle</th>
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 text-right font-medium">Zeilen</th>
              <th className="py-2 pr-4 text-right font-medium">Dauer</th>
              <th className="py-2 font-medium">Fehler</th>
            </tr>
          </thead>
          <tbody>
            {runs?.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="py-2 pr-4 tabular-nums whitespace-nowrap">{formatBerlin(Date.parse(r.startedAt), "dd.MM. HH:mm:ss")}</td>
                <td className="py-2 pr-4">{SOURCE_LABELS[r.source] ?? r.source}</td>
                <td className="py-2 pr-4 text-slate-600">{r.job}</td>
                <td className="py-2 pr-4">
                  <span className={r.status === "error" ? "text-red-700" : r.status === "running" ? "text-indigo-700" : "text-emerald-700"}>
                    {r.status === "error" ? "Fehler" : r.status === "running" ? "Läuft" : "OK"}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(r.rows, 0)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {r.finishedAt ? `${formatNumber((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000, 1)} s` : "–"}
                </td>
                <td className="max-w-80 py-2 text-xs text-red-700">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs && runs.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Keine Einträge.</p> : null}
      </div>
    </section>
  );
}
