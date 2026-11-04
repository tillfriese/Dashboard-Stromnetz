import { parseISO } from "date-fns";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Resolution } from "@/lib/history/query";

/** Formats a Berlin-local bucket label ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm") for a resolution. */
export function bucketLabel(label: string, res: Resolution, short = false): string {
  const d = parseISO(label);
  switch (res) {
    case "year":
      return format(d, "yyyy");
    case "month":
      return format(d, short ? "MMM yy" : "MMMM yyyy", { locale: de });
    case "week":
      return short ? format(d, "dd.MM.yy") : `Woche ab ${format(d, "dd.MM.yyyy")}`;
    case "day":
      return format(d, short ? "dd.MM." : "EEE dd.MM.yyyy", { locale: de });
    default:
      return format(d, short ? "dd.MM. HH:mm" : "EEE dd.MM.yyyy HH:mm", { locale: de });
  }
}

export const shortDate = (iso: string) => format(parseISO(iso), "dd.MM.yyyy");
