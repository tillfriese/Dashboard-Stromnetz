"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";
import { type ClientEvent, send, trackedPath } from "@/lib/analytics/client";

const screenClass = (): ClientEvent["screen"] => (innerWidth < 640 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop");

/** Removes URLs, e-mail addresses and long numbers from error messages (no personal content). */
function cleanError(msg: string): string {
  return msg
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>")
    .replace(/\d{6,}/g, "<n>")
    .slice(0, 120);
}

const reportVital = (metric: { name: string; value: number }) => {
  const path = trackedPath();
  if (path && (metric.name === "LCP" || metric.name === "INP" || metric.name === "CLS")) {
    send({ type: "vital", path, name: metric.name, value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value) });
  }
};

/**
 * Page views (incl. client-side navigation), visible time per page (visibilitychange),
 * scroll depth (25/50/75/100 %), Web Vitals and client errors. Nothing on /admin.
 */
export function Tracker() {
  const pathname = usePathname();
  useReportWebVitals(reportVital);
  const firstView = useRef(true);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    const params = new URLSearchParams(window.location.search);
    const utm: ClientEvent["utm"] = {};
    for (const k of ["source", "medium", "campaign", "term", "content"] as const) {
      const v = params.get(`utm_${k}`);
      if (v) utm[k] = v;
    }
    send({
      type: "pageview",
      path: pathname,
      referrer: firstView.current ? document.referrer || undefined : undefined,
      utm: Object.keys(utm).length ? utm : undefined,
      screen: screenClass(),
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      scheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    });
    firstView.current = false;

    // Visible time on this page.
    let visibleSince: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let visibleMs = 0;
    const flushLeave = () => {
      if (visibleSince != null) visibleMs += performance.now() - visibleSince;
      visibleSince = null;
      if (visibleMs > 0) send({ type: "leave", path: pathname, value: Math.round(visibleMs) });
      visibleMs = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushLeave();
      else visibleSince = performance.now();
    };

    // Scroll depth thresholds, each once per page view.
    const reached = new Set<number>();
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const pct = max <= 0 ? 100 : (scrollY / max) * 100;
      for (const t of [25, 50, 75, 100]) {
        if (pct >= t - 1 && !reached.has(t)) {
          reached.add(t);
          send({ type: "scroll", path: pathname, value: t });
        }
      }
    };

    const onError = (e: ErrorEvent) => send({ type: "error", path: pathname, label: cleanError(e.message || "Error") });
    const onRejection = (e: PromiseRejectionEvent) =>
      send({ type: "error", path: pathname, label: cleanError(String((e.reason as Error)?.message ?? e.reason ?? "Unhandled rejection")) });

    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", flushLeave);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("error", onError);
    addEventListener("unhandledrejection", onRejection);
    return () => {
      flushLeave(); // client-side navigation to another page
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", flushLeave);
      removeEventListener("scroll", onScroll);
      removeEventListener("error", onError);
      removeEventListener("unhandledrejection", onRejection);
    };
  }, [pathname]);

  return null;
}
