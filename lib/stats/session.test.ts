import { describe, expect, it } from "vitest";
import { payloadSchema } from "./collect";
import { clientIp, referrerDomain, visitId } from "./session";

describe("visit id", () => {
  it("is a hash that contains neither IP nor user agent and changes with the daily salt", () => {
    const a = visitId("salt-day-1", "203.0.113.7", "Mozilla/5.0 Chrome/141");
    expect(a).toHaveLength(32);
    expect(a).not.toContain("203");
    expect(visitId("salt-day-1", "203.0.113.7", "Mozilla/5.0 Chrome/141")).toBe(a); // same day, same visitor
    expect(visitId("salt-day-2", "203.0.113.7", "Mozilla/5.0 Chrome/141")).not.toBe(a); // next day: unlinkable
    expect(visitId("salt-day-1", "203.0.113.8", "Mozilla/5.0 Chrome/141")).not.toBe(a);
  });

  it("takes the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("referrerDomain", () => {
  it("keeps only the host and drops the own site", () => {
    expect(referrerDomain("https://www.google.com/search?q=netz", "netzlage.example.de")).toBe("google.com");
    expect(referrerDomain("https://netzlage.example.de/historie", "netzlage.example.de")).toBeNull();
    expect(referrerDomain("not a url", null)).toBeNull();
  });
});

describe("payload validation", () => {
  it("accepts single events and batches, rejects junk", () => {
    expect(payloadSchema.safeParse({ type: "pageview", path: "/" }).success).toBe(true);
    expect(payloadSchema.safeParse([{ type: "event", path: "/", name: "zone_click", label: "Amprion" }]).success).toBe(true);
    expect(payloadSchema.safeParse({ type: "pageview", path: "https://evil.example" }).success).toBe(false);
    expect(payloadSchema.safeParse({ type: "other", path: "/" }).success).toBe(false);
    expect(payloadSchema.safeParse(Array.from({ length: 26 }, () => ({ type: "scroll", path: "/", value: 25 }))).success).toBe(false);
  });
});
