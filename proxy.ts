import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { hasActiveAccount } from "@/lib/auth/registration";

/** Admin pages reachable without a session. */
const PUBLIC_ADMIN_PATHS = ["/admin/setup", "/admin/registrieren"];

/**
 * First line of defence for the admin area. Every admin page and route handler
 * checks the session again on its own (defence in depth).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/admin");

  // Once an active account exists, the setup page is gone for good. Answered here with a real
  // 404 status – the page itself is streamed (loading UI), so its status could already be 200.
  if (pathname === "/admin/setup" && (await hasActiveAccount())) {
    return withNoIndex(new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  }

  // The former admin login lives on the common sign-in page now.
  if (pathname === "/admin/login") {
    const url = new URL("/anmelden", request.url);
    url.searchParams.set("next", request.nextUrl.searchParams.get("next") ?? "/admin");
    return withNoIndex(NextResponse.redirect(url));
  }

  if (!isApi && PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withNoIndex(NextResponse.next());
  }

  const noStore = { "Cache-Control": "no-store" };
  const session = await auth().api.getSession({ headers: request.headers });
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (session && role === "admin") return withNoIndex(NextResponse.next());

  if (session) {
    // Signed in, but no admin rights.
    if (isApi) return NextResponse.json({ error: "Keine Admin-Rechte" }, { status: 403, headers: noStore });
    return withNoIndex(NextResponse.redirect(new URL("/konto?hinweis=keine-admin-rechte", request.url)));
  }

  if (isApi) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers: noStore });

  // Before the first admin exists, the admin area leads to the first-run setup.
  if (!(await hasActiveAccount())) return withNoIndex(NextResponse.redirect(new URL("/admin/setup", request.url)));
  const url = new URL("/anmelden", request.url);
  url.searchParams.set("next", pathname + search);
  return withNoIndex(NextResponse.redirect(url));
}

function withNoIndex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
