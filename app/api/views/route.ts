import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";
import { parseQuery, serializeQuery } from "@/lib/history/query";

export const dynamic = "force-dynamic";

const MAX_VIEWS = 500;
const PER_CLIENT_PER_HOUR = 10;
const hits = new Map<string, number[]>();

/** Small in-memory rate limit per client (IP is only used transiently, never stored). */
function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_CLIENT_PER_HOUR) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

/** Saved views of the "Historie" page (shared with everyone). */
export async function GET() {
  const views = await db().select().from(savedViews).orderBy(desc(savedViews.createdAt)).limit(100);
  return Response.json(
    { views: views.map((v) => ({ id: v.id, name: v.name, params: (v.query as { params: string }).params, createdAt: v.createdAt })) },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}

const schema = z.object({ name: z.string().trim().min(1).max(60), params: z.string().max(2000) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Name (max. 60 Zeichen) und Ansicht angeben." }, { status: 400 });
  if (limited(request)) return Response.json({ error: "Zu viele gespeicherte Ansichten. Bitte später erneut versuchen." }, { status: 429 });
  const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(savedViews)) as [{ n: number }];
  if (n >= MAX_VIEWS) return Response.json({ error: "Die maximale Anzahl gespeicherter Ansichten ist erreicht." }, { status: 409 });
  // Normalise through the parser: only valid, known parameters are stored.
  const params = serializeQuery(parseQuery(new URLSearchParams(parsed.data.params))).toString();
  const [view] = await db().insert(savedViews).values({ name: parsed.data.name, query: { params } }).returning();
  return Response.json({ id: view!.id, name: view!.name, params }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
