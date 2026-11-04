/** Friendly placeholder shown while the database has no data yet. */
export function SetupNotice() {
  return (
    <div className="card flex items-start gap-4 p-6" role="status">
      <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
      <div>
        <p className="font-semibold tracking-tight">Daten werden eingerichtet</p>
        <p className="mt-1 text-sm text-slate-500">
          Die Datenbank ist noch leer. Sobald der erste Import gelaufen ist, erscheinen hier die aktuellen Werte.
        </p>
      </div>
    </div>
  );
}
