import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { passkey, registrationTokens, user } from "@/lib/db/auth-schema";
import { SIGNUP_REFUSED } from "./messages";
import { hashToken, newToken } from "./tokens";

export type RegistrationPurpose = "setup" | "invite" | "recovery" | "signup";

export const TOKEN_TTL_MS: Record<RegistrationPurpose, number> = {
  setup: 10 * 60_000,
  invite: 24 * 60 * 60_000,
  recovery: 15 * 60_000,
  signup: 10 * 60_000,
};

/** SQL condition: the user (alias u) can sign in – has a passkey or a password. */
const HAS_CREDENTIAL = `(EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)
  OR EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.password IS NOT NULL))`;

const SETUP_LOCK_ID = 727_002;

export class RegistrationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * True once an active admin exists (an admin account with a passkey or password). Until then
 * /admin/setup creates the first admin; afterwards the setup is closed for good.
 */
export async function hasActiveAccount(): Promise<boolean> {
  const rows = await db().execute<{ exists: boolean }>(
    sql.raw(`SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.role = 'admin' AND ${HAS_CREDENTIAL}) AS "exists"`),
  );
  return rows.rows[0]?.exists === true;
}

export async function hasPassword(userId: string): Promise<boolean> {
  const rows = await db().execute<{ exists: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM account WHERE user_id = ${userId} AND password IS NOT NULL) AS "exists"`,
  );
  return rows.rows[0]?.exists === true;
}

/** Removes half-created accounts: no passkey, no password and no usable registration ticket. */
export async function cleanupPendingUsers(): Promise<number> {
  const res = await db().execute(sql`
    DELETE FROM "user" u
    WHERE NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.password IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM registration_tokens t
        WHERE t.user_id = u.id AND t.used_at IS NULL AND t.expires_at > now()
      )`);
  return res.rowCount ?? 0;
}

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * First-run setup: creates the (still inactive) admin account without password
 * and returns a short-lived ticket used to register the first passkey.
 * Refused for good once any active account exists.
 */
export async function startSetup(input: { name: string; email: string }): Promise<{ token: string; expiresAt: Date }> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETUP_LOCK_ID})`);
    const active = await tx.execute<{ exists: boolean }>(
      sql.raw(`SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.role = 'admin' AND ${HAS_CREDENTIAL}) AS "exists"`),
    );
    if (active.rows[0]?.exists) throw new RegistrationError("Not found", 404);

    // Remove abandoned setup attempts (admins without any credential); normal users stay.
    await tx.execute(sql.raw(`DELETE FROM "user" u WHERE u.role = 'admin' AND NOT ${HAS_CREDENTIAL}`));
    const email = normaliseEmail(input.email);
    // E-mail addresses of self-service accounts are not verified, so someone could have claimed
    // the operator's address before the setup. Whoever completes the setup becomes admin anyway,
    // so a normal account with this address is replaced (it loses its saved views and sessions).
    await tx.execute(sql`DELETE FROM "user" WHERE email = ${email} AND role <> 'admin'`);

    const userId = randomUUID();
    await tx.insert(user).values({ id: userId, name: input.name.trim(), email, role: "admin" });
    const token = newToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.setup);
    await tx.insert(registrationTokens).values({ tokenHash: hashToken(token), userId, purpose: "setup", expiresAt });
    return { token, expiresAt };
  });
}

/** Cancels a setup whose passkey registration was aborted: deletes the half-created account. */
export async function abortSetup(token: string): Promise<boolean> {
  const res = await db().execute(sql`
    DELETE FROM "user" u
    USING registration_tokens t
    WHERE t.token_hash = ${hashToken(token)} AND t.purpose = 'setup' AND t.user_id = u.id
      AND NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)`);
  return (res.rowCount ?? 0) > 0;
}

/** Invites another admin. Creates an inactive account plus a 24 h ticket. */
export async function createInvite(input: { name: string; email: string; createdBy: string }) {
  const email = normaliseEmail(input.email);
  await cleanupPendingUsers();
  const existing = await db().select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing.length > 0) throw new RegistrationError("Für diese E-Mail-Adresse gibt es bereits einen Account.", 409);

  const userId = randomUUID();
  const token = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.invite);
  await db().transaction(async (tx) => {
    await tx.insert(user).values({ id: userId, name: input.name.trim(), email, role: "admin" });
    await tx
      .insert(registrationTokens)
      .values({ tokenHash: hashToken(token), userId, purpose: "invite", expiresAt, createdBy: input.createdBy });
  });
  return { token, expiresAt, userId };
}

