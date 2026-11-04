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
        <section id="datenschutz">
          <h2 className="section-label">Datenschutz und Besucherstatistik</h2>
          <div className="mt-2 space-y-2">
            <p>
              Diese Seite verwendet eine selbst gehostete, anonyme Besucherstatistik ohne Drittanbieter. Für die Statistik werden{" "}
              <strong className="font-medium text-slate-900">keine Cookies</strong> gesetzt, keine Kennungen im Browser gespeichert und
              kein Fingerprinting betrieben.
            </p>
            <p>
              Um Seitenaufrufe eines Tages zusammenzufassen, wird auf dem Server aus IP-Adresse, Browserkennung und einem täglich
              wechselnden, geheimen Zufallswert eine Prüfsumme gebildet. Die IP-Adresse selbst wird nicht gespeichert; der Zufallswert
              wird jede Nacht verworfen, sodass Besuche verschiedener Tage nicht verknüpft werden können.
            </p>
            <p>
              Erfasst werden: aufgerufene Seiten und Verweildauer, Scrolltiefe, Bedienschritte (z. B. gewählte Regelzone, Zeitraum,
              Filter), die Domain der verweisenden Seite und UTM-Parameter, Gerätetyp, Browser und Betriebssystem (jeweils nur Familie
              und Hauptversion), Bildschirmklasse, Sprache, Zeitzone, Hell/Dunkel-Einstellung, Ladezeit-Kennzahlen (Web Vitals) und
              technische Fehlermeldungen ohne persönliche Inhalte. Das Land wird nur ermittelt, wenn eine lokale GeoIP-Datenbank
              eingebunden ist.
            </p>
            <p>
              Einzelne Besuche werden nach 90 Tagen gelöscht, zusammengefasste Tageswerte bleiben erhalten. Bei aktivierter
              „Do Not Track“- oder „Global Privacy Control“-Einstellung im Browser wird nichts erfasst.
            </p>
            <p>
              <strong className="font-medium text-slate-900">Konten (freiwillig):</strong> Alle Daten sind ohne Anmeldung nutzbar. Wer
              ein Konto anlegt, um eigene Filter zu speichern, hinterlegt Name, E-Mail-Adresse und ein Passwort (nur als Hash gespeichert)
              oder einen Passkey (nur der öffentliche Schlüssel). Gespeichert werden außerdem die eigenen Ansichten; sie sind nur für den
              jeweiligen Nutzer sichtbar. Nach der Anmeldung setzt die Seite ein technisch notwendiges Sitzungs-Cookie; zur Absicherung
              werden IP-Adresse und Browserkennung der Sitzung gespeichert, bis sie abläuft. Konten können per E-Mail an den Betreiber
              gelöscht werden.
            </p>
          </div>
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
