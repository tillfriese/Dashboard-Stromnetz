import { z } from "zod";
import { deleteUser, listUsers, setRole } from "@/lib/admin/users";
import { RegistrationError } from "@/lib/auth/registration";
import { requireAdminApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

const fail = (err: unknown) => {
  if (err instanceof RegistrationError) return Response.json({ error: err.message }, { status: err.status, headers: noStore });
  throw err;
};

export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  return Response.json({ users: await listUsers() }, { headers: noStore });
}

const patchSchema = z.object({ id: z.string().min(1).max(100), role: z.enum(["user", "admin"]) });

/** Promote to admin or demote to user. */
export async function PATCH(request: Request) {
  const { session, response } = await requireAdminApi(request);
  if (response) return response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Eingabe" }, { status: 400, headers: noStore });
  try {
    await setRole(session.user.id, parsed.data.id, parsed.data.role);
  } catch (err) {
    return fail(err);
  }
  return Response.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const { session, response } = await requireAdminApi(request);
  if (response) return response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "ID fehlt" }, { status: 400, headers: noStore });
  try {
    await deleteUser(session.user.id, id);
  } catch (err) {
    return fail(err);
  }
  return new Response(null, { status: 204, headers: noStore });
}
