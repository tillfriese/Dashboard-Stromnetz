/** Series keys, importable from client code (no server dependencies). */
export const smardSeriesKey = (metric: string, region: string) => `smard:${metric}:${region}`;
export const PRICE_KEY = "energycharts:price:DE-LU";
export const flowKey = (cc: string) => `energycharts:flow:${cc}`;
export const NET_IMPORT_KEY = "energycharts:net_import:DE";
