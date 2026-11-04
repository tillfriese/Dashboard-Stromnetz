/**
 * Redirect target after sign-in: only paths on this site are allowed. Rejects protocol-relative
 * ("//host"), backslash variants ("/\host", which browsers normalise to "//host"), control
 * characters and anything that would resolve to another origin.
 */
export function safeNext(next: unknown, fallback = "/konto"): string {
  if (typeof next !== "string" || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "http://local.invalid";
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
