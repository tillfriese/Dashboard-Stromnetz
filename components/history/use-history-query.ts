"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { type HistoryQuery, parseQuery, serializeQuery } from "@/lib/history/query";

/**
 * The filter state lives completely in the URL. A local copy is updated immediately, so
 * checkboxes and buttons react without waiting for the router; whenever the URL changes from
 * outside (back button, saved view, reset), the local copy follows it.
 */
export function useHistoryQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlSearch = params.toString();
  // `url` is the last URL this component has seen; `query` may already be ahead of it.
  const [local, setLocal] = useState(() => ({ url: urlSearch, query: parseQuery(new URLSearchParams(urlSearch)) }));

  // Derived-state pattern: whenever the URL itself changes, it becomes the source of truth again.
  let current = local;
  if (local.url !== urlSearch) {
    current = { url: urlSearch, query: parseQuery(new URLSearchParams(urlSearch)) };
    setLocal(current);
  }

  const update = useCallback(
    (patch: Partial<HistoryQuery>) => {
      const query = { ...current.query, ...patch };
      setLocal((s) => ({ url: s.url, query }));
      router.replace(`${pathname}?${serializeQuery(query).toString()}`, { scroll: false });
    },
    [current.query, router, pathname],
  );

  const replaceAll = useCallback(
    (search: string) => {
      setLocal((s) => ({ url: s.url, query: parseQuery(new URLSearchParams(search)) }));
      router.replace(`${pathname}?${search}`, { scroll: false });
    },
    [router, pathname],
  );

  return { query: current.query, update, replaceAll };
}

export { dataSearch } from "@/lib/history/query";
