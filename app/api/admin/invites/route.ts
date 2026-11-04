import { z } from "zod";
import { authBaseURL } from "@/lib/auth";
import { createInvite, listPendingInvites, RegistrationError, revokeInvite } from "@/lib/auth/registration";
import { requireAdminApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  return Response.json({ invites: await listPendingInvites() }, { headers: noStore });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.email().max(200) });

/** Creates a one-time invitation link (valid 24 h). The link is only shown once. */
export async function POST(request: Request) {
  const { session, response } = await requireAdminApi(request);
  if (response) return response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bitte Name und gültige E-Mail angeben." }, { status: 400, headers: noStore });
  try {
    const { token, expiresAt } = await createInvite({ ...parsed.data, createdBy: session.user.id });
    const link = new URL(`/admin/registrieren?token=${token}`, authBaseURL()).toString();
    return Response.json({ link, expiresAt }, { status: 201, headers: noStore });
  } catch (err) {
    if (err instanceof RegistrationError) return Response.json({ error: err.message }, { status: err.status, headers: noStore });
    throw err;
  }
}

export async function DELETE(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId fehlt" }, { status: 400, headers: noStore });
  const ok = await revokeInvite(userId);
  return new Response(null, { status: ok ? 204 : 404, headers: noStore });
}
