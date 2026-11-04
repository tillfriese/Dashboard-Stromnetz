/** Theme preference: "system" follows prefers-color-scheme; stored per viewer in localStorage. */
export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "netzlage-theme";

/**
 * Inline script for <head>: sets the `dark` class before the first paint (no flash of the wrong
 * theme). Must stay self-contained.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
