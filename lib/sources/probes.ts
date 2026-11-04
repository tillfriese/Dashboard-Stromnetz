import { fetchWithRetry } from "@/lib/http";
import { getSetting, type SourceId } from "@/lib/settings";

export type ProbeResult = { ok: boolean; message: string; latencyMs: number };

const ENTSOE_DE_LU = "10Y1001A1001A82H";
const ENTSOE_FR = "10YFR-RTE------C";

/** ENTSO-E period format yyyyMMddHHmm (UTC). */
function entsoePeriod(d: Date) {
  return d.toISOString().slice(0, 16).replace(/[-T:]/g, "");
}

async function timed(fn: () => Promise<{ ok: boolean; message: string }>): Promise<ProbeResult> {
  const start = performance.now();
  try {
    const r = await fn();
    return { ...r, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError" ? "Zeitüberschreitung" : (err as Error).message;
    return { ok: false, message: `Netzwerkfehler: ${message}`, latencyMs: Math.round(performance.now() - start) };
  }
}

/**
 * Real test requests against each source (documented endpoints only).
 * `override` tests a value that has not been saved yet.
 */
export async function probeSource(source: SourceId, override?: string): Promise<ProbeResult> {
  const quick = { retries: 0, timeoutMs: 15_000 };
  switch (source) {
    case "smard":
      return timed(async () => {
        const res = await fetchWithRetry("https://www.smard.de/app/chart_data/410/DE/index_quarterhour.json", quick);
        if (!res.ok) return { ok: false, message: `SMARD antwortet mit HTTP ${res.status}` };
        const body = (await res.json()) as { timestamps?: number[] };
        return { ok: true, message: `Erreichbar, ${body.timestamps?.length ?? 0} Wochenblöcke verfügbar` };
      });

    case "energycharts":
      return timed(async () => {
        const res = await fetchWithRetry("https://api.energy-charts.info/v2/price_current?bzn=DE-LU", quick);
        return res.ok ? { ok: true, message: "Erreichbar" } : { ok: false, message: `Energy-Charts antwortet mit HTTP ${res.status}` };
      });

    case "entsoe": {
      const token = override ?? (await getSetting("entsoe.token"));
      if (!token) return { ok: false, message: "Kein Token hinterlegt", latencyMs: 0 };
      return timed(async () => {
        const end = new Date();
        end.setUTCMinutes(0, 0, 0);
        const start = new Date(end.getTime() - 24 * 3600_000);
        const url =
          `https://web-api.tp.entsoe.eu/api?securityToken=${encodeURIComponent(token)}` +
          `&documentType=A11&in_Domain=${ENTSOE_DE_LU}&out_Domain=${ENTSOE_FR}` +
          `&periodStart=${entsoePeriod(start)}&periodEnd=${entsoePeriod(end)}`;
        const res = await fetchWithRetry(url, quick);
        if (res.status === 401) return { ok: false, message: "Token ungültig (HTTP 401)" };
        if (!res.ok) return { ok: false, message: `ENTSO-E antwortet mit HTTP ${res.status}` };
        const xml = await res.text();
        const points = (xml.match(/<Point>/g) ?? []).length;
        return { ok: true, message: `Token gültig, ${points} Werte (Fluss DE-LU → FR, letzte 24 h)` };
      });
    }

    case "gridradar": {
      const token = override ?? (await getSetting("gridradar.token"));
      if (!token) return { ok: false, message: "Kein Token hinterlegt", latencyMs: 0 };
      return timed(async () => {
        // "/" is Gridradar's documented token test endpoint.
        const res = await fetchWithRetry("https://api.gridradar.net/", { ...quick, headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) return { ok: false, message: "Token ungültig (HTTP 401)" };
        if (res.status === 429) return { ok: false, message: "Limit überschritten (HTTP 429), später erneut testen" };
        return res.ok ? { ok: true, message: "Token gültig" } : { ok: false, message: `Gridradar antwortet mit HTTP ${res.status}` };
      });
    }

    case "stromgedacht": {
      const zip = override ?? (await getSetting("stromgedacht.zip")) ?? "70173";
      return timed(async () => {
        const res = await fetchWithRetry(`https://api.stromgedacht.de/v1/now?zip=${encodeURIComponent(zip)}`, {
          ...quick,
          minIntervalMs: 10_000, // documented limit: about 6 requests per minute
        });
        if (!res.ok) {
          const text = (await res.text()).slice(0, 200);
          const reason = text.includes("No data") ? "keine Daten für diese PLZ (nur Baden-Württemberg)" : `HTTP ${res.status}`;
          return { ok: false, message: `PLZ ${zip}: ${reason}` };
        }
        const { state } = (await res.json()) as { state?: number };
        const labels: Record<number, string> = { [-1]: "Supergrün", 1: "Grün", 3: "Orange", 4: "Rot" };
        return { ok: true, message: `PLZ ${zip}: aktueller Zustand ${labels[state ?? 0] ?? String(state)}` };
      });
    }
  }
}
