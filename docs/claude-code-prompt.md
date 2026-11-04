# Auftrag: Dashboard „Netzlage Deutschland“ als Next.js-App im Docker-Container

Du baust eine Web-App für ein Uni-Projekt, die das deutsche Stromnetz zeigt: eine Seite mit der aktuellen Lage und eine Seite zum Erkunden historischer Daten. Die App läuft später auf meinem eigenen Server als **ein Docker-Compose-Stack**, der mit einem einzigen `docker compose up -d` startet: ein Container für die Next.js-App (inklusive Datenabruf) und ein Container für die Datenbank.

Arbeite in Phasen (siehe unten). Lege vor dem ersten Code einen kurzen Plan vor und stelle mir Fragen nur dort, wo eine falsche Annahme teuer wäre. Prüfe API-Endpunkte immer gegen die echte Dokumentation, bevor du sie einbaust; erfinde keine Endpunkte oder Felder. Wenn ich Screenshots der Mockups anhänge, sind sie die Referenz für Layout und Look.

---

## 1. Tech-Stack

- **Next.js**, aktuelle stabile Version, App Router, TypeScript (strict), `output: "standalone"`
- **Tailwind CSS v4**; Schrift **Geist** und **Geist Mono** über `next/font`
- **Datenbank: PostgreSQL mit TimescaleDB** (offizielles Image `timescale/timescaledb`, aktuelle `latest-pg…`-Version), Zugriff aus der App über `pg` mit **Drizzle ORM**. Timescale-spezifisches (Hypertables, Continuous Aggregates, Policies) als rohe SQL-Migrationen
- **Diagramme:** Recharts für Linien/Flächen/Balken; Heatmap und Deutschlandkarte als eigenes SVG mit `d3-geo` / `d3-scale`
- **Zeitzonen:** intern alles in UTC (Unix-ms), Anzeige in `Europe/Berlin` inkl. Sommer-/Winterzeit (z. B. `date-fns-tz`)
- **Validierung** externer API-Antworten mit `zod`
- **Authentifizierung** für den Admin-Bereich mit **Better Auth** und Passkeys (Details in Abschnitt 7)
- **Scheduler** im selben Prozess: Start über `instrumentation.ts` (läuft einmal beim Serverstart), z. B. mit `node-cron`; Backfill zusätzlich als CLI-Skript `npm run backfill -- --from 2015-01-01`
- Keine weiteren Dienste wie Redis oder Cloud-Speicher. Der Stack besteht nur aus App und Datenbank.

UI-Texte auf Deutsch, Code und Kommentare auf Englisch.

---

## 2. Datenquellen

Lege für jede Quelle einen eigenen Adapter an (`lib/sources/<name>.ts`) mit einheitlicher Ausgabe `{ seriesKey, ts, value }[]`. Alle Abrufe mit Timeout, Retry mit Backoff und höflichem Rate-Limit.

| Quelle | Wofür | Zugang |
|---|---|---|
| **SMARD (Bundesnetzagentur)** | Erzeugung je Energieträger, Netzlast, Residuallast, Day-Ahead-Prognosen – für **DE und die vier Regelzonen** | ohne Key. Erst `https://www.smard.de/app/chart_data/{filter}/{region}/index_{resolution}.json` (liefert verfügbare Zeitstempel), dann `…/{filter}/{region}/{filter}_{region}_{resolution}_{timestamp}.json`. Regionen: `DE`, `50Hertz`, `Amprion`, `TenneT`, `TransnetBW`. Auflösung `quarterhour`. Werte sind **MWh je Viertelstunde** → für Leistung in MW ×4 |
| **Energy-Charts (Fraunhofer ISE)** | Strommix, Day-Ahead-Preise (15 min), Grenzflüsse, ggf. Netzfrequenz | ohne Key. Prüfe die OpenAPI-Doku unter `https://api.energy-charts.info/` und nutze nur dort dokumentierte Endpunkte |
| **ENTSO-E Transparency Platform** | physikalische Grenzflüsse je Nachbarland (Fallback/Ergänzung) | optional, Env `ENTSOE_API_TOKEN` |
| **Gridradar** | Netzfrequenz sekündlich | optional, Env `GRIDRADAR_API_TOKEN`. Ohne Token: Frequenz-Karte ausblenden oder auf eine dokumentierte Energy-Charts-Quelle ausweichen |
| **StromGedacht (TransnetBW)** | Netzampel BW, Prognose 48 h | ohne Key, `https://api.stromgedacht.de` (Doku dort), max. ca. 6 Anfragen/Minute, Abfrage per PLZ (Env `STROMGEDACHT_ZIP`, Default `70173`) |

