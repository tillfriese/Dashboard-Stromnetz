# Netzlage Deutschland

Dashboard zum deutschen Stromnetz: aktuelle Lage (`/`) und historische Daten seit 2015 (`/historie`).
Studentisches Projekt von Till Friese (Kontakt: mail@tillfriese.me).

## Funktionen im Überblick

- **Aktuell:** Erzeugung, Verbrauch und Netto-Import der letzten vollständigen Viertelstunde, Karte der vier
  Regelzonen mit Saldo und Grenzflüssen, Erneuerbaren-Anteil, CO₂-Intensität, Netzfrequenz (sekündlich),
  Day-Ahead-Preise und Strommix mit Prognose. Aktualisiert sich jede Minute.
- **Historie:** frei wählbarer Zeitraum (eigene Datumsauswahl), Auflösung von 15 Minuten bis Jahr, Regelzonen,
  Energieträger, Kennzahlen (Netzlast, Residuallast, Preis, CO₂, Netto-Import, installierte Leistung),
  Bedingungen je Viertelstunde (z. B. „Preis < 0 und Wochenende“), Vorjahresvergleich, Heatmap,
  Drill-down per Klick, Tabelle und CSV-Export. Der Filterzustand steht in der URL.
- **Vorlagen und Konten:** Gäste nutzen die Vorlagen „Standard“ (letzte 30 Tage) und „Alle Daten“ (seit 2015).
  Mit Konto (Passkey oder E-Mail + Passwort) lassen sich eigene Ansichten speichern.
- **Admin-Bereich:** Datenquellen und Tokens, Datenimport, Nutzerverwaltung, Systemzustand und eine
  cookielose Besucherstatistik.
- **Barrierefreiheit:** WCAG 2.1 AA (automatisch geprüft), Tastaturbedienung, Dark Mode, responsiv ab 360 px.

## Technik

| Bereich | Umsetzung |
|---|---|
| Frontend | Next.js 16 (App Router, `output: standalone`), React 19, TypeScript strict, Tailwind CSS 4, Recharts |
| Daten | PostgreSQL 18 + TimescaleDB (Hypertables, Continuous Aggregates, Kompression), Drizzle ORM |
| Abruf | Scheduler (`node-cron`) im App-Prozess, fortsetzbarer Import, CLI für Backfill und Notfall-Zugang |
| Anmeldung | Better Auth mit Passkeys (WebAuthn) und E-Mail/Passwort, Rollen `user`/`admin` |
| Tests | Vitest (Unit), Playwright (E2E inkl. virtuellem WebAuthn-Authenticator), axe-core (Barrierefreiheit) |
| Betrieb | Docker Compose (App + Datenbank, optional Caddy für HTTPS) |

```
app/          Seiten und API-Routen (App Router)
components/   UI-Komponenten (now = „Aktuell“, history = „Historie“, admin, account, ui)
lib/          Datenquellen, Import, Abfragen, Auth, Statistik, Hilfsfunktionen
drizzle/      SQL-Migrationen (inkl. TimescaleDB)
e2e/          Playwright-Tests        scripts/   CLI und Build-Skripte
docs/         Auftrag und Mockups
```

## Schnellstart

```bash
cp .env.example .env        # dann Secrets eintragen (siehe unten)
docker compose up -d --build
docker compose ps           # beide Container sollten "healthy" melden
```

Die App läuft auf <http://localhost:3000>. Beim Start wartet sie auf die Datenbank, spielt die
Migrationen ein (Tabellen, Hypertables, Continuous Aggregates, Policies) und startet danach den Scheduler.

### Secrets erzeugen

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # SETTINGS_ENCRYPTION_KEY (32 Byte)
```

`SETTINGS_ENCRYPTION_KEY` nie wechseln, solange verschlüsselte Einstellungen in der DB liegen,
sonst sind gespeicherte Tokens nicht mehr lesbar.

## HTTPS und Passkeys

Passkeys (WebAuthn) funktionieren nur über HTTPS oder auf `http://localhost`.
`BETTER_AUTH_URL` bestimmt die Domain, an die alle Passkeys gebunden sind.
**Ändert sich die Domain, müssen alle Passkeys neu registriert werden.**

Zwei Wege:

