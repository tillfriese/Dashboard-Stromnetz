import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { abortSignup, RegistrationError, startSignup } from "@/lib/auth/registration";
import { clientIp } from "@/lib/stats/session";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;

/**
 * Fixed-window limit per client, stored in Better Auth's rate_limit table (shared by all app
 * instances, survives restarts). The key only holds a hash of the IP address.
 */
async function limited(ip: string): Promise<boolean> {
  const key = `signup-passkey:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
  const now = Date.now();
  const res = await db().execute<{ count: number }>(sql`
    INSERT INTO rate_limit (id, key, count, last_request) VALUES (${randomUUID()}, ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit.last_request < ${now - WINDOW_MS} THEN 1 ELSE rate_limit.count + 1 END,
      last_request = CASE WHEN rate_limit.last_request < ${now - WINDOW_MS} THEN ${now} ELSE rate_limit.last_request END
    RETURNING count`);
  return (res.rows[0]?.count ?? 0) > MAX_PER_WINDOW;
}

const schema = z.object({ name: z.string().trim().min(1).max(100), email: z.email().max(200) });

/**
 * Self-service sign-up with a passkey (step 1): creates the account and a short-lived ticket.
 * The client then registers the passkey with the ticket; without it the account is removed.
 * (Sign-up with e-mail and password goes through Better Auth's /api/auth/sign-up/email.)
 */
export async function POST(request: Request) {
  if (await limited(clientIp(request.headers))) {
    return Response.json({ error: "Zu viele Registrierungen. Bitte später erneut versuchen." }, { status: 429, headers: noStore });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bitte Name und gültige E-Mail-Adresse angeben." }, { status: 400, headers: noStore });
  try {
    const { token, expiresAt } = await startSignup(parsed.data);
    return Response.json({ token, expiresAt }, { headers: noStore });
  } catch (err) {
    if (err instanceof RegistrationError) return Response.json({ error: err.message }, { status: err.status, headers: noStore });
    throw err;
  }
}

/** Called when the passkey registration was cancelled: removes the half-created account. */
export async function DELETE(request: Request) {
  const parsed = z.object({ token: z.string().min(10) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültig" }, { status: 400, headers: noStore });
  await abortSignup(parsed.data.token);
  return new Response(null, { status: 204, headers: noStore });
}