API-Tokens und die StromGedacht-PLZ werden im **Admin-Bereich** gesetzt (siehe Abschnitt 7) und verschlüsselt in der DB gespeichert. Die genannten Env-Variablen dienen nur als Fallback, wenn in der DB nichts hinterlegt ist. Adapter lesen ihre Konfiguration bei jedem Lauf neu, damit ein neuer Token ohne Neustart greift.

SMARD-Filter-IDs (bitte gegen die Live-API verifizieren):
`1223` Braunkohle · `1224` Kernenergie · `1225` Wind Offshore · `1226` Wasserkraft · `1227` Sonstige Konventionelle · `1228` Sonstige Erneuerbare · `4066` Biomasse · `4067` Wind Onshore · `4068` Photovoltaik · `4069` Steinkohle · `4070` Pumpspeicher (Erzeugung) · `4071` Erdgas · `410` Netzlast · `4359` Residuallast · `4387` Pumpspeicher (Verbrauch) · Day-Ahead-Preis DE-LU vermutlich `4169`.

**CO₂-Intensität** berechnest du selbst aus dem Mix mit Emissionsfaktoren je Energieträger (g CO₂/kWh). Lege die Faktoren als dokumentierte Konstanten mit Quellenangabe an (z. B. Umweltbundesamt).

**Wichtige Eigenheiten der Daten:**
- Erzeugung und Last kommen mit ca. 1–3 h Verzug, Day-Ahead-Preise für morgen ab etwa 13 Uhr.
- Werte werden nachträglich korrigiert (Netzlast teils nach über 40 Werktagen). Der Tagesjob lädt deshalb immer die **letzten 60 Tage** neu und überschreibt per Upsert.
- Lücken nie als 0 speichern, sondern weglassen und in Diagrammen als Lücke zeigen.
- Flüsse **zwischen** den Regelzonen sind nicht öffentlich. Wenn du sie anzeigst, nur als klar gekennzeichnete Schätzung.

**Lizenzen:**
- SMARD: CC BY 4.0, Quellenangabe „Bundesnetzagentur | SMARD.de“.
- Börsenpreise (EPEX SPOT) sind lizenziert und dürfen nicht öffentlich weiterverbreitet werden. Baue einen Env-Schalter `PUBLIC_MODE=true`, der die Preisanzeige ausblendet.
- Alle Quellen erscheinen im Footer.

---

## 3. Datenbank

Vorschlag (darfst du verbessern, dann kurz begründen):