1. **Mit dem mitgelieferten Caddy** (automatische Let's-Encrypt-Zertifikate):
   `DOMAIN` und `ACME_EMAIL` in `.env` setzen, Ports 80/443 freigeben, dann
   ```bash
   docker compose --profile https up -d
   ```
2. **Eigener Reverse Proxy:** Profil weglassen und den Proxy auf Port `3000` der App zeigen lassen.

## Konten, Rollen und Passkeys

„Aktuell“ und „Historie“ sind ohne Anmeldung nutzbar (Gäste sehen die Standardfilter). Unter `/anmelden`
kann sich jede Person ein Konto anlegen – **per Passkey** (WebAuthn) **oder E-Mail + Passwort**
(mind. 10 Zeichen, gespeichert als Hash). Mit Konto lassen sich eigene Ansichten der Historie speichern;
sie sind **nur für den eigenen Nutzer** sichtbar (max. 100 pro Konto, verwaltbar unter `/konto`).
Über „Als Gast fortfahren“ geht es ohne Konto direkt zur Historie.

Rollen: `user` (Standard für jede Registrierung) und `admin`. Nur Admins erreichen `/admin` (nicht in der
Navigation, `noindex`); angemeldete Nutzer ohne Admin-Rechte werden zu `/konto` umgeleitet, Admin-APIs
antworten mit 403. **Admins befördern Nutzer im Tab „Nutzer“** zum Admin, entziehen Rechte oder löschen
Konten. Die eigenen Rechte kann man sich nicht selbst entziehen, und der letzte Admin bleibt immer erhalten.

### Ersteinrichtung – direkt nach dem ersten Start erledigen

1. `/admin` aufrufen. Solange es keinen aktiven Admin gibt, landest du auf `/admin/setup`.
2. Name und E-Mail eingeben und den ersten Passkey registrieren. Erst danach ist der Account aktiv;
   bricht die Registrierung ab, wird der halbfertige Account wieder gelöscht.
3. **Sofort einen zweiten Passkey** auf einem anderen Gerät oder Sicherheitsschlüssel anlegen
   (`/konto` → „Passkey hinzufügen“).

Es gibt keinen Setup-Code: **Wer `/admin/setup` als Erster abschließt, wird Admin.** Danach liefert
`/admin/setup` dauerhaft 404. Neue Konten über `/anmelden` erhalten immer die Rolle `user`.
E-Mail-Adressen werden nicht bestätigt (kein Mailserver). Hat jemand vor der Ersteinrichtung ein normales
Konto mit der Admin-Adresse angelegt, ersetzt die Ersteinrichtung dieses Konto. Bei der Registrierung
antwortet die App neutral („keine Registrierung möglich“). Dass eine Adresse vergeben ist, lässt sich
ohne Bestätigungs-Mail aber nicht vollständig verbergen; Registrierungen sind je IP auf 5 in 10 Minuten
begrenzt.

### Passkeys sind an die Domain gebunden

`rpID` und `origin` kommen aus `BETTER_AUTH_URL`. Ein Passkey für `https://netzlage.example.de`
funktioniert nur dort. **Ändert sich die Domain, müssen alle Passkeys neu registriert werden**
(z. B. über `admin:recovery`). Lokal funktioniert `http://localhost:3000`, in Produktion ist HTTPS Pflicht.

### Weitere Admins

Entweder ein bestehendes Konto im Tab „Nutzer“ befördern oder im Tab „System“ einen Einladungslink
erzeugen (einmalig, 24 h gültig); die eingeladene Person registriert darüber einen Passkey und ist direkt Admin.

### Notfall: alle Geräte verloren

```bash
docker compose exec app npm run admin:recovery -- <email>
```

Gibt einen einmaligen Link aus (15 Minuten gültig), über den du einen neuen Passkey registrierst.

### Einstellungen

Tokens (ENTSO-E, Gridradar) und die StromGedacht-PLZ werden im Tab „Datenquellen“ gesetzt und mit
AES-256-GCM verschlüsselt in der DB gespeichert (Schlüssel: `SETTINGS_ENCRYPTION_KEY`). Die Werte in
`.env` gelten nur als Fallback.

## Daten und Import

Nach dem ersten Start ruft die App automatisch die aktuellen Daten ab (letzte 2 Tage). Den
historischen Bestand lädst du einmalig nach, entweder im Admin-Bereich (Tab „Datenimport“) oder per CLI:

```bash
docker compose exec app npm run backfill -- --from 2015-01-01
# optional: --to 2026-11-04  --sources smard,energycharts  --resume <job-id>
```

Beide Wege nutzen dieselbe Job-Logik und dieselbe Tabelle `backfill_jobs`. Es läuft immer nur ein
Import gleichzeitig. Ein abgebrochener oder durch einen Neustart unterbrochener Import setzt dort fort,
wo er aufgehört hat. Der komplette SMARD-Bestand seit 2015 dauert einige Stunden.

| Job | Zeitplan (Europe/Berlin) |
|---|---|
| SMARD, Grenzflüsse (Energy-Charts), StromGedacht: letzte 2 Tage + Prognosen | alle 15 min |
| Day-Ahead-Preise heute und morgen | stündlich (:07) |
| ENTSO-E-Grenzflüsse, letzter Tag (nur mit Token) | alle 15 min (:05, :20, :35, :50) |
| Revision der letzten 60 Tage (Upsert) | täglich 03:30 |
| Installierte Leistung (nur im Speicher, auch beim Start) | täglich 04:40 |
| Netzfrequenz (nur im Arbeitsspeicher) | alle 5 s |

Eigenheiten der Quellen:

- **SMARD:** Werte kommen als MWh je Viertelstunde und werden ×4 in MW umgerechnet. Lücken werden nie
  als 0 gespeichert. Die Lastprognose ist Filter `411`, „Prognose Wind und PV“ Filter `5097`.
- **Energy-Charts:** Preise (`/v2/price`, DE-LU) und Grenzflüsse (`/v2/cbpf`, positiv = Import).
  Laut Lizenzfeld der API stehen die DE-LU-Preise unter CC BY 4.0 (Quelle SMARD); der Schalter
  `PUBLIC_MODE` bleibt trotzdem vorhanden.
- **Netzfrequenz:** Gridradar mit Token, sonst `/v2/frequency` von Energy-Charts (ca. 1–2 min Verzug).
- **StromGedacht:** Die API liefert nur die letzten 4 Tage und 2 Tage Vorschau, daher kein Import der Historie.
  Die Netzampel wird abgerufen und gespeichert, im Dashboard aber derzeit nicht angezeigt.
- **Installierte Leistung:** Energy-Charts (`/v2/installed_power`) liefert Wind, PV und Biomasse monatlich, die
  übrigen Energieträger nur als Jahreswerte. Beides wird kombiniert (konventionelle Kraftwerke als Jahresendstand).
  Abruf beim Start und täglich im Hintergrund mit geduldigen Wiederholungen (Energy-Charts begrenzt Anfragen je IP
  mit HTTP 429). Seitenaufrufe lesen nur den Zwischenspeicher; schlägt ein Abruf fehl, bleiben die alten Werte.
- **ENTSO-E:** optional, nur mit Token. Physikalische Grenzflüsse (A11) je Grenze in beide Richtungen,
  15-Minuten-Werte mit etwa 15–60 min Verzug. Mit der echten API geprüft: Für gemeinsame Viertelstunden
  weichen die Werte im Mittel um höchstens ca. 10 MW von Energy-Charts ab. Die jeweils neueste Viertelstunde
  ist oft noch vorläufig und wird für „Aktuell“ nicht verwendet.

## Kennzahlen auf „Aktuell“

- **Zeitpunkt:** die letzte *vollständige* Viertelstunde (alle großen Energieträger und die Netzlast liegen vor).
- **Erneuerbaren-Anteil:** Anteil an der Nettoerzeugung (Wasser, Biomasse, Wind, PV, sonstige Erneuerbare),
  Vergleich mit derselben Viertelstunde gestern.
- **CO₂-Intensität:** direkte Emissionen je kWh *Erzeugung* mit Faktoren des Umweltbundesamts
  (Climate Change 13/2025, Tabelle 4: Braunkohle 1.119, Steinkohle 860, Erdgas 392 g/kWh). „Sonstige
  Konventionelle“ (800 g/kWh) ist eine eigene Abschätzung, siehe `lib/energy.ts`. Der Wert ist nicht direkt
  mit dem verbrauchsbezogenen UBA-Jahreswert (363 g/kWh für 2024) vergleichbar.
- **Netto-Import und Grenzflüsse:** Saldo der physikalischen Grenzflüsse. Angezeigt wird die Quelle mit der
  neueren vollständigen Viertelstunde (höchstens bis zum Zeitpunkt oben): mit ENTSO-E-Token meist ENTSO-E
  (etwa so aktuell wie SMARD), sonst Energy-Charts (mehrere Stunden Verzug). Die Historie nutzt Energy-Charts. Er
  entspricht nicht exakt „Netzlast − Erzeugung“ nach SMARD (Abgrenzung der Netzlast, Eigenverbrauch, Verluste).
- **Karte:** `@svg-maps/germany` (MapSVG, CC BY 4.0), zur Build-Zeit zu vier Regelzonen vereinigt
  (`npm run build:map` → `lib/map/germany-zones.json`). Die Zuordnung nach Bundesländern ist eine Vereinfachung.

## Seite „Historie“

- Der komplette Filterzustand steht in der URL (`/historie?from=…&to=…&res=…&cond=…`), jede Ansicht ist teilbar.
  Dieselben Parameter versteht `GET /api/timeseries` (mit `&format=csv` als CSV-Export, Semikolon und Dezimalkomma).
- Auflösung: automatisch passend zum Zeitraum; eine zu feine Auswahl wird vergröbert, damit nie mehr als ca. 5.000
  Punkte je Reihe übertragen werden. 15 min aus Rohdaten, Stunde aus `obs_hourly`, Tag bis Jahr aus `obs_daily`
  (Tage, Wochen, Monate, Jahre in Europe/Berlin).
- **Bedingungen** (`cond=price.lt.0`, `cond=re.gt.80`, `cond=residual.lt.0`, `cond=load.gt.70`, `cond=co2.lt.200`,
  `cond=dow.67`, `cond=hour.10-15`) werden UND-verknüpft je Viertelstunde auf den Rohdaten ausgewertet, erst danach
  wird aggregiert. Stündliche Preise vor Oktober 2025 gelten für alle vier Viertelstunden der Stunde.
- Ohne Parameter öffnet `/historie` die Vorlage „Standard“ (letzte 30 Tage, ohne zusätzliche Kennzahl-Diagramme).
  Links ohne `metrics`-Parameter (ältere Links) zeigen weiterhin die Netzlast.
- Sind alle vier Regelzonen gewählt, nutzt die Historie die offizielle Deutschland-Summe von SMARD. Die Zonenreihen
  haben in der Quelle Lücken und Ausreißer (z. B. Amprion „Sonstige Konventionelle“: leer vom 31.12.2016 bis Ende 2017).
- Gespeicherte Ansichten sind privat je Konto (max. 100). Gäste nutzen die Vorlagen oder teilen Ansichten per Link.
- Nach einem Import älterer Zeiträume frischt der Import die Continuous Aggregates selbst auf (die Policies decken
  nur die letzten 60 Tage ab). Für manuell eingespielte Daten: `CALL refresh_continuous_aggregate('obs_daily', '2015-01-01', now() - interval '60 days');` (ebenso für `obs_hourly`).

## Besucherstatistik (ohne Cookies)

- Selbst gehostet, keine Drittanbieter, **keine Cookies, kein `localStorage` für Kennungen, kein Fingerprinting**.
  Ein Cookie-Banner ist dafür nicht nötig; die Hinweise stehen im Impressum (Abschnitt „Datenschutz“).
- Sitzungs-ID = SHA-256 aus täglich wechselndem Salt, IP und User-Agent (gekürzt). Der Salt liegt verschlüsselt in
  den Einstellungen und wird um 00:00 Uhr (Europe/Berlin) ersetzt, der alte ist danach weg. **IP-Adressen werden nie
  gespeichert**, vom User-Agent nur Gerätetyp, Browser- und OS-Familie mit Hauptversion.
- Nicht gezählt: Bots/Crawler/Skripte, automatisierte Browser (`navigator.webdriver`), Do-Not-Track/GPC,
  der Admin-Bereich und angemeldete Admins (normale Konten zählen wie Gäste).
- Land nur mit offline eingebundener GeoIP-Datenbank (z. B. DB-IP „IP to Country Lite“, CC BY 4.0, `.mmdb`):
  Datei ins Volume legen und `GEOIP_DB_PATH=/pfad/zur/datei.mmdb` setzen.
- Rohdaten (`visits`, `visit_events`) werden nach 90 Tagen gelöscht (im Tab „Besucher“ einstellbar). Die Aggregate
  `visits_hourly` und `visit_events_daily` bleiben unbegrenzt erhalten.
- „Statistik zurücksetzen“ im Tab „Besucher“ (nach Rückfrage, `DELETE /api/admin/stats/reset`) leert Rohdaten und
  Aggregate. Aufbewahrungsdauer und gespeicherte Ansichten bleiben erhalten.

## Barrierefreiheit und Darstellung

- Automatische WCAG-2.1-A/AA-Prüfung (axe-core) aller Seiten in hellem und dunklem Modus als E2E-Test (`e2e/a11y.spec.ts`).
- Tastatur: „Zum Inhalt springen“-Link, sichtbarer Fokusring, Auswahlgruppen per Pfeiltasten (eine Tab-Station je Gruppe),
  alle Filter der Historie per Tab erreichbar, scrollbare Tabellen fokussierbar. Jedes Diagramm hat eine Tabellen-Alternative.
- Responsiv von 360 px bis Desktop ohne horizontales Scrollen; auf dem Handy ist die Filterleiste der Historie einklappbar.
- Dark Mode (zinc-950) folgt dem System, Umschalter oben rechts (System → Hell → Dunkel), gespeichert nur im eigenen Browser.
- Eigene Lade-, Fehler- und 404-Seiten; fällt eine Quelle aus, zeigt nur die betroffene Karte einen Hinweis.

## Entwicklung

```bash
npm install
docker compose up -d db                 # DB ohne veröffentlichten Port: für lokale Entwicklung
                                        # ggf. temporär "ports: [5432:5432]" ergänzen
npm run dev
npm run lint && npm run typecheck && npm test
```

**End-to-End-Tests** (Playwright mit virtuellem WebAuthn-Authenticator) laufen gegen den Compose-Stack
auf `http://localhost:3000` und brauchen Internet (echte Testimporte). **Achtung:** Sie löschen vorher
und nachher alle Konten und Einstellungen dieses Stacks – nur lokal ausführen. Der Test für ENTSO-E-Tokens
fragt die echte ENTSO-E-API ab und kann bei deren Zeitüberschreitung fehlschlagen.

```bash
npx playwright install chromium   # einmalig
npm run test:e2e
```

Neue Tabellen: Schema in `lib/db/schema.ts` ändern, dann `npm run db:generate`.
Timescale-Spezifisches (Hypertables, Aggregates, Policies) kommt als rohes SQL in eigene
Migrationen (`npx drizzle-kit generate --custom --name <name>`).

## Update

```bash
git pull
docker compose up -d --build
```

Migrationen laufen beim Start automatisch.

## Backup und Wiederherstellung

```bash
# Backup (Custom-Format, komprimiert)
docker compose exec -T db pg_dump -U netzlage -d netzlage -Fc > netzlage-$(date +%F).dump

# Wiederherstellung in eine leere Datenbank
docker compose stop app
docker compose exec -T db psql -U netzlage -d postgres -c "DROP DATABASE netzlage" -c "CREATE DATABASE netzlage"
docker compose exec -T db psql -U netzlage -d netzlage -c "SELECT timescaledb_pre_restore()"
docker compose exec -T db pg_restore -U netzlage -d netzlage --no-owner < netzlage-YYYY-MM-DD.dump
docker compose exec -T db psql -U netzlage -d netzlage -c "SELECT timescaledb_post_restore()"
docker compose start app
```

## Datenbank-Volume

Das Image `timescale/timescaledb:latest-pg18` legt die Daten ab PostgreSQL 18 unter
`/var/lib/postgresql/18/docker` ab. Das Volume `netzlage-pg` ist deshalb auf `/var/lib/postgresql`
gemountet, nicht auf `.../data`. Ein Major-Upgrade (z. B. auf PG 19) braucht `pg_upgrade` oder Dump/Restore.

Wir nutzen bewusst nicht die `-oss`-Variante, weil ihr Kompression und Continuous Aggregates fehlen.

## Quellen und Lizenzen

- Bundesnetzagentur | SMARD.de (CC BY 4.0)
- Energy-Charts (Fraunhofer ISE), ENTSO-E Transparency Platform, Gridradar, StromGedacht (TransnetBW)
- Karte: svg-maps (CC BY 4.0)
- Börsenpreise (EPEX SPOT) sind lizenziert. Bei öffentlichem Betrieb `PUBLIC_MODE=true` setzen.
