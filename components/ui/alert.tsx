import type { ReactNode } from "react";

const TONES = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-indigo-100 bg-indigo-50 text-indigo-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

export function Alert({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
