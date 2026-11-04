import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { hasActiveAccount } from "@/lib/auth/registration";

/** Admin pages reachable without a session. */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/setup", "/admin/registrieren"];

/**
 * First line of defence for the admin area. Every admin page and route handler
 * checks the session again on its own (defence in depth).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/admin");

  if (!isApi && PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withNoIndex(NextResponse.next());
  }

  const session = await auth().api.getSession({ headers: request.headers });
  if (session) return withNoIndex(NextResponse.next());

  if (isApi) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const target = (await hasActiveAccount()) ? "/admin/login" : "/admin/setup";
  const url = new URL(target, request.url);
  if (target === "/admin/login" && pathname !== "/admin") url.searchParams.set("next", pathname + search);
  return withNoIndex(NextResponse.redirect(url));
}

function withNoIndex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