- `series` (id, key, source, region, unit, label, color, kind: `actual` | `forecast`)
- `observations` (series_id, ts `timestamptz`, value `double precision`, fetched_at) mit PK (series_id, ts), als **Hypertable** auf `ts` (Chunks à 1 Monat). Importe als Upsert (`ON CONFLICT … DO UPDATE`), damit Revisionen alte Werte überschreiben
- **Continuous Aggregates** `obs_hourly` und `obs_daily` (avg, min, max, sum, count je series_id und Bucket, `time_bucket` mit Zeitzone `Europe/Berlin` für Tage) mit Refresh-Policy, die die letzten 60 Tage regelmäßig neu berechnet. Monat und Jahr werden aus `obs_daily` abgeleitet
- **Kompression** für Chunks älter als 90 Tage (Revisionen betreffen nur die letzten 60 Tage)
- `ingest_runs` (source, started_at, finished_at, status, rows, error) für die Statusanzeige
- `backfill_jobs` (id, sources, from, to, status, progress, current_chunk, rows, error, started_at, finished_at): wiederaufnehmbar, Fortschritt je Quelle und Monat
- `settings` (key, value_encrypted, updated_at): Tokens und Einstellungen, verschlüsselt mit AES-256-GCM, Schlüssel aus Env `SETTINGS_ENCRYPTION_KEY`
- `saved_views` (id, name, query jsonb, created_at) für „Ansicht speichern“
- Besucherstatistik (siehe Abschnitt 8): `visits` (Sessions) und `visit_events` (Seitenaufrufe und Interaktionen), `visit_events` als Hypertable

Die App wählt je nach Zeitraum automatisch Rohdaten, `obs_hourly` oder `obs_daily`: nie mehr als ca. 5.000 Punkte pro Reihe ans Frontend schicken. Bedingungen („Preis < 0“) werden auf Rohdaten-Ebene ausgewertet und erst danach aggregiert.

---

## 4. API-Routen (Route Handlers)

- `GET /api/now`: aktuelle Kennzahlen, Mix je Regelzone, Grenzflüsse, EE-Anteil, CO₂, Netzlast/Residuallast, Datenstand je Quelle
- `GET /api/frequency`: letzte 5 Minuten (nur wenn Quelle konfiguriert)
- `GET /api/prices?days=2`: Day-Ahead heute und morgen in 15 min
- `GET /api/timeseries?series=…&from=…&to=…&res=auto|15min|hour|day|week|month|year&regions=…&conditions=…`
- `GET /api/heatmap?metric=residual&year=2025`
- `GET|POST /api/views`
- `GET /api/health`: für den Docker-Healthcheck
- `POST /api/collect`: nimmt Besucher-Events entgegen (klein, schnell, per `navigator.sendBeacon`; Rate-Limit pro Session)
- `/api/admin/*`: Login/Logout, Einstellungen lesen/schreiben, Token testen, Backfill starten/abbrechen/fortsetzen, Status, Statistik-Abfragen, CSV-Export der Statistik. Alle Admin-Routen prüfen die Admin-Session serverseitig

Alle Antworten mit sinnvollem `Cache-Control`. Die Jetzt-Seite pollt alle 60 s (Frequenz alle 5 s), ohne dass sich das Layout dabei verschiebt.

---

## 5. Seite „Jetzt“ (`/`)

- **Kopfzeile:** Logo „Netzlage“, Tabs „Jetzt“ / „Historie“, Live-Punkt, Hinweis auf den Datenverzug, Datenstand.
- **Kennzahlen oben:** Erzeugung, Verbrauch, Netto-Import in GW.
- **Links, große Karte:** Deutschlandkarte, aufgeteilt in die **vier Übertragungsnetzgebiete**.
  - Geometrie aus einer Bundesländer-GeoJSON oder dem npm-Paket `@svg-maps/germany` (CC BY 4.0, Quelle angeben). Fasse die Bundesländer **zur Build-Zeit** zu vier Polygonen zusammen und vereinfache sie: 50Hertz = BE, BB, MV, SN, ST, TH, HH · TenneT = SH, NI, HB, HE, BY · Amprion = NW, RP, SL · TransnetBW = BW. Kennzeichne in der UI, dass das eine Vereinfachung ist.
  - Füllfarbe nach Saldo der Zone: Indigo-Töne für Überschuss, Amber-Töne für Defizit.
  - Pfeile zu den 11 Nachbarländern (NO, DK, SE, NL, BE, LU, FR, CH, AT, CZ, PL) mit Wert in GW: Indigo für Export, Amber für Import.
  - Hover hebt eine Zone hervor, Klick wählt sie aus.
