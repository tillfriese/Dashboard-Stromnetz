import { AdminPageHeader } from "@/components/admin/page-header";
import { formatBerlin, formatNumber } from "@/lib/format";
import Link from "next/link";
import { systemInfo } from "@/lib/admin/system";
import { listPendingInvites } from "@/lib/auth/registration";
import { getAdminSession } from "@/lib/auth/session";
import { InvitesCard } from "./invites-card";

export const dynamic = "force-dynamic";

const fmt = (iso: string | null) => (iso ? formatBerlin(Date.parse(iso), "dd.MM. HH:mm") : "–");

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

export default async function SystemPage() {
  const session = await getAdminSession();
  if (!session) return null; // layout already redirects
  const [invites, info] = await Promise.all([listPendingInvites(), systemInfo()]);

  return (
    <>
      <AdminPageHeader title="System" description="Admin-Einladungen und Systemzustand." />
      <div className="space-y-6">
        <p className="text-sm text-slate-500">
          Deine eigenen Passkeys verwaltest du unter{" "}
          <Link href="/konto#passkeys" className="font-medium text-indigo-600 hover:underline">
            Mein Konto
          </Link>
          .
        </p>
        <InvitesCard initial={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))} />
        <section className="card p-6" aria-labelledby="system-title">
          <h2 id="system-title" className="font-semibold tracking-tight">
            Systemzustand
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Item label="App-Version" value={info.version} />
            <Item label="Uptime" value={formatUptime(info.uptimeS)} />
            <Item label="Datenbankgröße" value={info.dbSize} />
            <Item
              label="Kompression (observations)"
              value={
                info.compression.ratio
                  ? `${formatNumber(info.compression.ratio, 1)} : 1 · ${info.compression.compressed}/${info.compression.chunks} Chunks`
                  : `${info.compression.compressed}/${info.compression.chunks} Chunks komprimiert`
              }
            />
          </dl>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="card p-6" aria-labelledby="tables-title">
            <h2 id="tables-title" className="font-semibold tracking-tight">
              Größe je Tabelle
            </h2>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {info.tables.map((t) => (
                  <tr key={t.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 font-mono text-xs">{t.name}</td>
                    <td className="py-2 text-right tabular-nums">{t.pretty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-6" aria-labelledby="cagg-title">
            <h2 id="cagg-title" className="font-semibold tracking-tight">
              Continuous Aggregates
            </h2>
            <table className="mt-4 w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left font-medium">Aggregat</th>
                  <th className="py-2 text-left font-medium">Materialisiert bis</th>
                  <th className="py-2 text-left font-medium">Letzter Lauf</th>
                  <th className="py-2 text-left font-medium">Nächster</th>
                </tr>
              </thead>
              <tbody>
                {info.caggs.map((c) => (
                  <tr key={c.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 font-mono text-xs">{c.name}</td>
                    <td className="py-2 tabular-nums">{fmt(c.watermark)}</td>
                    <td className="py-2 tabular-nums">
                      {fmt(c.lastRun)} {c.status && c.status !== "Success" ? <span className="text-red-700">({c.status})</span> : null}
                    </td>
                    <td className="py-2 tabular-nums">{fmt(c.nextStart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">Werte nach „Materialisiert bis“ werden bei Abfragen live aus den Rohdaten ergänzt.</p>
          </section>
        </div>

        <section className="card p-6" aria-labelledby="jobs-title">
          <h2 id="jobs-title" className="font-semibold tracking-tight">
            Nächste geplante Jobs
          </h2>
          <table className="mt-4 w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2 text-left font-medium">Job</th>
                <th className="py-2 text-left font-medium">Zeitplan</th>
                <th className="py-2 text-left font-medium">Zuletzt</th>
                <th className="py-2 text-left font-medium">Nächster Lauf</th>
              </tr>
            </thead>
            <tbody>
              {info.appJobs.map((j) => (
                <tr key={j.name} className="border-b border-slate-100">
                  <td className="py-2">{j.label}</td>
                  <td className="py-2 font-mono text-xs">{j.cron}</td>
                  <td className="py-2 tabular-nums">{fmt(j.lastRun)}</td>
                  <td className="py-2 tabular-nums">{fmt(j.nextRun)}</td>
                </tr>
              ))}
              {info.dbJobs.map((j) => (
                <tr key={j.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{j.name}</td>
                  <td className="py-2 text-xs text-slate-500">TimescaleDB</td>
                  <td className="py-2">{j.status ?? "–"}</td>
                  <td className="py-2 tabular-nums">{fmt(j.nextRun)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">Netzfrequenz: alle 5 s in einen Ringpuffer im Arbeitsspeicher (keine Speicherung).</p>
        </section>
      </div>
    </>
  );
}
