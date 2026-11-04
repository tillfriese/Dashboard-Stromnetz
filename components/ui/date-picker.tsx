"use client";

import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseUserDate } from "@/lib/dates";

/*
 * Own date picker instead of <input type="date">: German format (TT.MM.JJJJ) in every browser,
 * Monday as first weekday, quick month/year jumps (data reaches back to 2015), the selected
 * period highlighted, dark mode and full keyboard support (WAI-ARIA date picker dialog pattern).
 * Values are ISO dates (yyyy-MM-dd) like the native input.
 */

const ISO = "yyyy-MM-dd";
const SHOW = "dd.MM.yyyy";
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const toDate = (iso: string) => parse(iso, ISO, new Date());
const toIso = (d: Date) => format(d, ISO);

const clampIso = (iso: string, min?: string, max?: string) => (min && iso < min ? min : max && iso > max ? max : iso);

type Props = {
  id?: string;
  label: string;
  value?: string;
  /** Uncontrolled use inside a <form>: initial value plus `name` for a hidden input. */
  defaultValue?: string;
  name?: string;
  onChange?: (iso: string) => void;
  min?: string;
  max?: string;
  /** Period highlighted in the calendar (e.g. from–to of a range). */
  rangeStart?: string;
  rangeEnd?: string;
  /** Opens the calendar aligned to the right edge (for fields in the right column). */
  align?: "start" | "end";
  required?: boolean;
  labelClassName?: string;
  inputClassName?: string;
};

export function DatePicker(props: Props) {
  const autoId = useId();
  const id = props.id ?? `date-${autoId}`;
  const [inner, setInner] = useState(props.defaultValue ?? "");
  const value = props.value ?? inner;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value || props.max || toIso(new Date()));
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = `${id}-dialog`;
  // Focus moves to the day grid when the calendar opens and while navigating inside the grid,
  // but not while the month/year selects are being used.
  const justOpened = useRef(false);

  const commit = (iso: string) => {
    const v = clampIso(iso, props.min, props.max);
    setInvalid(false);
    setDraft(null);
    if (props.value === undefined) setInner(v);
    if (v !== value) props.onChange?.(v);
  };

  const commitDraft = () => {
    if (draft == null) return;
    if (draft.trim() === "") {
      setDraft(null);
      return;
    }
    const iso = parseUserDate(draft);
    if (iso) commit(iso);
    else setInvalid(true);
  };

  const openCalendar = () => {
    setFocus(clampIso(value || props.max || toIso(new Date()), props.min, props.max));
    justOpened.current = true;
    setOpen(true);
  };
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // Close when clicking outside (the calendar itself lives in a portal).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !dialogRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /*
   * The calendar is rendered into <body> with position: fixed, so scrolling containers such as
   * the sticky filter column cannot clip it. It opens below the field, flips above when there is
   * not enough room and is always kept completely inside the window.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const field = fieldRef.current?.getBoundingClientRect();
      const dlg = dialogRef.current;
      if (!field || !dlg) return;
      const gap = 8;
      const { width, height } = dlg.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let left = props.align === "end" ? field.right - width : field.left;
      left = Math.max(gap, Math.min(left, vw - width - gap));
      let top = field.bottom + gap;
      if (top + height > vh - gap) {
        const above = field.top - height - gap;
        top = above >= gap ? above : Math.max(gap, vh - height - gap);
      }
      dlg.style.left = `${Math.round(left)}px`;
      dlg.style.top = `${Math.round(top)}px`;
      dlg.style.visibility = "visible";
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, focus, props.align]);

  // Move DOM focus to the focused day (roving tabindex).
  useEffect(() => {
    if (!open) return;
    if (!justOpened.current && !gridRef.current?.contains(document.activeElement)) return;
    justOpened.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, focus]);

  const shown = draft ?? (value ? format(toDate(value), SHOW) : "");

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className={props.labelClassName ?? "text-xs text-slate-500"}>
        {props.label}
      </label>
      <div ref={fieldRef} className="relative mt-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT.MM.JJJJ"
          required={props.required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          value={shown}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "ArrowDown" && e.altKey) {
              e.preventDefault();
              openCalendar();
            } else if (e.key === "Escape" && draft != null) {
              setDraft(null);
              setInvalid(false);
            }
          }}
          className={
            props.inputClassName ??
            `block w-full rounded-xl border bg-surface py-2 pr-7 pl-2.5 text-sm tabular-nums ${invalid ? "border-red-400" : "border-slate-200"}`
          }
        />
        <button
          ref={buttonRef}
          type="button"
          aria-label={`${props.label}: Kalender öffnen`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          onClick={() => (open ? close() : openCalendar())}
          className="absolute inset-y-0 right-0 grid w-7 place-items-center rounded-r-xl text-slate-500 hover:text-slate-900"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      {props.name ? <input type="hidden" name={props.name} value={value} /> : null}
      {invalid ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-700">
          Bitte als TT.MM.JJJJ eingeben.
        </p>
      ) : null}
      {open && typeof document !== "undefined" ? createPortal(
        <Calendar
          dialogRef={dialogRef}
          dialogId={dialogId}
          label={props.label}
          value={value}
          focus={focus}
          setFocus={(iso) => setFocus(clampIso(iso, props.min, props.max))}
          min={props.min}
          max={props.max}
          rangeStart={props.rangeStart}
          rangeEnd={props.rangeEnd}
          gridRef={gridRef}
          onPick={(iso) => {
            commit(iso);
            close();
          }}
          onClose={() => close()}
        />,
        document.body,
      ) : null}
    </div>
  );
}

