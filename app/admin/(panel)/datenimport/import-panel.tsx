"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatBerlin, formatNumber } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/sources/labels";

type SourceProgress = { total: number; done: string[]; failed: { month: string; error: string }[]; rows: number; ms: number; chunks: number };
type Job = {
  id: string;
  sources: string[];
  rangeFrom: string;
  rangeTo: string;
  status: "pending" | "running" | "paused" | "cancelled" | "done" | "error";
  progress: Record<string, SourceProgress>;
  currentChunk: string | null;
  rows: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};
type State = { jobs: Job[]; activeId: string | null; defaultSources: string[] };

const ALL_SOURCES = ["smard", "energycharts", "entsoe", "stromgedacht"] as const;
const SOURCE_HINTS: Record<string, string> = {
  smard: "ab 2015",
  energycharts: "Preise und Grenzflüsse",
  entsoe: "nur mit Token",
  stromgedacht: "API liefert nur die letzten 4 Tage",
};
const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "Wartet",
  running: "Läuft",
  paused: "Unterbrochen",
  cancelled: "Abgebrochen",
  done: "Fertig",
  error: "Mit Fehlern beendet",
};

function eta(job: Job): string | null {
  let remainingMs = 0;
  let known = false;
  const all = Object.values(job.progress);
  const globalAvg = all.reduce((a, p) => a + p.ms, 0) / Math.max(1, all.reduce((a, p) => a + p.chunks, 0));
  for (const p of all) {
    const left = p.total - p.done.length;
    if (left <= 0) continue;
    const avg = p.chunks > 0 ? p.ms / p.chunks : globalAvg;
    if (avg > 0) known = true;
    remainingMs += left * avg;
  }
  if (!known) return null;
  const min = Math.ceil(remainingMs / 60_000);
  return min < 1 ? "unter 1 min" : min < 90 ? `ca. ${min} min` : `ca. ${formatNumber(min / 60, 1)} h`;
}

