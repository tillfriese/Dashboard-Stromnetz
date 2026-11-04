"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, readPref, THEME_KEY, type ThemePref } from "@/lib/theme";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemePref, string> = { system: "System", light: "Hell", dark: "Dunkel" };

/** Cycles System → Hell → Dunkel. "System" follows the operating system setting live. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);

  // Follow OS changes while the preference is "system"; re-apply after storage changes.
  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const set = (next: ThemePref) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: still switch for this page view */
    }
    applyTheme(next);
    listeners.forEach((l) => l());
  };

  return (
    <button
      type="button"
      onClick={() => set(NEXT[pref])}
      aria-label={`Farbschema: ${LABEL[pref]}. Wechseln zu ${LABEL[NEXT[pref]]}`}
      title={`Farbschema: ${LABEL[pref]}`}
      className="pointer-events-auto grid size-10 place-items-center rounded-full border border-slate-200/70 bg-surface/90 text-slate-600 shadow-sm backdrop-blur transition-colors hover:text-slate-900"
    >
      {pref === "dark" ? <Moon /> : pref === "light" ? <Sun /> : <Auto />}
    </button>
  );
}

const icon = { viewBox: "0 0 24 24", className: "size-4.5", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function Sun() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg {...icon}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
    </svg>
  );
}

function Auto() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
    </svg>
  );
}
