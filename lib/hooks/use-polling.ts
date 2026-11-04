"use client";

import { useEffect, useState } from "react";

export type PollState<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Fetches JSON from `url` and refetches every `intervalMs`. Keeps the last good data on errors,
 * so a failing source never blanks a card that already shows values.
 */
export function usePolling<T>(url: string | null, intervalMs: number, initial: T | null = null): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: initial, error: null, loading: initial == null });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(url, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setState((s) => ({ data: s.data, loading: false, error: body?.error ?? `HTTP ${res.status}` }));
        } else {
          setState({ data: body as T, error: null, loading: false });
        }
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setState((s) => ({ data: s.data, loading: false, error: "Netzwerkfehler" }));
      }
    };
    void load();
    const t = setInterval(load, intervalMs);
    // Refresh immediately when the tab becomes visible again.
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, intervalMs]);

  return state;
}