export function ImportPanel({ today }: { today: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const active = state?.jobs.find((j) => j.id === state.activeId) ?? null;
  const isActive = active != null;

  // Poll every 2 s while an import runs, otherwise every 15 s.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/admin/backfill", { cache: "no-store" });
      if (res.ok && !cancelled) setState(await res.json());
    };
    void load();
    const t = setInterval(load, isActive ? 2_000 : 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isActive, reloadKey]);

  async function act(id: string, action: "cancel" | "resume") {
    setError(null);
    const res = await fetch(`/api/admin/backfill/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Aktion fehlgeschlagen");
    reload();
  }

  async function start(body: { from: string; to: string; sources: string[] }) {
    setError(null);
    const res = await fetch("/api/admin/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Start fehlgeschlagen");
    reload();
  }

  const latest = active ?? state?.jobs[0] ?? null;
  const fourWeeksAgo = new Date(Date.parse(today) - 28 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <StartForm
          title="Initialer Import"
          description="Lädt den gesamten Bestand. SMARD ab 2015 dauert einige Stunden."
          defaultFrom="2015-01-01"
          today={today}
          defaultSources={state?.defaultSources ?? ["smard", "energycharts"]}
          disabled={!!active}
          cta="Import starten"
          onStart={start}
        />
        <StartForm
          title="Zeitraum neu laden"
          description="Für gezielte Korrekturen. Bestehende Werte werden per Upsert überschrieben."
          defaultFrom={fourWeeksAgo}
          today={today}
          defaultSources={state?.defaultSources ?? ["smard", "energycharts"]}
          disabled={!!active}
          cta="Zeitraum neu laden"
          onStart={start}
        />
      </div>

      {latest ? <JobCard job={latest} active={latest.id === state?.activeId} onAction={act} /> : null}

      {state && state.jobs.length > 1 ? (
        <section className="card p-6">
          <h2 className="font-semibold tracking-tight">Frühere Importe</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {state.jobs
              .filter((j) => j.id !== latest?.id)
              .map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-medium">{formatBerlin(Date.parse(j.createdAt))}</span>{" "}
                    <span className="text-slate-500">
                      {j.rangeFrom} – {j.rangeTo} · {j.sources.map((s) => SOURCE_LABELS[s]).join(", ")} · {formatNumber(j.rows, 0)} Zeilen
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={j.status} />
                    {["cancelled", "error", "paused"].includes(j.status) && !state.activeId ? (
                      <Button className="px-3 py-1" onClick={() => act(j.id, "resume")}>
                        Fortsetzen
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function StartForm(props: {
  title: string;
  description: string;
  defaultFrom: string;
  today: string;
  defaultSources: string[];
  disabled: boolean;
  cta: string;
  onStart: (body: { from: string; to: string; sources: string[] }) => Promise<void>;
}) {
  const id = props.title.replace(/\W+/g, "-").toLowerCase();
  const [busy, setBusy] = useState(false);
  // Defaults follow the loaded settings until the user changes a checkbox; a selection made
  // before the settings arrive is never reset.
  const [picked, setPicked] = useState<string[] | null>(null);
  const checked = picked ?? props.defaultSources;
  return (
    <section className="card p-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold tracking-tight">
        {props.title}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{props.description}</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          await props.onStart({
            from: String(f.get("from")),
            to: String(f.get("to")),
            sources: f.getAll("sources").map(String),
          });
          setBusy(false);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <DatePicker label="Von" name="from" required defaultValue={props.defaultFrom} min="2015-01-01" max={props.today} labelClassName="text-sm font-medium text-slate-700" />
          <DatePicker label="Bis" name="to" required defaultValue={props.today} min="2015-01-01" max={props.today} align="end" labelClassName="text-sm font-medium text-slate-700" />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Quellen</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ALL_SOURCES.map((s) => (
              <label key={s} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="sources"
                  value={s}
                  checked={checked.includes(s)}
                  onChange={(e) => setPicked(e.target.checked ? [...checked, s] : checked.filter((x) => x !== s))}
                  className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600"
                />
                <span>
                  {SOURCE_LABELS[s]} <span className="text-slate-500">· {SOURCE_HINTS[s]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="primary" disabled={props.disabled || busy}>
          {props.cta}
        </Button>
        {props.disabled ? <p className="text-xs text-slate-500">Es läuft bereits ein Import.</p> : null}
      </form>
    </section>
  );
}

function StatusBadge({ status }: { status: Job["status"] }) {
  const tone =
    status === "done"
      ? "bg-emerald-50 text-emerald-700"
      : status === "error"
        ? "bg-red-50 text-red-700"
        : status === "running" || status === "pending"
          ? "bg-indigo-50 text-indigo-700"
          : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function JobCard({ job, active, onAction }: { job: Job; active: boolean; onAction: (id: string, a: "cancel" | "resume") => void }) {
  const remaining = active ? eta(job) : null;
  return (
    <section className="card p-6" aria-labelledby="job-title" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="job-title" className="flex items-center gap-3 font-semibold tracking-tight">
            {active ? "Aktueller Import" : "Letzter Import"} <StatusBadge status={job.status} />
          </h2>
          <p className="mt-1 text-sm text-slate-500 tabular-nums">
            {job.rangeFrom} – {job.rangeTo} · {formatNumber(job.rows, 0)} Zeilen geschrieben
            {remaining ? ` · Restzeit ${remaining}` : ""}
          </p>
        </div>
        {active ? (
          <Button variant="danger" onClick={() => onAction(job.id, "cancel")}>
            Abbrechen
          </Button>
        ) : ["cancelled", "error", "paused"].includes(job.status) ? (
          <Button variant="primary" onClick={() => onAction(job.id, "resume")}>
            Fortsetzen
          </Button>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        {job.sources.map((s) => {
          const p = job.progress[s];
          if (!p) return null;
          const current = job.currentChunk?.startsWith(`${s} `) ? job.currentChunk.slice(s.length + 1) : null;
          return (
            <div key={s}>
              <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{SOURCE_LABELS[s] ?? s}</span>
                <span className="text-slate-500 tabular-nums">
                  {current ? `Monat ${current} · ` : ""}
                  {p.done.length}/{p.total} Monate · {formatNumber(p.rows, 0)} Zeilen
                </span>
              </div>
              <ProgressBar value={p.total ? p.done.length / p.total : 0} label={`Fortschritt ${SOURCE_LABELS[s] ?? s}`} tone={p.failed.length ? "amber" : "indigo"} />
              {p.failed.length ? (
                <p className="mt-1 text-xs text-amber-800">
                  {p.failed.length} Monat(e) fehlgeschlagen ({p.failed.slice(0, 3).map((f) => f.month).join(", ")}) – werden beim Fortsetzen erneut versucht.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {job.error ? (
        <div className="mt-4">
          <Alert tone="warning">{job.error}</Alert>
        </div>
      ) : null}
    </section>
  );
}
