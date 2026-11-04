import { createHash } from "node:crypto";

/**
 * Session id = SHA-256(daily salt | IP | user agent), shortened. The IP is only used here, in
 * memory, and never stored. With a new salt every day, ids of different days are unrelated.
 */
export function visitId(salt: string, ip: string, ua: string): string {
  return createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("base64url").slice(0, 32);
}

/** Client IP from proxy headers (Caddy / Next.js set X-Forwarded-For). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Referrer reduced to its host name; own domain and invalid values give null. */
export function referrerDomain(referrer: string | null | undefined, ownHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (!host || host === ownHost?.replace(/^www\./, "")) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}
