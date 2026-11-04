"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Aktuell" },
  { href: "/historie", label: "Historie" },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/70 bg-surface/90 p-1 shadow-sm backdrop-blur"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-slate-900 text-surface" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
