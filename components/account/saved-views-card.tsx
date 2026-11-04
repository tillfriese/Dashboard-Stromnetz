"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatBerlin } from "@/lib/format";

type Row = { id: string; name: string; params: string; createdAt: string | null };

/** The user's saved "Historie" views: open or delete. */
export function SavedViewsCard({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function remove(v: Row) {
    if (!confirm(`Ansicht „${v.name}“ löschen?`)) return;
    setError(null);
    const res = await fetch(`/api/views?id=${encodeURIComponent(v.id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Löschen fehlgeschlagen.");
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== v.id));
  }

  return (
    <section className="card p-6" aria-labelledby="views-title">
      <h2 id="views-title" className="font-semibold tracking-tight">
        Gespeicherte Ansichten
      </h2>
      <p className="mt-1 text-sm text-slate-500">Nur für dich sichtbar. Neue Ansichten speicherst du in der Historie.</p>
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">
          Noch keine Ansichten.{" "}
          <Link href="/historie" className="font-medium text-indigo-600 hover:underline">
            Zur Historie
          </Link>
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={`/historie?${v.params}`} className="font-medium text-slate-900 hover:text-indigo-600 hover:underline">
                  {v.name}
                </Link>
                {v.createdAt ? <p className="text-xs text-slate-500 tabular-nums">gespeichert {formatBerlin(Date.parse(v.createdAt), "dd.MM.yyyy HH:mm")}</p> : null}
              </div>
              <Button variant="ghost" className="px-2 py-1 text-red-700" onClick={() => remove(v)} aria-label={`Ansicht ${v.name} löschen`}>
                Löschen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