- **Neben der Karte:** vier klickbare Zonen-Kacheln (Erzeugung, Last, Saldo, Mini-Mixbalken, Top-3-Energieträger). Die Auswahl ist mit der Karte synchronisiert.
- **Rechte Spalte:**
  - Erneuerbaren-Anteil mit Veränderung zu gestern
  - CO₂-Intensität mit Tagesbereich
  - Netzfrequenz live mit Sparkline der letzten 5 Minuten und Abweichung in mHz
  - Day-Ahead-Preis jetzt plus Balkendiagramm heute und morgen in 15 min (vergangen hell, kommend dunkel, negative Preise in Indigo, „jetzt“-Marker)
  - Netzampel BW (StromGedacht)
- **Unten, volle Breite:** gestapelte Fläche des Strommixes der letzten 48 h plus gestrichelte Prognosen (Last, Erneuerbare) bis morgen, Umschalter 24 h / 48 h / 7 Tage, Hover-Tooltip mit allen Werten der Viertelstunde.

## 6. Seite „Historie“ (`/historie`)

- **Linke Filterleiste:**
  - gespeicherte Ansichten
  - Zeitraum mit Datumsfeldern und Schnellwahl (7 Tage, 30 Tage, 1 Jahr, 5 Jahre, alles) sowie „mit Vorjahreszeitraum vergleichen“
  - Auflösung (15 min bis Jahr, automatisch vorgeschlagen)
  - Regionen (DE und vier Regelzonen) und Grenzflüsse je Nachbarland
  - Energieträger als Checkboxen mit Farbe und Jahreswert
  - weitere Kenngrößen: Netzlast, Residuallast, Preis, CO₂, Import/Export-Saldo, installierte Leistung
  - **Bedingungen** (z. B. „Preis < 0 €/MWh“, „nur Wochenende“, „EE-Anteil > 80 %“), die als UND verknüpft auf Viertelstunden-Ebene filtern
  - Buttons: Ansicht speichern, CSV-Export, Link kopieren
- **Filterzustand komplett in der URL** (Search Params), damit jede Ansicht teilbar ist.
- **Inhalt:**
  - Filter-Chips und „Zurücksetzen“
  - KPI-Kacheln zur Auswahl
  - Hauptdiagramm umschaltbar: gestapelt, 100 %, Linien. Zoom per Ziehen, Klick auf einen Balken springt eine Auflösung tiefer
  - Heatmap Stunde × Kalenderwoche für eine wählbare Größe (Residuallast, PV, Wind, Preis, CO₂)
  - Tabellenansicht der aktuellen Auswahl
- **Niemals zwei y-Achsen.** Größen mit anderer Einheit bekommen ein eigenes Diagramm darunter.

---

## 7. Admin-Bereich (`/admin`)

**Zugang mit Better Auth**
- Authentifizierung mit **Better Auth** (aktuelle Version, Doku unter better-auth.com prüfen), Speicherung in der eigenen Postgres-DB über den **Drizzle-Adapter**. Die Better-Auth-Tabellen kommen in die normalen Migrationen.
- **Login ausschließlich per Passkey** (WebAuthn) über das **Passkey-Plugin von Better Auth**. Prüfe in der Doku, ob es aktuell als eigenes Paket (`@better-auth/passkey`) oder unter `better-auth/plugins` ausgeliefert wird.
  - Kein Passwort-Login: E-Mail/Passwort ist komplett deaktiviert.
  - Kein zusätzliches TOTP, denn ein Passkey ist bereits phishing-resistent und an Gerät plus Biometrie/PIN gebunden.
  - `userVerification: "required"`, `residentKey: "required"`, damit der Login ohne Eingabe der E-Mail funktioniert.
  - Die Login-Seite hat einen Button „Mit Passkey anmelden“ und unterstützt zusätzlich Conditional UI (Passkey-Vorschlag im Autofill), wenn der Browser es kann.
