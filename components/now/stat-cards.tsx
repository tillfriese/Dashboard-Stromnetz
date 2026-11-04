import { Card, CardError, Pill } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatSigned } from "@/lib/format";
import type { NowData } from "@/lib/queries/now";

export function RenewableCard({ data }: { data: NowData | null }) {
  const share = data?.renewable.share ?? null;
  const prev = data?.renewable.yesterday ?? null;
  const delta = share != null && prev != null ? share - prev : null;
  return (
    <Card labelledBy="re-title" className="min-h-44">
      <h2 id="re-title" className="text-sm font-medium text-slate-500">
        Erneuerbare
      </h2>
      {data == null ? (
        <Skeleton className="mt-4 h-10 w-28" />
      ) : share == null ? (
        <CardError />
      ) : (
        <>
          <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
            {formatNumber(share, 1)}
            <span className="ml-1 text-lg font-medium text-slate-500">%</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Anteil an der Erzeugung</p>
          {delta != null ? (
            <div className="mt-3">
              <Pill tone={delta >= 0 ? "indigo" : "amber"}>{formatSigned(delta, 1)} Pp. ggü. gestern</Pill>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function Co2Card({ data }: { data: NowData | null }) {
  const co2 = data?.co2;
  return (
    <Card labelledBy="co2-title" className="min-h-44">
      <h2 id="co2-title" className="text-sm font-medium text-slate-500">
        CO₂-Intensität
      </h2>
      {data == null ? (
        <Skeleton className="mt-4 h-10 w-28" />
      ) : co2?.now == null ? (
        <CardError />
      ) : (
        <>
          <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
            {formatNumber(co2.now, 0)}
            <span className="ml-1 text-lg font-medium text-slate-500">g/kWh</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">der Erzeugung, direkte Emissionen</p>
          {co2.todayMin != null && co2.todayMax != null ? (
            <div className="mt-3">
              <Pill>
                heute {formatNumber(co2.todayMin, 0)}–{formatNumber(co2.todayMax, 0)}
              </Pill>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
