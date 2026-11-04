import { NavTabs } from "./nav-tabs";
import { ThemeToggle } from "./theme-toggle";

/** Floating, centred navigation pill (no full-width top bar) and the theme switch on the right. */
export function SiteHeader() {
  return (
    <header className="pointer-events-none sticky top-4 z-30 flex justify-center px-4 pt-4">
      <NavTabs />
      <div className="absolute top-4 right-4 sm:right-8">
        <ThemeToggle />
      </div>
    </header>
  );
}
