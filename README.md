# Netzlage Deutschland

Dashboard zum deutschen Stromnetz: aktuelle Lage (`/`) und historische Daten (`/historie`).
Next.js (App Router, standalone) + PostgreSQL/TimescaleDB, als ein Docker-Compose-Stack.

> Stand: **Phase 5 (Seite „Historie“)**. Besucherstatistik und Feinschliff folgen.

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

## Admin-Bereich und Passkeys

Der Admin-Bereich unter `/admin` steht nicht in der Navigation und ist per `noindex` ausgeschlossen.
Die Anmeldung erfolgt **ausschließlich per Passkey** (WebAuthn, Better Auth). Es gibt kein Passwort
und keine offene Registrierung.

### Ersteinrichtung – direkt nach dem ersten Start erledigen

1. `/admin` aufrufen. Solange es keinen aktiven Account gibt, landest du auf `/admin/setup`.
2. Name und E-Mail eingeben und den ersten Passkey registrieren. Erst danach ist der Account aktiv;
   bricht die Registrierung ab, wird der halbfertige Account wieder gelöscht.
3. **Sofort einen zweiten Passkey** auf einem anderen Gerät oder Sicherheitsschlüssel anlegen
   (Tab „System“ → „Passkey hinzufügen“).

Es gibt keinen Setup-Code: **Wer `/admin/setup` als Erster abschließt, wird Admin.** Danach ist die
Registrierung dauerhaft gesperrt (`/admin/setup` liefert 404, Sign-up-Endpunkte lehnen ab).

### Passkeys sind an die Domain gebunden

`rpID` und `origin` kommen aus `BETTER_AUTH_URL`. Ein Passkey für `https://netzlage.example.de`
funktioniert nur dort. **Ändert sich die Domain, müssen alle Passkeys neu registriert werden**
(z. B. über `admin:recovery`). Lokal funktioniert `http://localhost:3000`, in Produktion ist HTTPS Pflicht.

### Weitere Admins

Im Tab „System“ einen Einladungslink erzeugen (einmalig, 24 h gültig). Die eingeladene Person
registriert darüber ihren Passkey.

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
| SMARD, Grenzflüsse (Energy-Charts), Netzampel BW: letzte 2 Tage + Prognosen | alle 15 min |
| Day-Ahead-Preise heute und morgen | stündlich (:07) |
| ENTSO-E-Grenzflüsse (nur mit Token) | stündlich (:20) |
| Revision der letzten 60 Tage (Upsert) | täglich 03:30 |
| Netzfrequenz (nur im Arbeitsspeicher) | alle 5 s |

Eigenheiten der Quellen:

- **SMARD:** Werte kommen als MWh je Viertelstunde und werden ×4 in MW umgerechnet. Lücken werden nie
  als 0 gespeichert. Die Lastprognose ist Filter `411`, „Prognose Wind und PV“ Filter `5097`.
- **Energy-Charts:** Preise (`/v2/price`, DE-LU) und Grenzflüsse (`/v2/cbpf`, positiv = Import).
  Laut Lizenzfeld der API stehen die DE-LU-Preise unter CC BY 4.0 (Quelle SMARD); der Schalter
  `PUBLIC_MODE` bleibt trotzdem vorhanden.
- **Netzfrequenz:** Gridradar mit Token, sonst `/v2/frequency` von Energy-Charts (ca. 1–2 min Verzug).
- **StromGedacht:** Die API liefert nur die letzten 4 Tage und 2 Tage Vorschau, daher kein Import der Historie.
- **ENTSO-E:** optional, nur mit Token. Der Parser ist gegen ein selbst gebautes Beispiel getestet,
  weil ohne Token keine echte Antwort aufgezeichnet werden konnte.

## Kennzahlen auf „Jetzt“

- **Zeitpunkt:** die letzte *vollständige* Viertelstunde (alle großen Energieträger und die Netzlast liegen vor).
- **Erneuerbaren-Anteil:** Anteil an der Nettoerzeugung (Wasser, Biomasse, Wind, PV, sonstige Erneuerbare),
  Vergleich mit derselben Viertelstunde gestern.
- **CO₂-Intensität:** direkte Emissionen je kWh *Erzeugung* mit Faktoren des Umweltbundesamts
  (Climate Change 13/2025, Tabelle 4: Braunkohle 1.119, Steinkohle 860, Erdgas 392 g/kWh). „Sonstige
  Konventionelle“ (800 g/kWh) ist eine eigene Abschätzung, siehe `lib/energy.ts`. Der Wert ist nicht direkt
  mit dem verbrauchsbezogenen UBA-Jahreswert (363 g/kWh für 2024) vergleichbar.
- **Netto-Import:** Saldo der physikalischen Grenzflüsse (Energy-Charts, mehrere Stunden Verzug). Er
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
- Gespeicherte Ansichten sind für alle Besucher sichtbar (max. 500, 10 pro Stunde und Client).
- Nach einem Import älterer Zeiträume frischt der Import die Continuous Aggregates selbst auf (die Policies decken
  nur die letzten 60 Tage ab). Für manuell eingespielte Daten: `CALL refresh_continuous_aggregate('obs_daily', '2015-01-01', now() - interval '60 days');` (ebenso für `obs_hourly`).

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
und nachher alle Admin-Accounts und Einstellungen dieses Stacks – nur lokal ausführen.

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
