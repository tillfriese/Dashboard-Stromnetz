import type { ReactNode } from "react";

export function Card({ children, className = "", labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={`card p-6 sm:p-7 ${className}`} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function CardTitle({ id, children, sub, right }: { id?: string; children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="font-semibold tracking-tight text-slate-900">
          {children}
        </h2>
        {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Per-card error message: one failing source does not affect the rest of the page. */
export function CardError({ message = "Daten derzeit nicht verfügbar." }: { message?: string }) {
  return (
    <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
      {message}
    </p>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "amber" }) {
  const t = { slate: "bg-slate-100 text-slate-600", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-800" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${t}`}>{children}</span>;
}
