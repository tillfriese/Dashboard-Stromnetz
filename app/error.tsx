"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error boundary for all pages below the root layout (header and footer stay usable). */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-8">
      <div className="card p-7" role="alert">
        <p className="section-label">Fehler</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Diese Ansicht konnte nicht geladen werden</h1>
        <p className="mt-2 text-sm text-slate-500">
          Möglicherweise ist eine Datenquelle oder die Datenbank kurzzeitig nicht erreichbar. Bitte versuche es erneut.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => retry()}>
            Erneut versuchen
          </Button>
          <Link href="/" className="rounded-xl border border-slate-200 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Zur Startseite
          </Link>
        </div>
      </div>
    </main>
  );
}
