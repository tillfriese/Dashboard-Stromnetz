/** JSON response with a Cache-Control header suitable for shared caches/proxies. */
export function cachedJson(body: unknown, maxAge: number, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`, ...init.headers },
  });
}

/** Error response for a single dashboard card; the rest of the page keeps working. */
export function sourceError(err: unknown) {
  console.error("[api]", err);
  return Response.json({ error: "Daten derzeit nicht verfügbar" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
