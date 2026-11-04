import { z } from "zod";
import { pool } from "@/lib/db";
import { countryOf } from "./geo";
import { dailySalt } from "./salt";
import { clientIp, referrerDomain, visitId } from "./session";
import { isBot, parseUA } from "./ua";

/* Validation of beacons sent by the client tracker (components/analytics/tracker.tsx). */

const path = z.string().max(200).regex(/^\//);
const short = (n: number) => z.string().trim().max(n);

export const eventSchema = z.object({
  type: z.enum(["pageview", "leave", "event", "scroll", "vital", "error"]),
  path,
  name: short(60).optional(),
  value: z.number().finite().optional(),
  label: short(120).optional(),
  // pageview context (only sent with pageviews)
  referrer: z.string().max(500).optional(),
  utm: z.partialRecord(z.enum(["source", "medium", "campaign", "term", "content"]), short(100)).optional(),
  screen: z.enum(["mobile", "tablet", "desktop"]).optional(),
  lang: short(16).optional(),
  tz: short(48).optional(),
  scheme: z.enum(["light", "dark"]).optional(),
});
export const payloadSchema = z.union([eventSchema, z.array(eventSchema).min(1).max(25)]);
export type StatEvent = z.infer<typeof eventSchema>;

export type CollectResult = { accepted: number; reason?: string };

const RATE = { windowMs: 60_000, max: 120 };
const recent = new Map<string, number[]>();

function rateLimited(id: string, n: number): boolean {
  const now = Date.now();
  const list = (recent.get(id) ?? []).filter((t) => now - t < RATE.windowMs);
  if (list.length + n > RATE.max) {
    recent.set(id, list);
    return true;
  }
  for (let i = 0; i < n; i++) list.push(now);
  recent.set(id, list);
  if (recent.size > 50_000) recent.clear(); // bound memory
  return false;
}

/**
 * Stores accepted events. Returns the reason when everything is ignored (bot, opt-out, admin,
 * rate limit). Nothing identifying is persisted: no IP, no full UA, no cookie.
 */
export async function collect(events: StatEvent[], headers: Headers): Promise<CollectResult> {
  const ua = headers.get("user-agent") ?? "";
  if (isBot(ua)) return { accepted: 0, reason: "bot" };
  if (headers.get("dnt") === "1" || headers.get("sec-gpc") === "1") return { accepted: 0, reason: "opt-out" };
  if (headers.get("sec-purpose")?.includes("prefetch")) return { accepted: 0, reason: "prefetch" };
  const ownEvents = events.filter((e) => !e.path.startsWith("/admin") && !e.path.startsWith("/api"));
  if (ownEvents.length === 0) return { accepted: 0, reason: "admin" };

  const ip = clientIp(headers);
  const id = visitId(await dailySalt(), ip, ua);
  if (rateLimited(id, ownEvents.length)) return { accepted: 0, reason: "rate-limit" };

  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(":")[0] ?? null;
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    // Serialise events of the same visit (beacons can arrive in parallel).
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
    // started_at is compared as text: JS Dates lose the microseconds Postgres stores.
    const { rows } = await client.query<{ started_at: string }>(
      `SELECT started_at::text AS started_at FROM visits WHERE id = $1 AND started_at > now() - interval '36 hours' ORDER BY started_at DESC LIMIT 1`,
      [id],
    );
    let startedAt: string | null = rows[0]?.started_at ?? null;
    let accepted = 0;

    for (const e of ownEvents) {
      if (e.type === "pageview") {
        if (!startedAt) {
          const info = parseUA(ua);
          const inserted = await client.query<{ started_at: string }>(
            `INSERT INTO visits (id, started_at, ended_at, duration_ms, pageviews, entry_path, exit_path, referrer_domain,
               utm_source, utm_medium, utm_campaign, utm_term, utm_content, country, device, browser, browser_version, os,
               os_version, screen_class, language, timezone, color_scheme)
             VALUES ($1, now(), now(), 0, 1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             RETURNING started_at::text AS started_at`,
            [
              id,
              e.path,
              referrerDomain(e.referrer, host),
              e.utm?.source ?? null,
              e.utm?.medium ?? null,
              e.utm?.campaign ?? null,
              e.utm?.term ?? null,
              e.utm?.content ?? null,
              await countryOf(ip),
              info.device,
              info.browser,
              info.browserVersion,
              info.os,
              info.osVersion,
              e.screen ?? null,
              e.lang ?? null,
              e.tz ?? null,
              e.scheme ?? null,
            ],
          );
          startedAt = inserted.rows[0]!.started_at;
        } else {
          await client.query(
            `UPDATE visits SET pageviews = pageviews + 1, exit_path = $3, ended_at = now(),
               duration_ms = (extract(epoch FROM now() - started_at) * 1000)::int
             WHERE id = $1 AND started_at = $2::timestamptz`,
            [id, startedAt, e.path],
          );
        }
      } else if (startedAt) {
        // Any later sign of life extends the session (e.g. "leave" when the tab is hidden).
        await client.query(
          `UPDATE visits SET ended_at = greatest(ended_at, now()),
             duration_ms = (extract(epoch FROM greatest(ended_at, now()) - started_at) * 1000)::int
           WHERE id = $1 AND started_at = $2::timestamptz`,
          [id, startedAt],
        );
      } else {
        continue; // events without a preceding pageview are ignored
      }
      await client.query(
        `INSERT INTO visit_events (ts, visit_id, type, path, name, value, props) VALUES (now(), $1, $2, $3, $4, $5, $6)`,
        [id, e.type, e.path, e.name ?? null, e.value ?? null, e.label != null ? { value: e.label } : null],
      );
      accepted++;
    }
    await client.query("COMMIT");
    return { accepted };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
