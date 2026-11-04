import { auth } from "@/lib/auth";
import { collect, payloadSchema } from "@/lib/stats/collect";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8_192;
const done = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives visitor events from navigator.sendBeacon. Never sets cookies, never stores the IP.
 * Always answers quickly; invalid or filtered input is dropped silently (204).
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BYTES) return done(413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return done(400);
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return done(400);

  // Visits of signed-in admins are not counted.
  if (request.headers.get("cookie")?.includes("session_token")) {
    const session = await auth().api.getSession({ headers: request.headers }).catch(() => null);
    if (session) return done();
  }

  try {
    await collect(Array.isArray(parsed.data) ? parsed.data : [parsed.data], request.headers);
  } catch (err) {
    console.error("[collect]", (err as Error).message);
  }
  return done();
}
