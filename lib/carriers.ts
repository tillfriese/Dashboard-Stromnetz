/**
 * Energy carriers in their fixed display order. Colours must match the
 * `--color-carrier-*` tokens in app/globals.css and are never reassigned.
 */
export const CARRIERS = [
  { key: "hydro", label: "Wasserkraft", color: "#19a3b8", renewable: true },
  { key: "biomass", label: "Biomasse", color: "#008300", renewable: true },
  { key: "wind", label: "Wind", color: "#2a78d6", renewable: true },
  { key: "solar", label: "Photovoltaik", color: "#eda100", renewable: true },
  { key: "lignite", label: "Braunkohle", color: "#9c4a1a", renewable: false },
  { key: "hardcoal", label: "Steinkohle", color: "#6250d6", renewable: false },
  { key: "gas", label: "Erdgas", color: "#eb6834", renewable: false },
  { key: "nuclear", label: "Kernenergie", color: "#b24f8a", renewable: false },
  { key: "other", label: "Sonstige", color: "#8a8f98", renewable: false },
] as const;

export type CarrierKey = (typeof CARRIERS)[number]["key"];

/** Regions: Germany as a whole and the four transmission system operator zones. */
export const REGIONS = [
  { key: "DE", label: "Deutschland" },
  { key: "50Hertz", label: "50Hertz", states: ["BE", "BB", "MV", "SN", "ST", "TH", "HH"] },
  { key: "Amprion", label: "Amprion", states: ["NW", "RP", "SL"] },
  { key: "TenneT", label: "TenneT", states: ["SH", "NI", "HB", "HE", "BY"] },
  { key: "TransnetBW", label: "TransnetBW", states: ["BW"] },
] as const;

/** The 11 neighbouring countries with physical cross-border flows. */
export const NEIGHBOURS = ["NO", "DK", "SE", "NL", "BE", "LU", "FR", "CH", "AT", "CZ", "PL"] as const;
