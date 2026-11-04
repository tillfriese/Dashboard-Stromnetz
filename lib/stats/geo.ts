import { existsSync } from "node:fs";
import maxmind, { type CountryResponse, type Reader } from "maxmind";

/*
 * Optional offline GeoIP (e.g. DB-IP "IP to Country Lite", CC BY 4.0) as .mmdb file, path in
 * GEOIP_DB_PATH. The lookup happens in memory; only the ISO country code is stored.
 */

const g = globalThis as unknown as { netzlageGeo?: Promise<Reader<CountryResponse> | null> };

function reader() {
  g.netzlageGeo ??= (async () => {
    const path = process.env.GEOIP_DB_PATH;
    if (!path || !existsSync(path)) return null;
    try {
      return await maxmind.open<CountryResponse>(path);
    } catch (err) {
      console.warn("[geoip] could not open database:", (err as Error).message);
      return null;
    }
  })();
  return g.netzlageGeo;
}

export async function countryOf(ip: string): Promise<string | null> {
  if (!maxmind.validate(ip)) return null;
  const r = await reader();
  return r?.get(ip)?.country?.iso_code ?? null;
}
