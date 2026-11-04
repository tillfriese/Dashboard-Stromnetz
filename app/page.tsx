import { NowDashboard } from "@/components/now/now-dashboard";
import { getMix } from "@/lib/queries/mix";
import { getNowData } from "@/lib/queries/now";
import { getPrices } from "@/lib/queries/prices";

export const dynamic = "force-dynamic";

/** "Aktuell": server-rendered first paint, then the client polls the API every 60 s. */
export default async function NowPage() {
  const [now, mix] = await Promise.all([getNowData().catch(() => null), getMix("48h").catch(() => null)]);
  const prices = now && !now.publicMode ? await getPrices(2).catch(() => null) : null;
  return <NowDashboard initialNow={now} initialPrices={prices} initialMix={mix} />;
}
