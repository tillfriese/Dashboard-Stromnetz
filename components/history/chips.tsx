"use client";

import { Button } from "@/components/ui/button";
import { CARRIERS } from "@/lib/carriers";
import { describeCondition, type HistoryQuery, RESOLUTION_LABEL, type Resolution } from "@/lib/history/query";
import { shortDate } from "./format";

export function FilterChips({
  query: q,
  res,
  update,
  onReset,
}: {
  query: HistoryQuery;
  res: Resolution;
  update: (p: Partial<HistoryQuery>) => void;
  onReset: () => void;
}) {
  const chip = "rounded-full border border-slate-200 bg-surface px-3 py-1 text-xs font-medium text-slate-700 tabular-nums";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <ul className="flex flex-wrap gap-2" aria-label="Aktive Filter">
        <li className={chip}>
          {shortDate(q.from)} – {shortDate(q.to)}
        </li>
        <li className={chip}>{RESOLUTION_LABEL[res]}</li>
        <li className={chip}>{q.regions.length === 4 ? "Deutschland (alle Regelzonen)" : q.regions.join(" + ")}</li>
        <li className={chip}>
          {q.carriers.length} von {CARRIERS.length} Energieträgern
        </li>
        {q.compare ? <li className={chip}>mit Vorjahr</li> : null}
        {q.conditions.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              onClick={() => update({ conditions: q.conditions.filter((_, j) => j !== i) })}
              aria-label={`Bedingung entfernen: ${describeCondition(c)}`}
            >
              {describeCondition(c)} <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
      <Button onClick={onReset}>Zurücksetzen</Button>
    </div>
  );
}
