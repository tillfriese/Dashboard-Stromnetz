"use client";

import { useEffect, useState } from "react";

type Loaded<T> = { url: string | null; data: T | null; error: string | null };

/**
 * Fetches JSON whenever `url` changes. Keeps the previous data while the next request is
 * running (no layout jumps); `loading` is derived from whether the shown data belongs to `url`.
 */
export function useJson<T>(url: string | null, initial: T | null = null, initialUrl: string | null = null) {
  const [loaded, setLoaded] = useState<Loaded<T>>({ url: initial ? initialUrl : null, data: initial, error: null });

  useEffect(() => {
    if (!url || url === loaded.url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        setLoaded((s) =>
          res.ok ? { url, data: body as T, error: null } : { url, data: s.data, error: body?.error ?? `HTTP ${res.status}` },
        );
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setLoaded((s) => ({ url, data: s.data, error: "Netzwerkfehler" }));
      });
    return () => controller.abort();
  }, [url, loaded.url]);

  return { data: loaded.data, error: loaded.error, loading: url != null && url !== loaded.url };
}
