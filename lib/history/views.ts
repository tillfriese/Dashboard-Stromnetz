import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";

export const MAX_VIEWS_PER_USER = 100;

export type SavedViewDto = { id: string; name: string; params: string; createdAt?: Date };

/** The saved views of one user, newest first. */
export async function listViews(userId: string): Promise<SavedViewDto[]> {
  const rows = await db()
    .select()
    .from(savedViews)
    .where(eq(savedViews.userId, userId))
    .orderBy(desc(savedViews.createdAt))
    .limit(MAX_VIEWS_PER_USER);
  return rows.map((v) => ({ id: v.id, name: v.name, params: (v.query as { params: string }).params, createdAt: v.createdAt }));
}