- **Weitere Einstellungen:**
  - eingebautes Rate-Limiting (gespeichert in der DB, nicht im Speicher)
  - sichere Cookies (`httpOnly`, `secure` hinter HTTPS, `sameSite=lax`)
  - Session-Ablauf nach 12 h Inaktivität
- **Relying Party:** `rpID` und `origin` kommen aus `BETTER_AUTH_URL`. Passkeys sind an diese Domain gebunden; wenn sich die Domain ändert, müssen Passkeys neu registriert werden. Im README deutlich erklären. Lokale Entwicklung läuft über `http://localhost:3000`, Produktion braucht HTTPS.
- **Ersteinrichtung beim ersten Start:**
  - Solange in der DB noch kein Account existiert, leitet `/admin` auf `/admin/setup` um.
  - Dort gebe ich Name und E-Mail ein. Die App legt den Account serverseitig ohne Passwort an, startet eine kurzlebige Setup-Session und registriert sofort meinen ersten Passkey. **Erst nach erfolgreicher Passkey-Registrierung ist der Account aktiv**; bricht die Registrierung ab, wird der halbfertige Account wieder gelöscht.
  - Danach empfiehlt die Seite deutlich, einen **zweiten Passkey** auf einem anderen Gerät oder einem Sicherheitsschlüssel zu hinterlegen, damit ich mich nicht aussperre.
  - Kein Setup-Code: Wer `/admin/setup` als Erster aufruft, legt den Admin-Account an. Das README weist darauf hin, die Einrichtung direkt nach dem ersten Start zu erledigen.
  - Sobald ein aktiver Account existiert, ist die Registrierung **dauerhaft serverseitig gesperrt**: `/admin/setup` liefert 404, und jeder Sign-up-Endpunkt von Better Auth lehnt ab.
- **Passkeys verwalten** im Tab „System“: Liste meiner Passkeys mit Name, Gerät, erstellt am und zuletzt benutzt; weitere hinzufügen, umbenennen, löschen. Den letzten verbleibenden Passkey kann ich nicht löschen.
- **Weitere Admins** (optional) lade ich im Tab „System“ per einmaligem Einladungslink ein (24 h gültig); die eingeladene Person registriert darüber ihren Passkey. Eine offene Registrierung gibt es nie.
- **Notfall:** `docker compose exec app npm run admin:recovery -- <email>` gibt einen einmaligen, 15 Minuten gültigen Link aus, über den ich einen neuen Passkey registrieren kann, falls alle Geräte verloren sind.
- **Schutz:**
  - `/admin/*` und `/api/admin/*` prüfen die Better-Auth-Session serverseitig (in Middleware **und** in jedem Route Handler)
  - `/admin` steht nicht in der Navigation und ist per `noindex` ausgeschlossen
- **Erster Start ohne Daten:** Die öffentliche Seite zeigt einen freundlichen Hinweis „Daten werden eingerichtet“, der Admin-Bereich führt nach dem Login durch Tokens und Initial-Import.

**Tab „Datenquellen“**
- Je Quelle eine Karte mit Status:
  - Letzter erfolgreicher Abruf, letzter Fehler, Zeilen in der DB
  - Ältester und neuester Zeitstempel
  - Erkannte Lücken
- Eingabefelder für ENTSO-E-Token, Gridradar-Token und StromGedacht-PLZ:
  - Tokens werden nach dem Speichern nur maskiert angezeigt (`••••abcd`)
  - Button „Verbindung testen“ macht einen echten Probeabruf und zeigt das Ergebnis
- Schalter `PUBLIC_MODE` (Preise ausblenden) und Schalter je Quelle (an/aus).

**Tab „Datenimport“**
- Initialer Import: Zeitraum wählen (Default ab 01.01.2015), Quellen anhaken, Button „Import starten“.
- Fortschrittsanzeige je Quelle:
  - Balken, aktueller Monat, importierte Zeilen, geschätzte Restzeit
  - live per Polling oder Server-Sent Events
