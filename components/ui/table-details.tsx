import type { ReactNode } from "react";

/** Accessible table alternative for a chart, collapsed by default. */
export function TableDetails({ summary = "Als Tabelle anzeigen", head, rows }: { summary?: string; head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer rounded text-slate-500 hover:text-slate-900">{summary}</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-left tabular-nums">
          <thead className="sticky top-0 bg-surface text-xs text-slate-500">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
