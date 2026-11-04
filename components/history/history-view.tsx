"use client";

import { useMemo, useState } from "react";
import { DataStatus } from "@/components/layout/data-status";
import { Alert } from "@/components/ui/alert";
import { SetupNotice } from "@/components/ui/setup-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/hooks/use-json";
import { carrierTotals, deriveRows } from "@/lib/history/derive";
import { effectiveResolution, type HistoryQuery } from "@/lib/history/query";
import { track } from "@/lib/analytics/client";
import type { TimeseriesResponse } from "@/lib/history/types";
import { FilterChips } from "./chips";
import { DataTable } from "./data-table";
import { FilterSidebar } from "./filter-sidebar";
import { HeatmapCard } from "./heatmap-card";
import { KpiTiles } from "./kpis";
import { MainChart } from "./main-chart";
import { MetricCharts } from "./metric-charts";
import { dataSearch, useHistoryQuery } from "./use-history-query";

type View = { id: string; name: string; params: string };

export function HistoryView({
  initialData,
  initialSearch,
  initialViews,
  signedIn,
  hasData,
}: {
  initialData: TimeseriesResponse | null;
  initialSearch: string;
  initialViews: View[];
  signedIn: boolean;
  hasData: boolean;
}) {
  const { query: q, update: rawUpdate, replaceAll } = useHistoryQuery();
  // Filter changes are counted (anonymously) in the visitor statistics.
  const update = (patch: Partial<HistoryQuery>) => {
    trackHistoryChange(q, patch);
    rawUpdate(patch);
  };
  const onTrack = (name: string, props?: Record<string, unknown>) => track(name, props ? Object.values(props).join(",") : undefined);
  const search = dataSearch(q);
  const url = `/api/timeseries?${search}`;
  const { data, error, loading } = useJson<TimeseriesResponse>(url, initialData, `/api/timeseries?${initialSearch}`);
  const [views, setViews] = useState(initialViews);
  // On small screens the long filter column is collapsed behind a button.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = q.conditions.length + (q.carriers.length < 9 ? 1 : 0) + (q.regions.length < 4 ? 1 : 0) + (q.metrics.length > 0 ? 1 : 0);
  const { res, coarsened } = effectiveResolution(q);

  // The selected control areas are summed into one selection.
  const rows = useMemo(() => (data ? deriveRows(data.main, q.regions, q, data.res) : []), [data, q]);
  const prevRows = useMemo(() => (data?.compare ? deriveRows(data.compare, q.regions, q, data.res) : null), [data, q]);
  const totals = useMemo(() => (data ? carrierTotals(data.main, q.regions) : null), [data, q.regions]);
  const publicMode = data?.publicMode ?? false;

  return (
    <main className="mx-auto grid max-w-[1440px] gap-6 px-4 py-8 sm:px-8 sm:py-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
      <button
        type="button"
        aria-expanded={filtersOpen}
        aria-controls="history-filters"
        onClick={() => setFiltersOpen((o) => !o)}
        className="card flex items-center justify-between px-5 py-3 text-sm font-medium lg:hidden"
      >
        <span>
          Filter {activeFilters ? <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{activeFilters} aktiv</span> : null}
        </span>
        <span aria-hidden className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {/* display: contents on large screens keeps the sidebar a grid item (sticky works). */}
      <div id="history-filters" className={`${filtersOpen ? "block" : "hidden"} lg:contents`}>
      <FilterSidebar
        onTrack={onTrack}
        query={q}
        update={update}
        replaceAll={replaceAll}
        effectiveRes={data?.res ?? res}
        coarsened={data?.coarsened ?? coarsened}
        carrierTotals={totals}
        views={views}
        onViewSaved={(v) => setViews((vs) => [v, ...vs])}
        signedIn={signedIn}
        publicMode={publicMode}
      />
      </div>

      <div className="min-w-0 space-y-6">
        <header>
          <p className="text-sm font-medium text-indigo-600">Historie</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Daten erkunden</h1>
          <DataStatus variant="history" />
        </header>

        {!hasData ? <SetupNotice /> : null}
        <FilterChips query={q} res={data?.res ?? res} update={update} onReset={() => replaceAll("")} />
        {error ? <Alert tone="error">Daten konnten nicht geladen werden: {error}</Alert> : null}

        <div className={`space-y-6 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {!data ? (
            <>
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-[480px] w-full" />
            </>
          ) : (
            <>
              <KpiTiles data={data} rows={rows} query={q} />
              <MainChart rows={rows} prevRows={prevRows} res={data.res} query={q} update={update} onTrack={onTrack} />
              <MetricCharts data={data} rows={rows} query={q} />
            </>
          )}
          <HeatmapCard query={q} publicMode={publicMode} update={update} />
          {data ? <DataTable rows={rows} res={data.res} query={q} publicMode={publicMode} /> : null}
        </div>
      </div>
    </main>
  );
}

/** Sends one event per changed filter dimension (period, resolution, chart type, carriers, …). */
function trackHistoryChange(q: HistoryQuery, patch: Partial<HistoryQuery>) {
  if ((patch.from && patch.from !== q.from) || (patch.to && patch.to !== q.to)) {
    track("history_period", `${patch.from ?? q.from}–${patch.to ?? q.to}`);
  }
  if (patch.res && patch.res !== q.res) track("history_resolution", patch.res);
  if (patch.chart && patch.chart !== q.chart) track("history_chart", patch.chart);
  if (patch.carriers && patch.carriers.join() !== q.carriers.join()) {
    for (const c of patch.carriers.filter((x) => !q.carriers.includes(x))) track("history_carrier", c);
  }
  if (patch.metrics && patch.metrics.join() !== q.metrics.join()) {
    for (const m of patch.metrics.filter((x) => !q.metrics.includes(x))) track("history_metric", m);
  }
  if (patch.regions && patch.regions.join() !== q.regions.join()) track("history_regions", patch.regions.join("+"));
  if (patch.heat && patch.heat !== q.heat) track("history_heatmap", patch.heat);
  if (patch.compare && !q.compare) track("history_compare");
}
