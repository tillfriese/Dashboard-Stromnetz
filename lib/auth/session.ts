import { headers } from "next/headers";
import { auth } from "./index";

export type AdminSession = NonNullable<Awaited<ReturnType<ReturnType<typeof auth>["api"]["getSession"]>>>;

/** Server-side session check for admin pages and route handlers. */
export async function getAdminSession(reqHeaders?: Headers): Promise<AdminSession | null> {
  return auth().api.getSession({ headers: reqHeaders ?? (await headers()) });
}

/** Use at the top of every /api/admin route handler. Returns a 401 response when unauthenticated. */
export async function requireAdminApi(request: Request): Promise<
  { session: AdminSession; response?: undefined } | { session?: undefined; response: Response }
> {
  const session = await getAdminSession(request.headers);
  if (!session) {
    return { response: Response.json({ error: "Nicht angemeldet" }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  }
  return { session };
}
