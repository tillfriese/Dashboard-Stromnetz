"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { SourceStatus } from "@/lib/admin/source-status";
import { formatBerlin, formatNumber } from "@/lib/format";

type UiSetting = { origin: "db" | "env" | "default" | "none"; value: string | null; configured: boolean };
type Settings = Record<string, UiSetting>;
type TestResult = { ok: boolean; message: string; latencyMs: number };

const SOURCES = [
  { id: "smard", name: "SMARD (Bundesnetzagentur)", purpose: "Erzeugung, Last, Residuallast, Prognosen je Regelzone" },
  { id: "energycharts", name: "Energy-Charts (Fraunhofer ISE)", purpose: "Day-Ahead-Preise, Grenzflüsse, Netzfrequenz (Ersatz)" },
  { id: "entsoe", name: "ENTSO-E Transparency", purpose: "Physikalische Grenzflüsse je Nachbarland", secret: "entsoe.token", field: "entsoeToken" },
  { id: "gridradar", name: "Gridradar", purpose: "Netzfrequenz", secret: "gridradar.token", field: "gridradarToken" },
  { id: "stromgedacht", name: "StromGedacht (TransnetBW)", purpose: "Netzampel Baden-Württemberg" },
] as const;

const ORIGIN_LABEL: Record<UiSetting["origin"], string> = {
  db: "gespeichert",
  env: "aus .env",
  default: "Standard",
  none: "nicht gesetzt",
};

async function putSettings(body: object): Promise<Settings> {
  const res = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Speichern fehlgeschlagen");
  return json.settings as Settings;
}

export function SourcesPanel({ initialSettings, status }: { initialSettings: Settings; status: SourceStatus[] }) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);

  async function update(body: object) {
    setError(null);
    try {
      setSettings(await putSettings(body));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  const publicMode = settings["app.publicMode"]?.value === "true";

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <section className="card flex items-center justify-between gap-6 p-6">
        <div>
          <h2 className="font-semibold tracking-tight">Öffentlicher Modus</h2>
          <p className="mt-1 text-sm text-slate-500">
            Blendet Börsenpreise (EPEX SPOT) aus. Für öffentlich erreichbare Instanzen einschalten.
          </p>
        </div>
        <Switch checked={publicMode} label="Öffentlicher Modus" onChange={(v) => update({ publicMode: v })} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {SOURCES.map((src) => (
          <SourceCard
            key={src.id}
            source={src}
            status={status.find((s) => s.source === src.id)}
            settings={settings}
            onUpdate={update}
          />
        ))}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  status,
  settings,
  onUpdate,
}: {
  source: (typeof SOURCES)[number];
  status?: SourceStatus;
  settings: Settings;
  onUpdate: (body: object) => Promise<boolean>;
}) {
  const enabled = settings[`source.${source.id}.enabled`]?.value !== "false";
  const [draft, setDraft] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const secretKey = "secret" in source ? source.secret : null;
  const secret = secretKey ? settings[secretKey] : null;
  const zip = settings["stromgedacht.zip"];

  async function test(value?: string) {
    setTesting(true);
    setResult(null);
    const res = await fetch("/api/admin/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: source.id, ...(value ? { value } : {}) }),
    });
    setResult(res.ok ? await res.json() : { ok: false, message: `Fehler (HTTP ${res.status})`, latencyMs: 0 });
    setTesting(false);
  }

  async function save(value: string | null) {
    setSaving(true);
    const field = "field" in source ? source.field : "stromgedachtZip";
    if (await onUpdate({ [field]: value })) setDraft("");
    setSaving(false);
  }

  const fmt = (iso: string | null) => (iso ? formatBerlin(Date.parse(iso)) : "–");

  return (
    <section className="card p-6" aria-labelledby={`src-${source.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`src-${source.id}`} className="font-semibold tracking-tight">
            {source.name}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{source.purpose}</p>
        </div>
        <Switch checked={enabled} label={`${source.name} aktiv`} onChange={(v) => onUpdate({ sources: { [source.id]: v } })} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Stat label="Letzter Abruf" value={fmt(status?.lastSuccessAt ?? null)} />
        <Stat label="Zeilen in der DB" value={formatNumber(status?.rows ?? 0, 0)} />
        <Stat label="Ältester Wert" value={fmt(status?.oldest ?? null)} />
        <Stat label="Neuester Wert" value={fmt(status?.newest ?? null)} />
        <Stat label="Letzter Fehler" value={status?.lastErrorAt ? `${fmt(status.lastErrorAt)}: ${status.lastError ?? ""}` : "–"} wide />
        <Stat label="Erkannte Lücken (60 Tage)" value={gapText(status)} wide />
      </dl>

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        {secretKey ? (
          <>
            <p className="text-sm text-slate-600">
              Token:{" "}
              <span className="font-mono text-slate-900">{secret?.value ?? "nicht gesetzt"}</span>{" "}
              <span className="text-slate-400">({ORIGIN_LABEL[secret?.origin ?? "none"]})</span>
            </p>
            <Field
              id={`${source.id}-token`}
              label={secret?.configured ? "Neuen Token setzen" : "Token"}
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Token einfügen"
            />
          </>
        ) : null}
        {source.id === "stromgedacht" ? (
          <Field
            id="stromgedacht-zip"
            label="Postleitzahl (Baden-Württemberg)"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={zip?.value ?? "70173"}
            hint={`Aktuell: ${zip?.value ?? "70173"} (${ORIGIN_LABEL[zip?.origin ?? "default"]})`}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {secretKey || source.id === "stromgedacht" ? (
            <>
              <Button variant="primary" disabled={!draft.trim() || saving} onClick={() => save(draft.trim())}>
                Speichern
              </Button>
              {secretKey && secret?.origin === "db" ? (
                <Button variant="danger" disabled={saving} onClick={() => save(null)}>
                  Token entfernen
                </Button>
              ) : null}
            </>
          ) : null}
          <Button disabled={testing} onClick={() => test(draft.trim() || undefined)}>
            {testing ? "Teste …" : draft.trim() ? "Eingabe testen" : "Verbindung testen"}
          </Button>
        </div>
        {result ? (
          <Alert tone={result.ok ? "success" : "error"}>
            {result.message}
            {result.latencyMs ? <span className="text-xs opacity-70"> · {result.latencyMs} ms</span> : null}
          </Alert>
        ) : null}
      </div>
    </section>
  );
}

function gapText(status?: SourceStatus): string {
  if (!status || status.rows === 0) return "–";
  const g = status.gaps;
  if (g.ranges === 0) return "keine";
  const ex = g.examples[0];
  const first = ex ? ` · größte: ${ex.series}, ${formatBerlin(Date.parse(ex.from))} – ${formatBerlin(Date.parse(ex.to))}` : "";
  return `${formatNumber(g.missingQuarterHours, 0)} Viertelstunden in ${g.ranges} Lücke(n)${first}`;
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
