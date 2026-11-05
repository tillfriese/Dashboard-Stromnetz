"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { addDays, format, parseISO } from "date-fns";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardError, CardTitle } from "@/components/ui/card";
import { Heatmap } from "@/components/ui/heatmap";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { TableDetails } from "@/components/ui/table-details";
import { formatBerlin, formatNumber } from "@/lib/format";
import { useJson } from "@/lib/hooks/use-json";
import type { Ranking, SessionRow, StatsReport } from "@/lib/stats/report";

type Preset = "today" | "7d" | "30d" | "custom";
const PRESETS = [
  { value: "today", label: "Heute" },
  { value: "7d", label: "7 Tage" },
  { value: "30d", label: "30 Tage" },
  { value: "custom", label: "Frei" },
] as const;

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const shift = (d: string, n: number) => format(addDays(parseISO(d), n), "yyyy-MM-dd");

function duration(ms: number | null) {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

export function VisitorsPanel({ today }: { today: string }) {
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState({ from: shift(today, -29), to: today });
  const rangeFor = (p: Preset) =>
    p === "today" ? { from: today, to: today } : p === "7d" ? { from: shift(today, -6), to: today } : p === "30d" ? { from: shift(today, -29), to: today } : custom;
  const { from, to } = rangeFor(preset);
  const qs = `from=${from}&to=${to}`;
  // Bumped after a reset so the report and the session list are fetched again.
  const [rev, setRev] = useState(0);
  const dataQs = rev ? `${qs}&rev=${rev}` : qs;
  const { data, error, loading } = useJson<StatsReport>(`/api/admin/stats?${dataQs}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented label="Zeitraum" value={preset} options={PRESETS} onChange={setPreset} />
          {preset === "custom" ? (
            <div className="flex gap-2">
              <div className="w-40">
                <DatePicker label="Von" value={custom.from} max={custom.to} rangeStart={custom.from} rangeEnd={custom.to} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
              </div>
              <div className="w-40">
                <DatePicker label="Bis" value={custom.to} min={custom.from} max={today} rangeStart={custom.from} rangeEnd={custom.to} align="end" onChange={(to) => setCustom((c) => ({ ...c, to }))} />
              </div>
            </div>
          ) : null}
        </div>
        <a href={`/api/admin/stats/export?${qs}`} download className="rounded-xl border border-slate-200 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50">
          CSV exportieren
        </a>
      </div>

      {error ? <Alert tone="error">Statistik konnte nicht geladen werden: {error}</Alert> : null}
      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <Kpis r={data} />
          <div className="grid gap-6 xl:grid-cols-2">
            <SeriesCard r={data} />
            <HeatCard r={data} />
          </div>
          <Rankings r={data} />
          <Sessions key={dataQs} qs={dataQs} retentionDays={data.retentionDays} />
          <div className="grid gap-6 xl:grid-cols-2">
            <VitalsCard r={data} />
            <ErrorsCard r={data} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <RetentionCard days={data.retentionDays} />
            <ResetCard onReset={() => setRev((r) => r + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpis({ r }: { r: StatsReport }) {
  const items = [
    { label: "Besucher (Sitzungen)", value: formatNumber(r.kpis.sessions, 0) },
    { label: "Seitenaufrufe", value: formatNumber(r.kpis.pageviews, 0) },
    { label: "Ø Dauer", value: duration(r.kpis.avgDurationMs) },
    { label: "Absprungrate", value: r.kpis.bounceRate == null ? "–" : `${formatNumber(r.kpis.bounceRate, 1)} %` },
    { label: "Aktiv (letzte 5 min)", value: formatNumber(r.kpis.activeNow, 0) },
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="card p-5">
          <dt className="text-sm text-slate-500">{i.label}</dt>
          <dd className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SeriesCard({ r }: { r: StatsReport }) {
  const fmt = (b: string) => (r.granularity === "hour" ? b.slice(5).replace("T", " ") : format(parseISO(b), "dd.MM."));
  return (
    <Card labelledBy="vs-series">
      <CardTitle id="vs-series" sub={`Sitzungen und Seitenaufrufe je ${r.granularity === "hour" ? "Stunde" : "Tag"}`}>
        Verlauf
      </CardTitle>
      <div className="mt-4 h-60" role="img" aria-label="Liniendiagramm Sitzungen und Seitenaufrufe">
        {r.series.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-slate-500">Noch keine Besuche im Zeitraum.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={r.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-slate-100)" />
              <XAxis dataKey="bucket" tickFormatter={fmt} tick={{ fontSize: 12, fill: "var(--color-slate-500)" }} tickLine={false} minTickGap={20} />
              <YAxis width={40} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--color-slate-500)" }} tickLine={false} axisLine={false} />
              <Tooltip
                isAnimationActive={false}
                labelFormatter={(l) => fmt(String(l))}
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-slate-200)", borderRadius: 12, fontSize: 13 }}
              />
              <Line dataKey="sessions" name="Sitzungen" stroke="var(--color-indigo-600)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="pageviews" name="Seitenaufrufe" stroke="var(--color-slate-400)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <TableDetails head={["Zeit", "Sitzungen", "Seitenaufrufe"]} rows={r.series.map((s) => [fmt(s.bucket), s.sessions, s.pageviews])} />
    </Card>
  );
}

function HeatCard({ r }: { r: StatsReport }) {
  const max = Math.max(1, ...r.heatmap.flat());
  return (
    <Card labelledBy="vs-heat">
      <CardTitle id="vs-heat" sub="Sitzungen nach Wochentag und Uhrzeit (Europe/Berlin)">
        Wochentag × Uhrzeit
      </CardTitle>
      <div className="mt-4">
        <Heatmap
          values={r.heatmap.map((row) => row.map((v) => (v === 0 ? null : v)))}
          rowLabels={DAYS}
          colLabels={Array.from({ length: 24 }, (_, h) => `${h}–${h + 1} Uhr`)}
          colTicks={new Map([0, 6, 12, 18].map((h) => [h, `${h} Uhr`]))}
          color={(v) => `color-mix(in oklab, var(--color-indigo-600) ${Math.round(15 + (v / max) * 85)}%, transparent)`}
          format={(v) => (v == null ? "keine Sitzungen" : `${formatNumber(v, 0)} Sitzungen`)}
          ariaLabel="Heatmap der Sitzungen nach Wochentag und Uhrzeit"
        />
      </div>
    </Card>
  );
}

const RANKINGS: { key: keyof StatsReport["rankings"]; title: string }[] = [
  { key: "pages", title: "Seiten" },
  { key: "referrers", title: "Herkunft" },
  { key: "countries", title: "Länder" },
  { key: "devices", title: "Geräte" },
  { key: "browsers", title: "Browser" },
  { key: "zones", title: "Angeklickte Regelzonen" },
  { key: "carriers", title: "Gewählte Energieträger" },
  { key: "filters", title: "Filter und Aktionen" },
];
const DEVICE: Record<string, string> = { mobile: "Handy", tablet: "Tablet", desktop: "Desktop" };
const CARRIER: Record<string, string> = {
  hydro: "Wasserkraft", biomass: "Biomasse", wind: "Wind", solar: "Photovoltaik", lignite: "Braunkohle",
  hardcoal: "Steinkohle", gas: "Erdgas", nuclear: "Kernenergie", other: "Sonstige",
};

function Rankings({ r }: { r: StatsReport }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {RANKINGS.map(({ key, title }) => (
        <RankCard
          key={key}
          title={title}
          items={r.rankings[key].map((x) => ({ ...x, label: key === "devices" ? (DEVICE[x.label] ?? x.label) : key === "carriers" ? (CARRIER[x.label] ?? x.label) : x.label }))}
        />
      ))}
      <Card labelledBy="vs-views" compact>
        <h2 id="vs-views" className="font-semibold tracking-tight">
          Gespeicherte Ansichten
        </h2>
        {r.savedViews.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Noch keine.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {r.savedViews.map((v) => (
              <li key={v.name + v.createdAt} className="flex justify-between gap-3">
                <span className="truncate">{v.name}</span>
                <span className="shrink-0 text-slate-500 tabular-nums">{formatBerlin(Date.parse(v.createdAt), "dd.MM.yy")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RankCard({ title, items }: { title: string; items: Ranking }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const id = `rank-${title.replace(/\W+/g, "-")}`;
  return (
    <Card labelledBy={id} compact>
      <h2 id={id} className="font-semibold tracking-tight">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Keine Daten im Zeitraum.</p>
      ) : (
        <ol className="mt-3 space-y-1.5 text-sm">
          {items.map((i) => (
            <li key={i.label} className="relative flex justify-between gap-3 overflow-hidden rounded-md px-2 py-1">
              <span aria-hidden className="absolute inset-y-0 left-0 rounded-md bg-indigo-50" style={{ width: `${(i.count / max) * 100}%` }} />
              <span className="relative truncate">{i.label}</span>
              <span className="relative shrink-0 font-medium tabular-nums">{formatNumber(i.count, 0)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Sessions({ qs, retentionDays }: { qs: string; retentionDays: number }) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<SessionRow | null>(null);
  const { data, error } = useJson<{ total: number; rows: SessionRow[] }>(`/api/admin/stats/sessions?${qs}&offset=${offset}`);
  return (
    <Card labelledBy="vs-sessions">
      <CardTitle id="vs-sessions" sub={`Einzelne Sitzungen der letzten ${retentionDays} Tage (danach nur noch als Summen). Klick öffnet die Zeitleiste.`}>
        Sitzungen
      </CardTitle>
      {error ? <CardError /> : null}
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Sitzungen (scrollbar)">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">Start</th>
              <th className="py-2 pr-4 font-medium">Dauer</th>
              <th className="py-2 pr-4 font-medium">Seiten</th>
              <th className="py-2 pr-4 font-medium">Einstieg → Ausstieg</th>
              <th className="py-2 pr-4 font-medium">Gerät</th>
              <th className="py-2 pr-4 font-medium">Land</th>
              <th className="py-2 font-medium">Herkunft</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id + s.startedAt} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4">
                  <button type="button" className="rounded font-medium text-indigo-600 tabular-nums hover:underline" onClick={() => setOpen(open?.id === s.id ? null : s)} aria-expanded={open?.id === s.id}>
                    {formatBerlin(Date.parse(s.startedAt), "dd.MM. HH:mm")}
                  </button>
                </td>
                <td className="py-2 pr-4 tabular-nums">{duration(s.durationMs)}</td>
                <td className="py-2 pr-4 tabular-nums">{s.pageviews}</td>
                <td className="py-2 pr-4 text-slate-600">
                  {s.entryPath} → {s.exitPath}
                </td>
                <td className="py-2 pr-4 text-slate-600">
                  {DEVICE[s.device ?? ""] ?? "–"} · {s.browser ?? "–"} · {s.os ?? "–"}
                </td>
                <td className="py-2 pr-4 text-slate-600">{s.country ?? "–"}</td>
                <td className="py-2 text-slate-600">{s.referrer ?? "direkt"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Keine Sitzungen im Zeitraum.</p> : null}
      </div>
      {data && data.total > 50 ? (
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-500">
          <Button className="px-3 py-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
            Zurück
          </Button>
          <span className="tabular-nums">
            {offset + 1}–{Math.min(offset + 50, data.total)} von {data.total}
          </span>
          <Button className="px-3 py-1" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>
            Weiter
          </Button>
        </div>
      ) : null}
      {open ? <Timeline session={open} /> : null}
    </Card>
  );
}

const TYPE_LABEL: Record<string, string> = { pageview: "Seitenaufruf", leave: "Seite verlassen", event: "Aktion", scroll: "Gescrollt", vital: "Web Vital", error: "Fehler" };

function Timeline({ session }: { session: SessionRow }) {
  const { data } = useJson<{ events: { ts: string; type: string; path: string; name: string | null; value: number | null; label: string | null }[] }>(
    `/api/admin/stats/session?id=${encodeURIComponent(session.id)}&start=${encodeURIComponent(session.startedAt)}`,
  );
  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4" aria-live="polite">
      <h3 className="text-sm font-semibold">Zeitleiste der Sitzung ab {formatBerlin(Date.parse(session.startedAt), "dd.MM.yyyy HH:mm")}</h3>
      {!data ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : (
        <ol className="mt-3 space-y-1.5 border-l border-slate-200 pl-4 text-sm">
          {data.events.map((e, i) => (
            <li key={i} className="relative">
              <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-indigo-600" />
              <span className="tabular-nums text-slate-500">{formatBerlin(Date.parse(e.ts), "HH:mm:ss")}</span>{" "}
              <span className="font-medium">{TYPE_LABEL[e.type] ?? e.type}</span> <span className="text-slate-600">{e.path}</span>
              {e.name ? <span className="text-slate-600"> · {e.name}</span> : null}
              {e.label ? <span className="text-slate-600"> · {e.label}</span> : null}
              {e.value != null ? (
                <span className="text-slate-500 tabular-nums">
                  {" "}
                  · {e.type === "leave" ? duration(e.value) : e.type === "scroll" ? `${e.value} %` : formatNumber(e.value, 0)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const RATING: Record<string, { cls: string; text: string }> = {
  gut: { cls: "bg-emerald-50 text-emerald-700", text: "gut" },
  mittel: { cls: "bg-amber-50 text-amber-800", text: "verbesserungswürdig" },
  schlecht: { cls: "bg-red-50 text-red-700", text: "schlecht" },
};

function VitalsCard({ r }: { r: StatsReport }) {
  const unit = (m: string, v: number) => (m === "CLS" ? formatNumber(v / 1000, 3) : `${formatNumber(v, 0)} ms`);
  return (
    <Card labelledBy="vs-vitals">
      <CardTitle id="vs-vitals" sub="75. Perzentil je Seite · Schwellen nach web.dev (LCP 2,5/4 s, INP 200/500 ms, CLS 0,1/0,25)">
        Web Vitals
      </CardTitle>
      {r.vitals.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Noch keine Messwerte.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">Seite</th>
              <th className="py-2 pr-4 font-medium">Metrik</th>
              <th className="py-2 pr-4 font-medium">p75</th>
              <th className="py-2 font-medium">Bewertung</th>
            </tr>
          </thead>
          <tbody>
            {r.vitals.map((v) => (
              <tr key={v.path + v.metric} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4">{v.path}</td>
                <td className="py-2 pr-4">{v.metric}</td>
                <td className="py-2 pr-4 tabular-nums">
                  {unit(v.metric, v.p75)} <span className="text-xs text-slate-500">(n={v.samples})</span>
                </td>
                <td className="py-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RATING[v.rating]!.cls}`}>● {RATING[v.rating]!.text}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ErrorsCard({ r }: { r: StatsReport }) {
  return (
    <Card labelledBy="vs-errors">
      <CardTitle id="vs-errors" sub="Meldungen ohne URLs, E-Mail-Adressen oder lange Zahlen">
        Letzte Client-Fehler
      </CardTitle>
      {r.errors.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Keine Fehler im Zeitraum.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {r.errors.map((e, i) => (
            <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="tabular-nums text-slate-500">{formatBerlin(Date.parse(e.ts), "dd.MM. HH:mm")}</span> · {e.path}
              <p className="mt-0.5 font-mono text-xs break-all">{e.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RetentionCard({ days }: { days: number }) {
  const [value, setValue] = useState(String(days));
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <Card labelledBy="vs-retention">
      <CardTitle id="vs-retention" sub="Einzelne Sitzungen und Ereignisse werden danach gelöscht. Tageswerte, Verlauf und Ranglisten bleiben unbegrenzt erhalten.">
        Aufbewahrung der Rohdaten
      </CardTitle>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch("/api/admin/stats/retention", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: Number(value) }) });
          const body = await res.json().catch(() => ({}));
          setMsg(res.ok ? { tone: "success", text: `Aufbewahrung auf ${body.days} Tage gesetzt.` } : { tone: "error", text: body.error ?? "Fehler" });
        }}
      >
        <label className="text-sm text-slate-700">
          Tage
          <input type="number" min={7} max={730} value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 block w-28 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm tabular-nums" />
        </label>
        <Button type="submit" variant="primary">
          Speichern
        </Button>
      </form>
      {msg ? (
        <div className="mt-3">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
    </Card>
  );
}

function ResetCard({ onReset }: { onReset: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <Card labelledBy="vs-reset">
      <CardTitle id="vs-reset" sub="Löscht alle Sitzungen, Ereignisse, Tageswerte und Ranglisten. Einstellungen und gespeicherte Ansichten bleiben erhalten.">
        Statistik zurücksetzen
      </CardTitle>
      <div className="mt-4">
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm("Alle Besucherstatistiken endgültig löschen? Das lässt sich nicht rückgängig machen.")) return;
            setBusy(true);
            const res = await fetch("/api/admin/stats/reset", { method: "DELETE" }).catch(() => null);
            setBusy(false);
            if (res?.ok) {
              setMsg({ tone: "success", text: "Statistik zurückgesetzt." });
              onReset();
            } else {
              const body = await res?.json().catch(() => null);
              setMsg({ tone: "error", text: body?.error ?? "Zurücksetzen fehlgeschlagen" });
            }
          }}
        >
          {busy ? "Wird gelöscht …" : "Alle Daten löschen"}
        </Button>
      </div>
      {msg ? (
        <div className="mt-3">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
