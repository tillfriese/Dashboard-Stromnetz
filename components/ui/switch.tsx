"use client";

/** Accessible on/off switch (button with role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-indigo-600" : "bg-slate-200"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