- Abbrechen und Fortsetzen; der Import ist wiederaufnehmbar (`backfill_jobs`). Zusätzlich gibt es „Zeitraum neu laden“ für gezielte Korrekturen.
- Der Import läuft im Hintergrund im App-Prozess weiter, auch wenn der Browser geschlossen wird. Es läuft immer nur ein Import gleichzeitig.
- Protokoll der letzten 100 `ingest_runs` mit Filter nach Quelle und Status.

**Tab „System“**
- DB-Größe, Größe je Tabelle und Kompressionsrate.
- Stand der Continuous Aggregates.
- Nächste geplante Jobs.
- App-Version und Uptime.

**Tab „Besucher“**: siehe Abschnitt 8.

Gestaltung wie der Rest der App: gleiche Karten, Tabellen und Segmented Controls, links eine schmale Navigation mit den Tabs.

---

## 8. Besucherstatistik (selbst gehostet, ohne Cookies)

Eigenes, schlankes Tracking ohne Drittanbieter. Es ist bewusst datenschutzfreundlich gebaut, damit für die öffentliche Seite **kein Cookie-Banner** nötig ist.

**Grundsätze**
- **Keine Tracking-Cookies, kein `localStorage` für Kennungen und kein Fingerprinting.**
- Eine Session-ID entsteht serverseitig als Hash aus IP, User-Agent und einem täglich wechselnden geheimen Salt. So lassen sich Aufrufe eines Tages zu einer Session bündeln, aber Besucher nicht über Tage verfolgen.
- **IP-Adressen werden nie gespeichert.**
- Bots (bekannte User-Agents, Healthchecks) werden herausgefiltert. Admin-Aufrufe zählen nicht.

**Erfassen pro Session (`visits`)**
- Start, Ende, Dauer, Anzahl Seitenaufrufe, Einstiegs- und Ausstiegsseite
- Referrer-Domain und UTM-Parameter
- Land: nur, wenn eine offline eingebundene GeoIP-Datenbank vorhanden ist (optional, z. B. DB-IP Lite); die Auflösung passiert im Speicher, gespeichert wird nur das Land
- Gerätetyp, Browser und Betriebssystem (aus dem User-Agent, nur Familie und Hauptversion)
- Bildschirmbreite als Klasse (Handy, Tablet, Desktop), Browsersprache, Zeitzone, Dark/Light-Präferenz

**Erfassen pro Event (`visit_events`)**
- Seitenaufruf mit Pfad und Verweildauer (gemessen per `visibilitychange`)
- Interaktionen:
  - auf „Jetzt“: Klick auf Regelzone (welche), Zeitfenster-Umschalter
  - auf „Historie“: gewählter Zeitraum, Auflösung, Diagrammtyp und Energieträger; Bedingungen hinzugefügt; Ansicht gespeichert; CSV exportiert; Link kopiert
- Scrolltiefe (25/50/75/100 %)
- Web Vitals (LCP, INP, CLS) und Client-Fehler (Meldung und Seite, ohne personenbezogene Inhalte)

**Ansicht im Tab „Besucher“**
- Zeitraum-Filter (heute, 7 Tage, 30 Tage, frei) wie auf der Historienseite.
- Kennzahlen: Besucher (Sessions), Seitenaufrufe, Ø Dauer, Absprungrate, aktuell aktive Besucher (letzte 5 min).
- Liniendiagramm Sessions pro Tag oder Stunde, Heatmap „Wochentag × Uhrzeit“ (gleiche Komponente wie auf der Historienseite).
- Ranglisten:
  - Seiten, Referrer, Länder, Geräte, Browser
  - meistgeklickte Regelzonen
  - beliebteste Energieträger und Filter
  - gespeicherte Ansichten
- Session-Liste: Startzeit, Dauer, Gerät, Land, Seiten. Ein Klick öffnet die Zeitleiste aller Events dieser Session.
- Web Vitals als Ampel je Seite, Liste der letzten Client-Fehler.
- CSV-Export.

