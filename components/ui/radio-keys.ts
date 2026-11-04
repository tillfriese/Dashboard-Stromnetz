import type { KeyboardEvent } from "react";

/**
 * Keyboard behaviour of an ARIA radio group: arrow keys move (and select), Home/End jump,
 * disabled options are skipped. Only the checked radio is in the tab order (roving tabindex).
 */
export function radioKeyDown<T>(
  e: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  onChange: (v: T) => void,
  isDisabled: (v: T) => boolean = () => false,
) {
  const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const enabled = values.filter((v) => !isDisabled(v));
  if (enabled.length === 0) return;
  let next: T | undefined;
  if (e.key in keys) {
    const i = Math.max(0, enabled.indexOf(current));
    next = enabled[(i + keys[e.key]! + enabled.length) % enabled.length];
  } else if (e.key === "Home") next = enabled[0];
  else if (e.key === "End") next = enabled[enabled.length - 1];
  if (next === undefined) return;
  e.preventDefault();
  onChange(next);
  // Move focus to the newly checked radio after React has re-rendered.
  const group = e.currentTarget.closest('[role="radiogroup"]');
  const index = values.indexOf(next);
  requestAnimationFrame(() => (group?.querySelectorAll<HTMLElement>('[role="radio"]')[index])?.focus());
}