/**
 * Self-service sign-up with a passkey: creates a normal (inactive) account and a 10-minute
 * ticket for registering its first passkey. Without a passkey the account is cleaned up again.
 */
export async function startSignup(input: { name: string; email: string }): Promise<{ token: string; expiresAt: Date }> {
  const email = normaliseEmail(input.email);
  await cleanupPendingUsers();
  const existing = await db().select({ id: user.id }).from(user).where(eq(user.email, email));
  // Neutral wording (same as the password sign-up): no confirmation which addresses are taken.
  if (existing.length > 0) throw new RegistrationError(SIGNUP_REFUSED, 409);
  const userId = randomUUID();
  const token = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.signup);
  await db().transaction(async (tx) => {
    await tx.insert(user).values({ id: userId, name: input.name.trim(), email, role: "user" });
    await tx.insert(registrationTokens).values({ tokenHash: hashToken(token), userId, purpose: "signup", expiresAt });
  });
  return { token, expiresAt };
}

/** Cancels an aborted passkey sign-up (only accounts without any credential are removed). */
export async function abortSignup(token: string): Promise<boolean> {
  const res = await db().execute(sql`
    DELETE FROM "user" u
    USING registration_tokens t
    WHERE t.token_hash = ${hashToken(token)} AND t.purpose IN ('signup', 'setup') AND t.user_id = u.id
      AND NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.password IS NOT NULL)`);
  return (res.rowCount ?? 0) > 0;
}

/** Recovery ticket for an existing account (used by the admin:recovery CLI). */
export async function createRecovery(email: string) {
  const rows = await db().select({ id: user.id }).from(user).where(eq(user.email, normaliseEmail(email)));
  const target = rows[0];
  if (!target) throw new RegistrationError("Kein Account mit dieser E-Mail-Adresse.", 404);
  const token = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.recovery);
  await db().insert(registrationTokens).values({ tokenHash: hashToken(token), userId: target.id, purpose: "recovery", expiresAt });
  return { token, expiresAt };
}

export type TicketInfo = {
  userId: string;
  name: string;
  email: string;
  purpose: RegistrationPurpose;
  expiresAt: Date;
};

/** Looks up a still valid (unused, unexpired) ticket without consuming it. */
export async function peekToken(token: string | null | undefined): Promise<TicketInfo | null> {
  if (!token) return null;
  const rows = await db()
    .select({
      userId: registrationTokens.userId,
      purpose: registrationTokens.purpose,
      expiresAt: registrationTokens.expiresAt,
      name: user.name,
      email: user.email,
    })
    .from(registrationTokens)
    .innerJoin(user, eq(user.id, registrationTokens.userId))
    .where(
      and(
        eq(registrationTokens.tokenHash, hashToken(token)),
        isNull(registrationTokens.usedAt),
        gt(registrationTokens.expiresAt, new Date()),
      ),
    );
  return rows[0] ?? null;
}

/** Atomically marks a ticket as used; returns null if it was invalid or already used. */
export async function consumeToken(token: string): Promise<{ userId: string; purpose: RegistrationPurpose } | null> {
  const rows = await db()
    .update(registrationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(registrationTokens.tokenHash, hashToken(token)),
        isNull(registrationTokens.usedAt),
        gt(registrationTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: registrationTokens.userId, purpose: registrationTokens.purpose });
  return rows[0] ?? null;
}

/** Number of passkeys of a user (used to protect the last one). */
export async function countPasskeys(userId: string): Promise<number> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(passkey).where(eq(passkey.userId, userId));
  return rows[0]?.n ?? 0;
}

/** Open invitations for the "System" tab. */
export async function listPendingInvites() {
  return db()
    .select({ userId: user.id, name: user.name, email: user.email, expiresAt: registrationTokens.expiresAt })
    .from(registrationTokens)
    .innerJoin(user, eq(user.id, registrationTokens.userId))
    .where(
      and(
        eq(registrationTokens.purpose, "invite"),
        isNull(registrationTokens.usedAt),
        gt(registrationTokens.expiresAt, new Date()),
        sql`NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = ${user.id})`,
      ),
    );
}

/** Revokes an open invitation by deleting the inactive invited account. */
export async function revokeInvite(userId: string) {
  const res = await db().execute(sql`
    DELETE FROM "user" u WHERE u.id = ${userId}
      AND NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = u.id)`);
  return (res.rowCount ?? 0) > 0;
}
