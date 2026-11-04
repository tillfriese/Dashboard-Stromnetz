export function ProgressBar({ value, label, tone = "indigo" }: { value: number; label: string; tone?: "indigo" | "amber" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all duration-500 ${tone === "amber" ? "bg-amber-500" : "bg-indigo-600"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
