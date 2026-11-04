import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { RegistrationError } from "@/lib/auth/registration";

export type Role = "user" | "admin";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  passkeys: number;
  hasPassword: boolean;
  views: number;
  lastSeenAt: string | null;
};

/** All active accounts (with a passkey or password); half-finished sign-ups are left out. */
export async function listUsers(): Promise<UserRow[]> {
  const res = await db().execute<{
    id: string;
    name: string;
    email: string;
    role: Role;
    created_at: Date;
    passkeys: number;
    has_password: boolean;
    views: number;
    last_seen_at: Date | null;
  }>(sql`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
      (SELECT count(*)::int FROM passkey p WHERE p.user_id = u.id) AS passkeys,
      EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.password IS NOT NULL) AS has_password,
      (SELECT count(*)::int FROM saved_views v WHERE v.user_id = u.id) AS views,
      (SELECT max(s.updated_at) FROM session s WHERE s.user_id = u.id) AS last_seen_at
    FROM "user" u
    WHERE EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)
       OR EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.password IS NOT NULL)
    ORDER BY (u.role = 'admin') DESC, u.created_at`);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: new Date(r.created_at).toISOString(),
    passkeys: r.passkeys,
    hasPassword: r.has_password,
    views: r.views,
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
  }));
}

/** SQL condition: user (alias u) can sign in – has a passkey or a password. */
const ACTIVE = `(EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)
  OR EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.password IS NOT NULL))`;

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/**
 * Runs a role change or deletion serialised by an advisory lock. Inside the lock the actor must
 * still be an active admin (another admin may have demoted or deleted them a moment ago), and
 * at least one active admin – one who can actually sign in, pending invitations do not count –
 * must remain besides the affected user. Otherwise /admin/setup would reopen for everyone.
 */
async function withAdminGuard(actorId: string, userId: string, removesAdmin: boolean, fn: (tx: Tx) => Promise<number>) {
  await db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('user-roles'))`);
    const actor = await tx.execute<{ ok: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = ${actorId} AND u.role = 'admin' AND ${sql.raw(ACTIVE)}) AS ok`,
    );
    if (!actor.rows[0]?.ok) throw new RegistrationError("Keine Admin-Rechte", 403);
    if (removesAdmin) {
      const others = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM "user" u WHERE u.role = 'admin' AND u.id <> ${userId} AND ${sql.raw(ACTIVE)}`,
      );
      if ((others.rows[0]?.n ?? 0) < 1) throw new RegistrationError("Es muss mindestens ein Admin bleiben.", 409);
    }
    if (!(await fn(tx))) throw new RegistrationError("Nutzer nicht gefunden.", 404);
  });
}

/** Changes a role. Admins cannot demote themselves; another admin has to do it. */
export async function setRole(actorId: string, userId: string, role: Role): Promise<void> {
  if (actorId === userId && role !== "admin") throw new RegistrationError("Du kannst dir die Admin-Rechte nicht selbst entziehen.", 409);
  await withAdminGuard(actorId, userId, role !== "admin", async (tx) => {
    const res = await tx.execute(sql`UPDATE "user" SET role = ${role}, updated_at = now() WHERE id = ${userId}`);
    return res.rowCount ?? 0;
  });
}

/** Deletes an account including sessions, passkeys and saved views (cascades). Not oneself. */
export async function deleteUser(actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw new RegistrationError("Das eigene Konto kann hier nicht gelöscht werden.", 409);
  await withAdminGuard(actorId, userId, true, async (tx) => {
    const res = await tx.execute(sql`DELETE FROM "user" WHERE id = ${userId}`);
    return res.rowCount ?? 0;
  });
}
