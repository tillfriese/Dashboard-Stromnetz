"use client";

import { useMemo, useState } from "react";
import { DataStatus } from "@/components/layout/data-status";
import { Alert } from "@/components/ui/alert";
import { SetupNotice } from "@/components/ui/setup-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/hooks/use-json";
import { carrierTotals, deriveRows } from "@/lib/history/derive";
import { effectiveResolution } from "@/lib/history/query";
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
  hasData,
}: {
  initialData: TimeseriesResponse | null;
  initialSearch: string;
  initialViews: View[];
  hasData: boolean;
}) {
  const { query: q, update, replaceAll } = useHistoryQuery();
  const search = dataSearch(q);
  const url = `/api/timeseries?${search}`;
  const { data, error, loading } = useJson<TimeseriesResponse>(url, initialData, `/api/timeseries?${initialSearch}`);
  const [views, setViews] = useState(initialViews);
  const { res, coarsened } = effectiveResolution(q);

  // The selected control areas are summed into one selection.
  const rows = useMemo(() => (data ? deriveRows(data.main, q.regions, q, data.res) : []), [data, q]);
  const prevRows = useMemo(() => (data?.compare ? deriveRows(data.compare, q.regions, q, data.res) : null), [data, q]);
  const totals = useMemo(() => (data ? carrierTotals(data.main, q.regions) : null), [data, q.regions]);
  const publicMode = data?.publicMode ?? false;

  return (
    <main className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:grid-cols-[300px_minmax(0,1fr)]">
      <FilterSidebar
        query={q}
        update={update}
        replaceAll={replaceAll}
        effectiveRes={data?.res ?? res}
        coarsened={data?.coarsened ?? coarsened}
        carrierTotals={totals}
        views={views}
        onViewSaved={(v) => setViews((vs) => [v, ...vs])}
        publicMode={publicMode}
      />

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
              <MainChart rows={rows} prevRows={prevRows} res={data.res} query={q} update={update} />
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
