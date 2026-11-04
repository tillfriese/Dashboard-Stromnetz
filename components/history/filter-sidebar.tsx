"use client";

import { addDays, addYears, format, parseISO } from "date-fns";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CARRIERS, NEIGHBOURS } from "@/lib/carriers";
import { formatNumber } from "@/lib/format";
import {
  COND_OPS,
  type Condition,
  type CondOp,
  DATA_START,
  DOW_PRESETS,
  type HistoryQuery,
  METRIC_LABEL,
  METRICS,
  RESOLUTION_LABEL,
  RESOLUTIONS,
  type Resolution,
  serializeQuery,
  today,
  VALUE_CONDITIONS,
  type ValueCondKind,
  ZONE_KEYS,
} from "@/lib/history/query";

type View = { id: string; name: string; params: string };

const QUICK: { label: string; from: (to: string) => string }[] = [
  { label: "7 Tage", from: (to) => format(addDays(parseISO(to), -6), "yyyy-MM-dd") },
  { label: "30 Tage", from: (to) => format(addDays(parseISO(to), -29), "yyyy-MM-dd") },
  { label: "1 Jahr", from: (to) => format(addDays(addYears(parseISO(to), -1), 1), "yyyy-MM-dd") },
  { label: "5 Jahre", from: (to) => format(addDays(addYears(parseISO(to), -5), 1), "yyyy-MM-dd") },
  { label: "Alles", from: () => DATA_START },
];

const NEIGHBOUR_NAMES: Record<string, string> = {
  NO: "Norwegen", DK: "Dänemark", SE: "Schweden", NL: "Niederlande", BE: "Belgien", LU: "Luxemburg",
  FR: "Frankreich", CH: "Schweiz", AT: "Österreich", CZ: "Tschechien", PL: "Polen",
};

const inputCls = "block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums";
const selectCls = "rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm";