**Aufbewahrung**
- Rohdaten in `visit_events` und `visits` werden nach 90 Tagen gelöscht (Timescale-Retention-Policy, im Admin einstellbar).
- Tagesaggregate bleiben unbegrenzt erhalten.

Lege eine kurze, sachliche Seite `/datenschutz` an, die beschreibt, was erfasst wird. Der Text ist ein Platzhalter, den ich selbst prüfe und anpasse.

---

## 9. Design-System

Clean und minimalistisch im Stil von Vercel, Linear oder Stripe. Kein „AI-Look“, keine bunten Farbverläufe.

- **Flächen:** Hintergrund `bg-slate-50`, Karten `bg-white` mit `rounded-2xl`, `border border-slate-200/60` und `shadow-sm`, beim Hover `shadow-md` (`transition-all duration-200`).
- **Akzent:** Indigo (`indigo-600` für Aktionen, `indigo-50/100` für aktive Zustände). Text in `slate-900`, Sekundärtext in `slate-500`.
- **Bedeutung der Farben, überall gleich:** Indigo heißt Überschuss/Export, Amber heißt Defizit/Import bzw. Bedarf an konventioneller Erzeugung.
- **Energieträger-Farben** (feste Reihenfolge, nie zyklisch neu vergeben): Wasserkraft `#19a3b8`, Biomasse `#008300`, Wind `#2a78d6`, Photovoltaik `#eda100`, Braunkohle `#9c4a1a`, Steinkohle `#6250d6`, Erdgas `#eb6834`, Kernenergie `#b24f8a`, Sonstige `#8a8f98`.
- **Typografie:** klare Hierarchie von `font-medium` bis `font-semibold`. Überschriften mit `tracking-tight`, Zahlen mit `tabular-nums`. Kleine Abschnittslabels in Großbuchstaben mit leichtem Tracking.
- **Abstände und Bedienelemente:** großzügiges Padding (Karten `p-6`/`p-7`, Seite `px-8 py-10`). Segmented Controls auf `bg-slate-100` mit weißem aktivem Segment.
- **Barrierefreiheit:** sichtbare `focus-visible`-Ringe in Indigo, echte `<button>`/`<label>`-Elemente, Kontrast mindestens 4,5:1. Jedes Diagramm bekommt ein `aria-label` und eine Tabellen-Alternative. Farbe ist nie der einzige Bedeutungsträger.
- **Dark Mode** mit `zinc-950` als optionaler letzter Schritt über `prefers-color-scheme` plus Umschalter.
- **Responsiv** bis Handybreite, ohne horizontales Scrollen der Seite.
- **Lade- und Fehlerzustände:** Skeletons im Kartenlayout und klare Fehlermeldungen je Karte, wenn eine Quelle ausfällt; der Rest der Seite bleibt nutzbar.

---

## 10. Docker

- Mehrstufiges `Dockerfile` für die App auf aktueller Node-LTS, Laufzeit-Image mit Next.js-Standalone-Output und Nicht-Root-User.
- `docker-compose.yml` mit **zwei Services**:
  - `db`: TimescaleDB-Image, Volume `netzlage-pg:/var/lib/postgresql/data`, Healthcheck mit `pg_isready`, **kein veröffentlichter Port** (nur im internen Compose-Netz erreichbar), Passwort aus `.env`, `shm_size` passend für Postgres
  - `app`: Port `3000`, `depends_on: db` mit `condition: service_healthy`, Healthcheck auf `/api/health`, `env_file: .env`
  - beide mit `restart: unless-stopped`
