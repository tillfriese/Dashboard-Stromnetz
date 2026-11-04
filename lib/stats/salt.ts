import { randomBytes } from "node:crypto";
import { getSetting, setSettings } from "@/lib/settings";

/*
 * Daily secret salt for session hashes. Stored encrypted (so a restart does not split today's
 * sessions); replaced at midnight Europe/Berlin – the previous salt is overwritten and gone, so
 * hashes of different days cannot be linked.
 */

const g = globalThis as unknown as { netzlageSalt?: { day: string; salt: string } };

export const berlinDay = (ms = Date.now()) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export async function rotateSalt(day = berlinDay()): Promise<string> {
  const salt = randomBytes(32).toString("base64url");
  await setSettings({ "stats.salt": JSON.stringify({ day, salt }) });
  g.netzlageSalt = { day, salt };
  return salt;
}

export async function dailySalt(): Promise<string> {
  const today = berlinDay();
  if (g.netzlageSalt?.day === today) return g.netzlageSalt.salt;
  const stored = await getSetting("stats.salt");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { day: string; salt: string };
      if (parsed.day === today) {
        g.netzlageSalt = parsed;
        return parsed.salt;
      }
    } catch {
      /* rotate below */
    }
  }
  return rotateSalt(today);
}