export function FilterSidebar(props: {
  query: HistoryQuery;
  update: (p: Partial<HistoryQuery>) => void;
  replaceAll: (search: string) => void;
  effectiveRes: Resolution;
  coarsened: boolean;
  carrierTotals: Record<string, number> | null;
  views: View[];
  onViewSaved: (v: View) => void;
  publicMode: boolean;
  onTrack?: (name: string, props?: Record<string, unknown>) => void;
}) {
  const { query: q, update, effectiveRes, publicMode } = props;
  const now = today();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const allCarriers = CARRIERS.map((c) => c.key);

  return (
    <aside className="card h-fit space-y-7 p-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" aria-label="Filter">
      <Section title="Gespeicherte Ansicht" id="f-views">
        <select
          aria-labelledby="f-views"
          className={`${selectCls} w-full`}
          value=""
          onChange={(e) => {
            const v = props.views.find((x) => x.id === e.target.value);
            if (v) props.replaceAll(v.params);
          }}
        >
          <option value="">{props.views.length ? "Ansicht wählen …" : "Noch keine Ansichten"}</option>
          {props.views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Zeitraum" id="f-range">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">
            Von
            <input
              type="date"
              className={`${inputCls} mt-1`}
              min={DATA_START}
              max={q.to}
              value={q.from}
              onChange={(e) => e.target.value && update({ from: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-500">
            Bis
            <input
              type="date"
              className={`${inputCls} mt-1`}
              min={q.from}
              max={now}
              value={q.to}
              onChange={(e) => e.target.value && update({ to: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Schnellwahl Zeitraum">
          {QUICK.map((x) => {
            const from = x.from(now);
            const active = q.from === from && q.to === now;
            return (
              <button
                key={x.label}
                type="button"
                aria-pressed={active}
                onClick={() => update({ from, to: now, res: "auto" })}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {x.label}
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={q.compare} onChange={(e) => update({ compare: e.target.checked })} />
          Mit Vorjahreszeitraum vergleichen
        </label>
      </Section>

      <Section title="Auflösung" id="f-res">
        <div role="radiogroup" aria-labelledby="f-res" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {RESOLUTIONS.map((r) => {
            const active = effectiveRes === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ res: r })}
                className={`rounded-lg px-2 py-1.5 text-sm transition-colors ${active ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                {RESOLUTION_LABEL[r]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {q.res === "auto"
            ? "Automatisch passend zum Zeitraum gewählt, damit nie mehr als ca. 5.000 Punkte gezeichnet werden."
            : props.coarsened
              ? `Für diesen Zeitraum zu fein – automatisch auf „${RESOLUTION_LABEL[effectiveRes]}“ vergröbert (max. ca. 5.000 Punkte).`
              : null}
          {q.res !== "auto" ? (
            <button type="button" className="ml-1 text-indigo-600 underline-offset-2 hover:underline" onClick={() => update({ res: "auto" })}>
              Automatisch
            </button>
          ) : null}
        </p>
      </Section>

      <Section title="Region" id="f-region">
        <div className="space-y-2">
          {ZONE_KEYS.map((z) => (
            <Check
              key={z}
              label={`Regelzone ${z}`}
              checked={q.regions.includes(z)}
              onChange={() => {
                const next = toggle(q.regions, z);
                // At least one zone stays selected.
                if (next.length) update({ regions: ZONE_KEYS.filter((k) => next.includes(k)) });
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Ausgewählte Regelzonen werden addiert; alle vier ergeben Deutschland.</p>
        <label className="mt-4 block text-xs text-slate-500">
          Grenzflüsse mit
          <select
            className={`${selectCls} mt-1 w-full`}
            value={q.flow}
            onChange={(e) => {
              const flow = e.target.value as HistoryQuery["flow"];
              update({ flow, metrics: q.metrics.includes("netImport") ? q.metrics : [...q.metrics, "netImport"] });
            }}
          >
            <option value="sum">Alle Nachbarländer (Saldo)</option>
            {NEIGHBOURS.map((n) => (
              <option key={n} value={n}>
                {NEIGHBOUR_NAMES[n]} ({n})
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section
        title="Energieträger"
        id="f-carriers"
        right={
          <button
            type="button"
            className="text-xs font-medium text-indigo-600"
            onClick={() => update({ carriers: q.carriers.length === allCarriers.length ? [] : allCarriers })}
          >
            {q.carriers.length === allCarriers.length ? "Keine" : "Alle"}
          </button>
        }
      >
        <div className="space-y-2">
          {CARRIERS.map((c) => (
            <Check
              key={c.key}
              label={
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-sm" style={{ background: c.color }} />
                    {c.label}
                  </span>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {props.carrierTotals ? formatNumber(props.carrierTotals[c.key]! / 1_000_000, 1) : ""}
                  </span>
                </span>
              }
              checked={q.carriers.includes(c.key)}
              onChange={() => update({ carriers: allCarriers.filter((k) => toggle(q.carriers, c.key).includes(k)) })}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Zahl rechts: Erzeugung der gewählten Regelzonen im Zeitraum in TWh.</p>
      </Section>

      <Section title="Weitere Kenngrößen" id="f-metrics">
        <div className="space-y-2">
          {METRICS.filter((m) => !(publicMode && m === "price")).map((m) => (
            <Check key={m} label={METRIC_LABEL[m]} checked={q.metrics.includes(m)} onChange={() => update({ metrics: METRICS.filter((x) => toggle(q.metrics, m).includes(x)) })} />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Größen mit anderer Einheit erscheinen als eigenes Diagramm, nie auf einer zweiten y-Achse.</p>
      </Section>

      <ConditionsEditor conditions={q.conditions} publicMode={publicMode} onChange={(conditions) => update({ conditions })} onTrack={props.onTrack} />

      <Actions query={q} onViewSaved={props.onViewSaved} onTrack={props.onTrack} />
    </aside>
  );
}

function Section({ title, id, children, right }: { title: string; id: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id={id} className="section-label">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: React.ReactNode; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
      <input type="checkbox" className="size-4 shrink-0 accent-indigo-600" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

const KIND_OPTIONS: { value: string; label: string }[] = [
  ...Object.entries(VALUE_CONDITIONS).map(([k, v]) => ({ value: k, label: v.label })),
  { value: "dow", label: "Wochentag" },
  { value: "hour", label: "Uhrzeit" },
];

function defaultCondition(kind: string): Condition {
  if (kind === "dow") return { kind: "dow", days: [6, 7] };
  if (kind === "hour") return { kind: "hour", from: 10, to: 15 };
  const defaults: Record<ValueCondKind, Condition> = {
    price: { kind: "price", op: "lt", value: 0 },
    re: { kind: "re", op: "gt", value: 80 },
    residual: { kind: "residual", op: "lt", value: 0 },
    load: { kind: "load", op: "gt", value: 70 },
    co2: { kind: "co2", op: "lt", value: 200 },
  };
  return defaults[kind as ValueCondKind];
}

function ConditionsEditor({
  conditions,
  onChange,
  publicMode,
  onTrack,
}: {
  conditions: Condition[];
  onChange: (c: Condition[]) => void;
  publicMode: boolean;
  onTrack?: (name: string, props?: Record<string, unknown>) => void;
}) {
  const set = (i: number, c: Condition) => onChange(conditions.map((x, j) => (j === i ? c : x)));
  const kinds = KIND_OPTIONS.filter((k) => !(publicMode && k.value === "price"));
  return (
    <Section title="Bedingungen" id="f-cond">
      <p className="mb-3 text-xs text-slate-500">Alle Bedingungen müssen gleichzeitig erfüllt sein (UND), geprüft je Viertelstunde.</p>
      <ul className="space-y-3">
        {conditions.map((c, i) => (
          <li key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`cond-kind-${i}`}>
                Größe
              </label>
              <select id={`cond-kind-${i}`} className={`${selectCls} min-w-0 flex-1`} value={c.kind} onChange={(e) => set(i, defaultCondition(e.target.value))}>
                {kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <button type="button" aria-label="Bedingung entfernen" className="rounded-lg px-2 text-slate-400 hover:text-slate-900" onClick={() => onChange(conditions.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {c.kind === "dow" ? (
                <select aria-label="Wochentage" className={`${selectCls} flex-1`} value={c.days.join("")} onChange={(e) => set(i, { kind: "dow", days: e.target.value.split("").map(Number) })}>
                  {DOW_PRESETS.map((p) => (
                    <option key={p.label} value={p.days.join("")}>
                      {p.label}
                    </option>
                  ))}
                  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, k) => (
                    <option key={d} value={String(k + 1)}>
                      nur {d}
                    </option>
                  ))}
                </select>
              ) : c.kind === "hour" ? (
                <>
                  <input aria-label="von Uhr" type="number" min={0} max={23} className={`${inputCls} w-20`} value={c.from} onChange={(e) => set(i, { ...c, from: Math.min(Number(e.target.value), c.to) })} />
                  <span className="text-sm text-slate-500">bis</span>
                  <input aria-label="bis Uhr" type="number" min={0} max={23} className={`${inputCls} w-20`} value={c.to} onChange={(e) => set(i, { ...c, to: Math.max(Number(e.target.value), c.from) })} />
                  <span className="text-sm text-slate-500">Uhr</span>
                </>
              ) : (
                <>
                  <select aria-label="Vergleich" className={selectCls} value={c.op} onChange={(e) => set(i, { ...c, op: e.target.value as CondOp })}>
                    {Object.entries(COND_OPS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Wert"
                    type="number"
                    step="any"
                    className={`${inputCls} w-24`}
                    defaultValue={c.value}
                    key={`${c.kind}-${c.value}`}
                    onBlur={(e) => e.target.value !== "" && set(i, { ...c, value: Number(e.target.value) })}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                  <span className="text-sm text-slate-500">{VALUE_CONDITIONS[c.kind].unit}</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {conditions.length < 6 ? (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50"
          onClick={() => {
            const c = defaultCondition(publicMode ? "re" : "price");
            onChange([...conditions, c]);
            onTrack?.("condition_added", { kind: c.kind });
          }}
        >
          + Bedingung hinzufügen
        </button>
      ) : null}
    </Section>
  );
}

function Actions({
  query,
  onViewSaved,
  onTrack,
}: {
  query: HistoryQuery;
  onViewSaved: (v: View) => void;
  onTrack?: (name: string, props?: Record<string, unknown>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const params = serializeQuery(query).toString();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, params }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ tone: "error", text: body.error ?? "Speichern fehlgeschlagen" });
      return;
    }
    onViewSaved(body);
    onTrack?.("view_saved");
    setSaving(false);
    setName("");
    setMsg({ tone: "success", text: `Ansicht „${body.name}“ gespeichert.` });
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-6">
      {saving ? (
        <form onSubmit={save} className="space-y-2">
          <label htmlFor="view-name" className="text-sm font-medium text-slate-700">
            Name der Ansicht
          </label>
          <input id="view-name" required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" className="flex-1">
              Speichern
            </Button>
            <Button onClick={() => setSaving(false)}>Abbrechen</Button>
          </div>
        </form>
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setSaving(true)}>
          Ansicht speichern
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`/api/timeseries?${params}&format=csv`}
          download
          onClick={() => onTrack?.("csv_exported")}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          CSV exportieren
        </a>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href).catch(() => {});
            onTrack?.("link_copied");
            setMsg({ tone: "success", text: "Link in die Zwischenablage kopiert." });
          }}
        >
          Link kopieren
        </Button>
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
    </div>
  );
}
