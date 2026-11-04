import Link from "next/link";

const SOURCES = [
  { label: "Bundesnetzagentur | SMARD.de", note: "CC BY 4.0", href: "https://www.smard.de" },
  { label: "Energy-Charts (Fraunhofer ISE)", href: "https://www.energy-charts.info" },
  { label: "ENTSO-E Transparency Platform", href: "https://transparency.entsoe.eu" },
  { label: "Gridradar", href: "https://gridradar.net" },
  { label: "StromGedacht (TransnetBW)", href: "https://www.stromgedacht.de" },
  { label: "Karte: MapSVG / svg-maps", note: "CC BY 4.0", href: "https://github.com/VictorCazanave/svg-maps" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200/60 bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="section-label mb-2">Quellen</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SOURCES.map((s) => (
              <li key={s.label}>
                <a href={s.href} className="rounded hover:text-slate-900" target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
                {s.note ? <span className="text-slate-400"> ({s.note})</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-slate-400">Börsenpreise: EPEX SPOT via Energy-Charts, nur zur nicht-öffentlichen Nutzung.</p>
        </div>
        <Link href="/impressum" className="rounded hover:text-slate-900">
          Impressum
        </Link>
      </div>
    </footer>
  );
}
