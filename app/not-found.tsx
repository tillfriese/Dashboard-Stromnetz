import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-8">
      <div className="card p-7">
        <p className="section-label">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Seite nicht gefunden</h1>
        <p className="mt-2 text-sm text-slate-500">Diese Adresse gibt es nicht (mehr).</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
            Aktuelle Lage
          </Link>
          <Link href="/historie" className="rounded-xl border border-slate-200 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Historie
          </Link>
        </div>
      </div>
    </main>
  );
}
