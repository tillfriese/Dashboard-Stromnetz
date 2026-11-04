import { format, isValid, parse } from "date-fns";

/**
 * Parses a date typed by the user into an ISO date (yyyy-MM-dd).
 * Accepts "4.11.2026", "04.11.26", "2026-11-04" and "4/11/2026"; impossible dates (31.02.) give null.
 */
export function parseUserDate(text: string): string | null {
  const t = text.trim();
  for (const f of ["d.M.yyyy", "d.M.yy", "yyyy-MM-dd", "d/M/yyyy"]) {
    const d = parse(t, f, new Date());
    if (isValid(d) && d.getFullYear() >= 1900) return format(d, "yyyy-MM-dd");
  }
  return null;
}
