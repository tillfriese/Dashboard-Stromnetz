"use client";

/*
 * Tiny client for the self-hosted, cookieless visitor statistics. Events go to /api/collect via
 * navigator.sendBeacon (survives page unload). No identifiers are stored in the browser.
 */

export type ClientEvent = {
  type: "pageview" | "leave" | "event" | "scroll" | "vital" | "error";
  path: string;
  name?: string;
  value?: number;
  label?: string;
  referrer?: string;
  utm?: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
  screen?: "mobile" | "tablet" | "desktop";
  lang?: string;
  tz?: string;
  scheme?: "light" | "dark";
};

const ENDPOINT = "/api/collect";

function trackedPath(): string | null {
  const p = window.location.pathname;
  return p.startsWith("/admin") ? null : p; // admin area is never tracked
}

export function send(events: ClientEvent | ClientEvent[]) {
  if (typeof window === "undefined") return;
  // Automated browsers (Selenium, Puppeteer, Playwright, …) announce themselves – not counted.
  if (navigator.webdriver) return;
  const body = JSON.stringify(events);
  try {
    // text/plain keeps it a "simple" request; the server parses the JSON itself.
    const blob = new Blob([body], { type: "text/plain" });
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
  } catch {
    /* fall through */
  }
  void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

/** Interaction event, e.g. track("zone_click", "Amprion"). */
export function track(name: string, label?: string | number, value?: number) {
  const path = trackedPath();
  if (!path) return;
  send({ type: "event", path, name: name.slice(0, 60), label: label == null ? undefined : String(label).slice(0, 120), value });
}

export { trackedPath };
