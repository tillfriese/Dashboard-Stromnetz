"use client";

import { useState } from "react";
import { DataStatus } from "@/components/layout/data-status";
import { Card, CardError, CardTitle } from "@/components/ui/card";
import { SetupNotice } from "@/components/ui/setup-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBerlin, formatGW } from "@/lib/format";
import { usePolling } from "@/lib/hooks/use-polling";
import type { MixData } from "@/lib/queries/mix";
import type { NowData, ZoneKey } from "@/lib/queries/now";
import type { PriceData } from "@/lib/queries/prices";
import { FrequencyCard } from "./frequency-card";
import { MixChart } from "./mix-chart";
import { PriceCard } from "./price-card";
import { Co2Card, RenewableCard } from "./stat-cards";
import { ZoneMap } from "./zone-map";
import { ZoneTiles } from "./zone-tiles";

type Props = { initialNow: NowData | null; initialPrices: PriceData | null; initialMix: MixData | null };

export function NowDashboard({ initialNow, initialPrices, initialMix }: Props) {
  const now = usePolling<NowData>("/api/now", 60_000, initialNow);
  const publicMode = now.data?.publicMode ?? initialNow?.publicMode ?? false;
  const prices = usePolling<PriceData>(publicMode ? null : "/api/prices?days=2", 60_000, initialPrices);
  const [selected, setSelected] = useState<ZoneKey | null>(null);
  const [hovered, setHovered] = useState<ZoneKey | null>(null);
  const d = now.data;

  if (d && !d.hasData) {
    return (
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stromnetz Deutschland</h1>
        <div className="mt-8">
          <SetupNotice />
        </div>
      </main>
    );
  }

  const asOf = d?.asOf ?? null;
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="min-h-5 text-sm font-medium text-indigo-600 tabular-nums">
            {asOf ? `${formatBerlin(asOf, "EEEE, d. MMMM yyyy")} · ${formatBerlin(asOf, "HH:mm")}–${formatBerlin(asOf + 15 * 60_000, "HH:mm")} Uhr` : " "}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Stromnetz Deutschland</h1>
          <DataStatus variant="now" />
        </div>
        <dl className="flex gap-6 sm:gap-8">
          <Kpi label="Erzeugung" mw={d?.kpis.generationMW} />
          <Kpi label="Verbrauch" mw={d?.kpis.loadMW} />
          <Kpi
            label="Netto-Import"
            mw={d?.kpis.netImportMW}
            title="Saldo der physikalischen Grenzflüsse (positiv = Import)"
            note={d?.flowsAsOf ? `Stand ${formatBerlin(d.flowsAsOf, "HH:mm")} Uhr` : undefined}
          />
        </dl>
      </div>
      {now.error && d ? <p className="mt-3 text-xs text-amber-700">Aktualisierung fehlgeschlagen – zeige zuletzt geladene Werte.</p> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card labelledBy="map-title">
          <CardTitle
            id="map-title"
            sub="Saldo je Regelzone (Erzeugung − Last) und physikalische Grenzflüsse · Gebiet zum Auswählen anklicken"
            right={<MapLegend />}
          >
            Energieflüsse nach Übertragungsnetz
          </CardTitle>
          {!d ? (
            <Skeleton className="mt-6 h-[560px] w-full" />
          ) : d.zones.length === 0 ? (
            <CardError />
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <ZoneMap zones={d.zones} flows={d.flows} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
              </div>
              <div>
                <ZoneTiles zones={d.zones} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  Gebiete vereinfacht nach Bundesländern zugeordnet (die echten Regelzonen folgen nicht den Landesgrenzen).
                  Grenzflüsse: Energy-Charts{d.flowsAsOf ? `, Stand ${formatBerlin(d.flowsAsOf, "HH:mm")} Uhr (mehrere Stunden Verzug)` : ""}. Flüsse zwischen den
                  Regelzonen sind nicht öffentlich und werden nicht gezeigt. Karte: MapSVG / svg-maps, CC BY 4.0.
                </p>
              </div>
            </div>
          )}
        </Card>

        <div className="grid content-start gap-6">
          <div className="grid grid-cols-2 gap-6">
            <RenewableCard data={d} />
            <Co2Card data={d} />
          </div>
          <FrequencyCard />
          {publicMode ? null : <PriceCard data={prices.data} error={prices.error} />}
        </div>
      </div>

      <MixChart initial={initialMix} />
      <p className="mt-4 text-xs text-slate-500">
        Erzeugung und Netzlast nach SMARD, Netto-Import aus den physikalischen Grenzflüssen (Energy-Charts). Die Differenz
        aus Erzeugung und Last entspricht nicht exakt dem Netto-Import (Abgrenzung der Netzlast, Eigenverbrauch, Netzverluste).
      </p>
    </main>
  );
}

function Kpi({ label, mw, title, note }: { label: string; mw: number | null | undefined; title?: string; note?: string }) {
  return (
    <div title={title} className="relative">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 min-w-20 text-2xl font-semibold tracking-tight tabular-nums">{mw == null ? "– GW" : `${formatGW(mw)} GW`}</dd>
      {note ? <dd className="absolute top-full mt-0.5 text-xs whitespace-nowrap text-slate-400 tabular-nums">{note}</dd> : null}
    </div>
  );
}

function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600" aria-label="Legende Karte">
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm bg-indigo-300" />
        Überschuss
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm bg-amber-300" />
        Defizit
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-indigo-600">→</span>
        Export
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-amber-600">→</span>
        Import
      </li>
    </ul>
  );
}
