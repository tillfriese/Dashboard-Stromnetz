import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const rangeSchema = z.object({ from: date, to: date }).refine((r) => r.from <= r.to, "from <= to");

export function parseRange(url: URL) {
  return rangeSchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
}
