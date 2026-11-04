import { getAuthenticatorName } from "@better-auth/passkey";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { passkey } from "@/lib/db/auth-schema";

export async function listPasskeys(userId: string) {
  const rows = await db().select().from(passkey).where(eq(passkey.userId, userId)).orderBy(desc(passkey.createdAt));
  return rows.map((p) => ({
    id: p.id,
    name: p.name ?? "Passkey",
    device: getAuthenticatorName(p.aaguid) ?? (p.deviceType === "multiDevice" ? "Synchronisierter Passkey" : "Gerätegebundener Passkey"),
    backedUp: p.backedUp,
    createdAt: p.createdAt?.toISOString() ?? null,
    lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
  }));
}
