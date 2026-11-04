"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth/client";

const TABS = [
  { href: "/", label: "Aktuell" },
  { href: "/historie", label: "Historie" },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  const { data } = authClient.useSession();
  // The admin area only appears in the pill for admins.
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const tabs = isAdmin ? [...TABS, { href: "/admin", label: "Admin" } as const] : TABS;
  return (
    <nav
      aria-label="Hauptnavigation"
      className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/70 bg-surface/90 p-1 shadow-sm backdrop-blur"
    >
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm sm:px-5 font-medium transition-colors ${
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
