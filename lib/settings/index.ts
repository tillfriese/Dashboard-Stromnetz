import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decrypt, encrypt, mask, parseKey } from "./crypto";

export const SOURCE_IDS = ["smard", "energycharts", "entsoe", "gridradar", "stromgedacht"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** Known settings with their env fallback. Secrets are never returned in clear text to the UI. */
export const SETTING_DEFS = {
  "entsoe.token": { secret: true, env: "ENTSOE_API_TOKEN" },
  "gridradar.token": { secret: true, env: "GRIDRADAR_API_TOKEN" },
  "stromgedacht.zip": { secret: false, env: "STROMGEDACHT_ZIP", default: "70173" },
  "app.publicMode": { secret: false, env: "PUBLIC_MODE", default: "false" },
  ...Object.fromEntries(SOURCE_IDS.map((id) => [`source.${id}.enabled`, { secret: false, default: "true" }])),
  // Visitor statistics: daily salt for session hashes (internal, never shown) and raw-data retention.
  "stats.salt": { secret: true, internal: true },
  "stats.retentionDays": { secret: false, default: "90" },
} as Record<string, { secret: boolean; env?: string; default?: string; internal?: boolean }>;

export type SettingKey = keyof typeof SETTING_DEFS;

function key() {
  return parseKey(process.env.SETTINGS_ENCRYPTION_KEY);
}

export type ResolvedSetting = { value: string | null; origin: "db" | "env" | "default" | "none" };

/**
 * Reads settings fresh from the DB on every call (no caching), so a new token
 * takes effect on the next adapter run without restarting the app.
 * Falls back to the env variable, then to the default.
 */
export async function getSettings(keys: string[]): Promise<Record<string, ResolvedSetting>> {
  const rows = keys.length ? await db().select().from(settings).where(inArray(settings.key, keys)) : [];
  const stored = new Map(rows.map((r) => [r.key, r.valueEncrypted]));
  const out: Record<string, ResolvedSetting> = {};
  for (const k of keys) {
    const def = SETTING_DEFS[k];
    const enc = stored.get(k);
    if (enc !== undefined) {
      out[k] = { value: decrypt(enc, key(), k), origin: "db" };
    } else if (def?.env && process.env[def.env]) {
      out[k] = { value: process.env[def.env]!, origin: "env" };
    } else if (def?.default !== undefined) {
      out[k] = { value: def.default, origin: "default" };
    } else {
      out[k] = { value: null, origin: "none" };
    }
  }
  return out;
}

export async function getSetting(k: string): Promise<string | null> {
  return (await getSettings([k]))[k]?.value ?? null;
}

export async function isSourceEnabled(id: SourceId): Promise<boolean> {
  return (await getSetting(`source.${id}.enabled`)) !== "false";
}

export async function isPublicMode(): Promise<boolean> {
  return (await getSetting("app.publicMode")) === "true";
}

/** Writes (or with `null` deletes) settings, encrypted with AES-256-GCM. */
export async function setSettings(values: Record<string, string | null>) {
  const k = key();
  await db().transaction(async (tx) => {
    for (const [name, value] of Object.entries(values)) {
      if (!(name in SETTING_DEFS)) throw new Error(`Unbekannte Einstellung: ${name}`);
      if (value === null) {
        await tx.delete(settings).where(eq(settings.key, name));
      } else {
        const valueEncrypted = encrypt(value, k, name);
        await tx
          .insert(settings)
          .values({ key: name, valueEncrypted, updatedAt: new Date() })
          .onConflictDoUpdate({ target: settings.key, set: { valueEncrypted, updatedAt: new Date() } });
      }
    }
  });
}

/** Settings as shown in the admin UI: secrets masked. */
export async function getSettingsForUi() {
  const resolved = await getSettings(Object.keys(SETTING_DEFS).filter((k) => !SETTING_DEFS[k]?.internal));
  return Object.fromEntries(
    Object.entries(resolved).map(([k, s]) => {
      const secret = SETTING_DEFS[k]?.secret;
      return [k, { origin: s.origin, value: secret ? (s.value ? mask(s.value) : null) : s.value, configured: s.value != null }];
    }),
  );
}
