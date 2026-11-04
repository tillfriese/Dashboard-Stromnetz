import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryView } from "@/components/history/history-view";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";
import { getTimeseries } from "@/lib/history/data";
import { dataSearch, parseQuery } from "@/lib/history/query";
import { desc } from "drizzle-orm";

export const metadata: Metadata = { title: "Historie" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: PageProps<"/historie">) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) params.append(k, x);
  const q = parseQuery(params);
  const [data, views] = await Promise.all([
    getTimeseries(q).catch(() => null),
    db()
      .select()
      .from(savedViews)
      .orderBy(desc(savedViews.createdAt))
      .limit(100)
      .catch(() => []),
  ]);
  const hasData = data == null || data.main.buckets.length > 0 || q.conditions.length > 0;
  return (
    <Suspense>
      <HistoryView
        initialData={data}
        initialSearch={dataSearch(q)}
        initialViews={views.map((v) => ({ id: v.id, name: v.name, params: (v.query as { params: string }).params }))}
        hasData={hasData}
      />
    </Suspense>
  );
}
