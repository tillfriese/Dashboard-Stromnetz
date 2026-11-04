"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";

/** Header entry: "Anmelden" for guests, otherwise a small menu with account, admin area and sign-out. */
export function AccountMenu() {
  const { data, isPending } = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();
  // The menu belongs to the page it was opened on, so it closes by itself after navigating.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? pathname : null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    // Menu button pattern: focus moves into the menu when it opens.
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpenOn(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /** Arrow keys, Home/End move between items; Escape closes and returns to the button; Tab leaves. */
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      setOpenOn(null);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") setOpenOn(null);
  };

  const pill = "pointer-events-auto inline-flex h-10 items-center rounded-full border border-slate-200/80 bg-surface/90 px-4 text-sm font-medium shadow-sm backdrop-blur hover:bg-slate-50";
  if (isPending) return <span className="inline-block h-10 w-10 sm:w-24" aria-hidden />;
  if (!data) {
    if (pathname === "/anmelden") return null;
    return (
      <Link
        href={`/anmelden?next=${encodeURIComponent(pathname)}`}
        // Keep the full address incl. filters (e.g. /historie?from=…) as return target.
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          router.push(`/anmelden?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }}
        className={`${pill} max-sm:size-10 max-sm:justify-center max-sm:px-0`}
        aria-label="Anmelden"
      >
        <svg viewBox="0 0 24 24" className="size-4.5 sm:hidden" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
        <span className="max-sm:sr-only">Anmelden</span>
      </Link>
    );
  }

  const initial = data.user.name.trim().charAt(0).toUpperCase() || "?";
  const item = "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100";
  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "account-menu" : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`${pill} gap-2 pl-1.5`}
      >
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
          {initial}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{data.user.name}</span>
        <span className="sr-only sm:hidden">Konto-Menü</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          id="account-menu"
          role="menu"
          aria-label={`Konto ${data.user.email}`}
          onKeyDown={onMenuKey}
          className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-surface p-1.5 shadow-lg"
        >
          <p aria-hidden className="truncate px-3 py-1.5 text-xs text-slate-500">
            {data.user.email}
          </p>
          <Link role="menuitem" tabIndex={-1} href="/konto" className={item}>
            Mein Konto
          </Link>
          <button
            role="menuitem"
            tabIndex={-1}
            type="button"
            className={item}
            onClick={async () => {
              await authClient.signOut();
              setOpenOn(null);
              // Pages that need a session are left; public pages stay where they are.
              if (pathname.startsWith("/konto") || pathname.startsWith("/admin")) router.replace("/");
              router.refresh();
            }}
          >
            Abmelden
          </button>
        </div>
      ) : null}
    </div>
  );
}
