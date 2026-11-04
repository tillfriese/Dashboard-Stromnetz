import type { Metadata } from "next";

export const metadata: Metadata = { title: "Impressum" };

export default function ImprintPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Impressum</h1>
      <div className="card mt-6 space-y-6 p-6 text-slate-700 sm:p-7">
        <section>
          <h2 className="section-label">Projekt</h2>
          <p className="mt-2">
            Netzlage ist ein studentisches Projekt zur Visualisierung von Daten des deutschen Stromnetzes.
          </p>
        </section>
        <section>
          <h2 className="section-label">Verantwortlich</h2>
          <p className="mt-2 font-medium text-slate-900">Till Friese</p>
        </section>
        <section>
          <h2 className="section-label">Kontakt</h2>
          <p className="mt-2">
            E-Mail:{" "}
            <a href="mailto:mail@tillfriese.me" className="rounded font-medium text-indigo-600 underline-offset-2 hover:underline">
              mail@tillfriese.me
            </a>
          </p>
        </section>
        <section>
          <h2 className="section-label">Datenquellen</h2>
          <p className="mt-2">
            Bundesnetzagentur | SMARD.de (CC BY 4.0), Energy-Charts (Fraunhofer ISE), ENTSO-E Transparency Platform,
            Gridradar, StromGedacht (TransnetBW). Karte: MapSVG / svg-maps (CC BY 4.0). Alle Angaben ohne Gewähr.
          </p>
        </section>
      </div>
    </main>
  );
}
