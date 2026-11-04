import { auth } from "@/lib/auth";
import { collect, payloadSchema } from "@/lib/stats/collect";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8_192;

/**
 * Admin check per session cookie, cached for a minute: every signed-in visitor sends several
 * beacons per page, and only the (few) admins are excluded from the statistics.
 */
const ROLE_TTL_MS = 60_000;
const roleCache = new Map<string, { admin: boolean; at: number }>();
async function isAdminRequest(request: Request): Promise<boolean> {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)(?:__Secure-)?[\w.-]*session_token=([^;]+)/)?.[1];
  if (!token) return false;
  const cached = roleCache.get(token);
  if (cached && Date.now() - cached.at < ROLE_TTL_MS) return cached.admin;
  const session = await auth().api.getSession({ headers: request.headers }).catch(() => null);
  const admin = (session?.user as { role?: string } | undefined)?.role === "admin";
  if (roleCache.size > 5_000) roleCache.clear();
  roleCache.set(token, { admin, at: Date.now() });
  return admin;
}
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

  // Visits of signed-in admins are not counted (regular accounts are counted like guests).
  if (await isAdminRequest(request)) return done();

  try {
    await collect(Array.isArray(parsed.data) ? parsed.data : [parsed.data], request.headers);
  } catch (err) {
    console.error("[collect]", (err as Error).message);
  }
  return done();
}
