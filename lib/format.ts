import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";

export const DISPLAY_TZ = "Europe/Berlin";

const nf = (digits: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Formats a number in German notation; returns an en dash for missing values. */
export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return nf(digits).format(value);
}

/** Converts MW to GW and formats it, e.g. 54_400 -> "54,4". */
export function formatGW(mw: number | null | undefined, digits = 1): string {
  return formatNumber(mw == null ? mw : mw / 1000, digits);
}

/** Formats a value with an explicit sign, using a real minus sign. */
export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const abs = nf(digits).format(Math.abs(value));
  if (abs === nf(digits).format(0)) return abs;
  return value > 0 ? `+${abs}` : `−${abs}`;
}

/** Formats a UTC timestamp (ms) in Europe/Berlin, honouring DST. */
export function formatBerlin(tsMs: number, pattern = "dd.MM.yyyy HH:mm"): string {
  return formatInTimeZone(tsMs, DISPLAY_TZ, pattern, { locale: de });
}
