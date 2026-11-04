import { AccountMenu } from "@/components/account/account-menu";
import { NavTabs } from "./nav-tabs";
import { ThemeToggle } from "./theme-toggle";

/** Floating, centred navigation pill (no full-width top bar) and the theme switch on the right. */
export function SiteHeader() {
  return (
    <header className="pointer-events-none sticky top-4 z-30 flex items-center justify-between gap-2 px-4 pt-4 sm:justify-center">
      <NavTabs />
      <div className="flex items-center gap-2 sm:absolute sm:top-4 sm:right-8">
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