function Calendar(props: {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  dialogId: string;
  label: string;
  value: string;
  focus: string;
  setFocus: (iso: string) => void;
  min?: string;
  max?: string;
  rangeStart?: string;
  rangeEnd?: string;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const { focus, setFocus, min, max } = props;
  const focusDate = toDate(focus);
  const monthStart = startOfMonth(focusDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 1 });
  const weeks: Date[][] = [];
  for (let d = gridStart; d <= gridEnd; ) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++, d = addDays(d, 1)) week.push(d);
    weeks.push(week);
  }
  const today = toIso(new Date());
  const minYear = min ? toDate(min).getFullYear() : focusDate.getFullYear() - 10;
  const maxYear = max ? toDate(max).getFullYear() : focusDate.getFullYear() + 10;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const prevDisabled = min != null && toIso(addDays(monthStart, -1)) < min;
  const nextDisabled = max != null && toIso(addMonths(monthStart, 1)) > max;
  const outOfRange = (iso: string) => (min != null && iso < min) || (max != null && iso > max);
  const lo = props.rangeStart && props.rangeEnd ? (props.rangeStart < props.rangeEnd ? props.rangeStart : props.rangeEnd) : null;
  const hi = props.rangeStart && props.rangeEnd ? (props.rangeStart < props.rangeEnd ? props.rangeEnd : props.rangeStart) : null;

  const setMonth = (year: number, month: number) => {
    // Keep the day where possible (31 -> last day of a shorter month).
    const target = new Date(year, month, 1);
    const day = Math.min(focusDate.getDate(), endOfMonth(target).getDate());
    setFocus(toIso(new Date(year, month, day)));
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focusDate, -1),
      ArrowRight: () => addDays(focusDate, 1),
      ArrowUp: () => addDays(focusDate, -7),
      ArrowDown: () => addDays(focusDate, 7),
      Home: () => startOfWeek(focusDate, { weekStartsOn: 1 }),
      End: () => endOfWeek(focusDate, { weekStartsOn: 1 }),
      PageUp: () => addMonths(focusDate, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusDate, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setFocus(toIso(move()));
    }
  };

  const navBtn = "grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30";
  const select = "rounded-lg border border-slate-200 bg-surface px-1.5 py-1 text-sm font-medium";

  return (
    <div
      ref={props.dialogRef}
      id={props.dialogId}
      role="dialog"
      aria-modal="true"
      aria-label={`${props.label} wählen`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          props.onClose();
        } else if (e.key === "Tab") {
          // Keep keyboard focus inside the calendar while it is open (it lives at the end of <body>).
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), select")].filter((el) => el.tabIndex >= 0);
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
      style={{ visibility: "hidden", top: 0, left: 0 }}
      className="fixed z-50 w-[17.5rem] rounded-2xl border border-slate-200 bg-surface p-3 shadow-xl"
    >
      <div className="flex items-center justify-between gap-1">
        <button type="button" className={navBtn} aria-label="Vorheriger Monat" disabled={prevDisabled} onClick={() => setFocus(toIso(addMonths(focusDate, -1)))}>
          <Chevron dir="left" />
        </button>
        <div className="flex gap-1">
          <select
            aria-label="Monat"
            className={select}
            value={focusDate.getMonth()}
            onChange={(e) => setMonth(focusDate.getFullYear(), Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>
                {format(new Date(2000, m, 1), "LLL", { locale: de })}
              </option>
            ))}
          </select>
          <select aria-label="Jahr" className={select} value={focusDate.getFullYear()} onChange={(e) => setMonth(Number(e.target.value), focusDate.getMonth())}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={navBtn} aria-label="Nächster Monat" disabled={nextDisabled} onClick={() => setFocus(toIso(addMonths(focusDate, 1)))}>
          <Chevron dir="right" />
        </button>
      </div>

      <div ref={props.gridRef} role="grid" aria-label={format(focusDate, "LLLL yyyy", { locale: de })} className="mt-3" onKeyDown={onGridKey}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((w, i) => (
            <span key={w} role="columnheader" aria-label={WEEKDAYS_LONG[i]} className="py-1 text-center text-xs font-medium text-slate-500">
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={toIso(week[0]!)} className="grid grid-cols-7">
            {week.map((d) => {
              const iso = toIso(d);
              const inMonth = d.getMonth() === focusDate.getMonth();
              const selected = iso === props.value;
              const inRange = lo != null && hi != null && iso >= lo && iso <= hi;
              const edge = iso === lo || iso === hi;
              const disabled = outOfRange(iso);
              return (
                <div role="gridcell" key={iso} aria-selected={selected} className={`py-0.5 ${inRange ? "bg-indigo-50" : ""} ${iso === lo ? "rounded-l-lg" : ""} ${iso === hi ? "rounded-r-lg" : ""}`}>
                  <button
                    type="button"
                    data-day={iso}
                    tabIndex={iso === focus ? 0 : -1}
                    disabled={disabled}
                    aria-label={format(d, "EEEE, d. MMMM yyyy", { locale: de })}
                    aria-current={iso === today ? "date" : undefined}
                    onClick={() => props.onPick(iso)}
                    className={`mx-auto grid size-8 place-items-center rounded-lg text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:text-slate-300 ${
                      selected
                        ? "bg-accent font-semibold text-white"
                        : edge
                          ? "font-semibold text-indigo-700 hover:bg-indigo-100"
                          : inMonth
                            ? "text-slate-900 hover:bg-slate-100"
                            : "text-slate-500 hover:bg-slate-100"
                    } ${iso === today && !selected ? "ring-1 ring-slate-300 ring-inset" : ""}`}
                  >
                    {d.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
          disabled={outOfRange(today)}
          onClick={() => props.onPick(today)}
        >
          Heute
        </button>
        <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={props.onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