- **HTTPS** ist für Passkeys Pflicht. Lege optional einen dritten Service `caddy` an, der nur mit `docker compose --profile https up -d` startet: Domain aus `.env`, automatische Let's-Encrypt-Zertifikate, Weiterleitung auf `app:3000`. Wer schon einen Reverse Proxy hat, lässt das Profil weg; das README beschreibt beide Wege.
- Beim Start der App: Migrationen ausführen (wartet, bis die DB bereit ist), dann Scheduler starten. Die erste Befüllung startet nicht automatisch, sondern über den Admin-Bereich. Alternativ geht es per CLI mit `docker compose exec app npm run backfill -- --from 2015-01-01`; beide nutzen dieselbe Job-Logik und dieselbe `backfill_jobs`-Tabelle.
- **Zeitplan der Jobs:**
  - SMARD/Energy-Charts alle 15 min für die letzten 2 Tage
  - Preise stündlich
  - Frequenz alle 5 s nur im Speicher (Ringpuffer, keine DB)
  - StromGedacht alle 15 min
  - täglich 03:30 Uhr Revision der letzten 60 Tage (die Continuous Aggregates aktualisieren sich über ihre Policy)
  - täglich um Mitternacht neuer Salt für die Besucherstatistik (der alte wird verworfen)
- `.env.example` mit allen Variablen und Kommentaren, u. a. `DATABASE_URL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (öffentliche HTTPS-URL der App, bestimmt die Passkey-Domain), `DOMAIN` und `ACME_EMAIL` (nur für das Caddy-Profil) und `SETTINGS_ENCRYPTION_KEY` (32 Byte). Im README stehen die Befehle zum Erzeugen der Secrets und der Ablauf der Ersteinrichtung. `README.md` mit Start, Backfill, Update und Backup per `docker compose exec db pg_dump` inklusive Wiederherstellung.

---

## 11. Phasen und Abnahme

1. **Gerüst:** Next.js, Tailwind, Design-Tokens, Layout mit Navigation, DB-Schema mit Migrationen (Hypertable, Continuous Aggregates), Docker-Setup. Abnahme: `docker compose up -d` liefert eine leere, gestylte App, beide Container melden „healthy“.
2. **Admin-Grundlage:** Better Auth mit Passkey-Login und Ersteinrichtung, verschlüsselte Einstellungen, Tab „Datenquellen“ mit Token-Test. Abnahme:
   - Nach dem ersten aktiven Account ist die Registrierung gesperrt (per Test geprüft).
   - Login per Passkey funktioniert lokal auf `localhost` (für automatisierte Tests den virtuellen WebAuthn-Authenticator von Playwright nutzen); ein Passwort-Login existiert nicht.
   - Ohne Login sind `/admin` und `/api/admin/*` nicht erreichbar.
   - Ein Token lässt sich setzen, testen und maskiert anzeigen.
3. **Datenabruf:** SMARD-Adapter, Backfill-Jobs (Admin-Tab „Datenimport“ und CLI) und Scheduler, danach die übrigen Quellen. Abnahme: Unit-Tests für das Parsen (mit gespeicherten Beispielantworten als Fixtures), ein Testimport für 7 Tage füllt die DB korrekt, inklusive Sommer-/Winterzeit-Wechsel; Abbrechen und Fortsetzen funktionieren.
4. **Seite „Jetzt“** mit echten Daten, Karte zuletzt.
5. **Seite „Historie“** inklusive URL-Zustand, Bedingungen, Aggregaten, CSV-Export.
6. **Besucherstatistik:** Collector, Events auf beiden Seiten, Tab „Besucher“, Retention, `/datenschutz`. Abnahme: Es wird kein Cookie und keine IP gespeichert (im Test prüfen), Bots werden herausgefiltert, die Auswertung stimmt mit einem Testlauf überein.
7. **Feinschliff:** Lade-/Fehlerzustände, Responsiv-Check, Barrierefreiheit (Tastaturbedienung durch alle Filter), optional Dark Mode.

**Nach jeder Phase:**
- `npm run lint`, `npm run typecheck` und die Tests ausführen
- die App im Container starten und kurz zusammenfassen, was fertig ist und was offen ist
- Fehler nicht stillschweigend umgehen; wenn eine Quelle anders funktioniert als hier beschrieben, sag es mir und schlag eine Lösung vor
