import { headers } from "next/headers";
import { auth } from "./index";

export type UserSession = NonNullable<Awaited<ReturnType<ReturnType<typeof auth>["api"]["getSession"]>>>;

export const isAdmin = (s: UserSession | null | undefined) => (s?.user as { role?: string } | undefined)?.role === "admin";

/** Session of any signed-in user (or null for guests). */
export async function getUserSession(reqHeaders?: Headers): Promise<UserSession | null> {
  return auth().api.getSession({ headers: reqHeaders ?? (await headers()) });
}

/** Session only if the signed-in user is an admin. */
export async function getAdminSession(reqHeaders?: Headers): Promise<UserSession | null> {
  const s = await getUserSession(reqHeaders);
  return isAdmin(s) ? s : null;
}

const noStore = { "Cache-Control": "no-store" };

/** Use at the top of every /api/admin route handler: 401 without login, 403 without admin role. */
export async function requireAdminApi(request: Request): Promise<
  { session: UserSession; response?: undefined } | { session?: undefined; response: Response }
> {
  const session = await getUserSession(request.headers);
  if (!session) return { response: Response.json({ error: "Nicht angemeldet" }, { status: 401, headers: noStore }) };
  if (!isAdmin(session)) return { response: Response.json({ error: "Keine Admin-Rechte" }, { status: 403, headers: noStore }) };
  return { session };
}

/** For user endpoints (e.g. saved views): 401 without login. */
export async function requireUserApi(request: Request): Promise<
  { session: UserSession; response?: undefined } | { session?: undefined; response: Response }
> {
  const session = await getUserSession(request.headers);
  if (!session) return { response: Response.json({ error: "Bitte anmelden" }, { status: 401, headers: noStore }) };
  return { session };
}
