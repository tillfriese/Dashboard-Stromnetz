import { z } from "zod";
import { abortSetup, hasActiveAccount, RegistrationError, startSetup } from "@/lib/auth/registration";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const notFound = () => new Response("Not found", { status: 404, headers: noStore });

const startSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(200),
});

/**
 * First-run setup. Only usable while no active account exists; afterwards it
 * permanently answers 404.
 */
export async function POST(request: Request) {
  if (await hasActiveAccount()) return notFound();
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Bitte Name und gültige E-Mail-Adresse angeben." }, { status: 400, headers: noStore });
  }
  try {
    const { token, expiresAt } = await startSetup(parsed.data);
    return Response.json({ token, expiresAt }, { headers: noStore });
  } catch (err) {
    if (err instanceof RegistrationError && err.status === 404) return notFound();
    throw err;
  }
}

/** Called when the passkey registration was cancelled: removes the half-created account. */
export async function DELETE(request: Request) {
  if (await hasActiveAccount()) return notFound();
  const body = await request.json().catch(() => null);
  const token = z.object({ token: z.string().min(10) }).safeParse(body);
  if (!token.success) return Response.json({ error: "Ungültig" }, { status: 400, headers: noStore });
  await abortSetup(token.data.token);
  return new Response(null, { status: 204, headers: noStore });
}
