import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";
import { parseQuery, serializeQuery } from "@/lib/history/query";
import { listViews, MAX_VIEWS_PER_USER } from "@/lib/history/views";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };


/** Saved views of the "Historie" page – private per account. Guests get an empty list. */
export async function GET(request: Request) {
  const { session } = await requireUserApi(request);
  if (!session) return Response.json({ views: [] }, { headers: noStore });
  return Response.json({ views: await listViews(session.user.id) }, { headers: noStore });
}

const schema = z.object({ name: z.string().trim().min(1).max(60), params: z.string().max(2000) });

export async function POST(request: Request) {
  const { session, response } = await requireUserApi(request);
  if (!session) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Name (max. 60 Zeichen) und Ansicht angeben." }, { status: 400, headers: noStore });
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(savedViews)
    .where(eq(savedViews.userId, session.user.id))) as [{ n: number }];
  if (n >= MAX_VIEWS_PER_USER) {
    return Response.json({ error: `Maximal ${MAX_VIEWS_PER_USER} Ansichten pro Konto. Bitte alte Ansichten löschen.` }, { status: 409, headers: noStore });
  }
  // Normalise through the parser: only valid, known parameters are stored.
  const params = serializeQuery(parseQuery(new URLSearchParams(parsed.data.params))).toString();
  const [view] = await db().insert(savedViews).values({ name: parsed.data.name, query: { params }, userId: session.user.id }).returning();
  return Response.json({ id: view!.id, name: view!.name, params }, { status: 201, headers: noStore });
}

/** Deletes one of the user's own views (`?id=`). */
export async function DELETE(request: Request) {
  const { session, response } = await requireUserApi(request);
  if (!session) return response;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Ungültige ID" }, { status: 400, headers: noStore });
  const deleted = await db()
    .delete(savedViews)
    .where(and(eq(savedViews.id, id.data), eq(savedViews.userId, session.user.id)))
    .returning({ id: savedViews.id });
  if (!deleted.length) return Response.json({ error: "Nicht gefunden" }, { status: 404, headers: noStore });
  return new Response(null, { status: 204, headers: noStore });
}
