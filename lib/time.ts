import { addDays, addMonths, startOfDay, startOfISOWeek, startOfMonth } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/** All instants are UTC epoch milliseconds; calendar logic happens in Europe/Berlin. */
export const TZ = "Europe/Berlin";
export const QUARTER_HOUR_MS = 15 * 60_000;

/** Applies a calendar function in Berlin local time and converts back to UTC ms. */
function inBerlin(ms: number, fn: (local: Date) => Date): number {
  return fromZonedTime(fn(toZonedTime(ms, TZ)), TZ).getTime();
}

export const startOfBerlinDay = (ms: number) => inBerlin(ms, startOfDay);
export const startOfBerlinWeek = (ms: number) => inBerlin(ms, startOfISOWeek);
export const startOfBerlinMonth = (ms: number) => inBerlin(ms, startOfMonth);
export const addBerlinDays = (ms: number, days: number) => inBerlin(ms, (d) => addDays(d, days));
export const addBerlinMonths = (ms: number, months: number) => inBerlin(ms, (d) => addMonths(d, months));

/** "2026-03-29" (Berlin calendar date) -> UTC ms of local midnight. */
export function berlinDateToMs(date: string): number {
  return fromZonedTime(`${date}T00:00:00`, TZ).getTime();
}

/** Berlin month label, e.g. "2026-03". */
export function berlinMonthLabel(ms: number): string {
  const d = toZonedTime(ms, TZ);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Splits [from, to) into Berlin calendar months (first/last may be partial). */
export function berlinMonths(from: number, to: number): { label: string; from: number; to: number }[] {
  const out: { label: string; from: number; to: number }[] = [];
  for (let m = startOfBerlinMonth(from); m < to; m = addBerlinMonths(m, 1)) {
    out.push({ label: berlinMonthLabel(m), from: Math.max(m, from), to: Math.min(addBerlinMonths(m, 1), to) });
  }
  return out;
}

/** Start timestamps of all Berlin weeks (Monday 00:00 local) that overlap [from, to). */
export function berlinWeeks(from: number, to: number): number[] {
  const out: number[] = [];
  for (let w = startOfBerlinWeek(from); w < to; w = addBerlinDays(w, 7)) out.push(w);
  return out;
}
