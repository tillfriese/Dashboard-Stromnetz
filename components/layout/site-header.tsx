import { NavTabs } from "./nav-tabs";

/** Floating, centred navigation pill (no full-width top bar). */
export function SiteHeader() {
  return (
    <header className="pointer-events-none sticky top-4 z-30 flex justify-center px-4 pt-4">
      <NavTabs />
    </header>
  );
}
