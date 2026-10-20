// FanFit scoring shared by the server pipeline and the browser (the fan-mix sliders re-score client-side,
// so changing the mix never calls Qloo again). No server-only imports here.

export const AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export type Age = (typeof AGES)[number];
export const AGE_LABEL: Record<Age, string> = {
  "24_and_younger": "≤24",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

export type Weights = Record<Age, number>;

export type Kind = "brand" | "place";

export interface BrandHit {
  id: string;
  name: string;
  category: string;
  affinity: number;
  address?: string; // places only
  filled?: boolean; // affinity fetched directly, not from the age group's top results
  // Affinity from the team signal alone. With the city in the signal Qloo drops some brands entirely
  // (Xbox for Seattle, Western Union for Denver), so these are ranked in a separate team-only pool.
  pool?: "team";
}

export interface FitRow {
  id: string;
  name: string;
  category: string;
  address?: string;
  score: number; // 0–100, see scoreBrands
  byAge: Record<Age, number>; // percentile within each age group, 0–1
  driver: Age;
  reach: number;
  noLocal: boolean; // no team + city affinity in any age group; scored on the team-only pool
}

/** Qloo urn:demographics returns relative affinity in about [-1, 1]; 1 + v turns it into a non-negative share. */
export function weightsFromAffinity(age: Partial<Record<Age, number>>): Weights {
  const raw = Object.fromEntries(AGES.map((a) => [a, Math.max(0, 1 + (age[a] ?? 0))])) as Weights;
  return normalize(raw);
}

export function normalize(w: Weights): Weights {
  const total = AGES.reduce((s, a) => s + w[a], 0) || 1;
  return Object.fromEntries(AGES.map((a) => [a, w[a] / total])) as Weights;
}

/**
 * Fit score, 0–100.
 * 1. In each age group, every candidate brand is ranked by its Qloo affinity and turned into a percentile
 *    (100 = best candidate for that group, 0 = worst). Raw affinities cluster around 0.9 and their level differs
 *    by group, so ranks compare fairly across groups and spread the scores out.
 * 2. Fit = the fan-mix-weighted average of those percentiles.
 *    Team + city affinities and team-only affinities (pool "team") are ranked separately because their levels
 *    differ; a brand uses its team + city percentile when it has one, otherwise its team-only percentile shrunk
 *    toward the middle by the two signals' agreement (see below).
 * Missing values (Qloo did not return the brand even when asked directly) count as that group's floor (0).
 * Driver = the group where the brand does best relative to its own average; reach = real top-list appearances.
 */
export function scoreBrands(buckets: Record<Age, BrandHit[]>, weights: Weights): FitRow[] {
  const pct = {} as Record<Age, Map<string, number>>;
  const hits = new Map<string, BrandHit>();
  const reach = new Map<string, number>();
  const local = new Set<string>();
  for (const a of AGES) {
    const all = buckets[a] ?? [];
    const primary = new Map(all.filter((h) => !h.pool).map((h) => [h.id, h]));
    const cityPct = percentiles([...primary.values()]);
    const teamPct = percentiles(all.filter((h) => h.pool === "team"));
    // A brand scored on the team signal alone gets its expected team + city percentile: pulled toward the middle by
    // how well the two signals agree on brands that have both. Without this, brands that only surfaced because they
    // top the team-only list would also top the ranking.
    const shared = [...cityPct.keys()].filter((id) => teamPct.has(id));
    const rho = Math.max(0, correlation(shared.map((id) => teamPct.get(id)!), shared.map((id) => cityPct.get(id)!)));
    pct[a] = new Map(cityPct);
    for (const [id, p] of teamPct) if (!cityPct.has(id)) pct[a].set(id, 0.5 + rho * (p - 0.5));
    for (const h of all) {
      if (h.pool && primary.has(h.id)) continue; // team-only entry only serves as rank reference here
      if (!h.pool) local.add(h.id);
      const prev = hits.get(h.id);
      // Prefer a team + city entry, then a real top-list entry over a backfilled one.
      if (!prev || (prev.pool && !h.pool) || (prev.pool === h.pool && prev.filled && !h.filled)) hits.set(h.id, h);
      if (!h.filled) reach.set(h.id, (reach.get(h.id) ?? 0) + 1);
    }
  }
  const out: FitRow[] = [];
  for (const [id, hit] of hits) {
    const byAge = Object.fromEntries(AGES.map((a) => [a, pct[a].get(id) ?? 0])) as Record<Age, number>;
    const mean = AGES.reduce((s, a) => s + byAge[a], 0) / AGES.length;
    const driver = AGES.reduce((best, a) => {
      const d = byAge[a] - mean, bd = byAge[best] - mean;
      return d > bd || (d === bd && weights[a] > weights[best]) ? a : best;
    });
    out.push({
      id,
      name: hit.name,
      category: hit.category,
      address: hit.address,
      score: 100 * AGES.reduce((s, a) => s + weights[a] * byAge[a], 0),
      byAge,
      driver,
      reach: reach.get(id) ?? 0,
      noLocal: !local.has(id),
    });
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Pearson correlation; 0 when there are too few pairs to say anything. */
function correlation(x: number[], y: number[]) {
  if (x.length < 10) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** 1 = highest affinity in the list, 0 = lowest. Ties share the average rank so equal affinities get equal percentiles. */
function percentiles(items: BrandHit[]) {
  const list = [...items].sort((x, y) => y.affinity - x.affinity);
  const out = new Map<string, number>();
  for (let i = 0; i < list.length; ) {
    let j = i;
    while (j + 1 < list.length && list[j + 1].affinity === list[i].affinity) j++;
    const p = list.length > 1 ? 1 - (i + j) / 2 / (list.length - 1) : 1;
    for (let k = i; k <= j; k++) out.set(list[k].id, p);
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------- sponsorship categories

// Categories typically sold exclusively, grouped so near-misses show up as "crowded" rather than "conflict".
export const CATEGORIES = {
  beer: "alcohol", hard_seltzer: "alcohol", tequila: "alcohol", whiskey: "alcohol", other_spirits: "alcohol", wine: "alcohol",
  soft_drink: "beverage", water: "beverage", sports_drink_hydration: "beverage", energy_drink: "beverage", coffee_tea: "beverage",
  snacks_packaged_food: "food", restaurant: "food", grocery: "food",
  bank_credit_union: "finance", insurance: "finance", investing_fintech: "finance", crypto: "finance",
  healthcare_provider: "health", pharmacy: "health", supplements_wellness: "health",
  automaker: "automotive", auto_dealer_service: "automotive", tires_auto_parts: "automotive",
  airline: "travel", hotel_travel: "travel", rideshare_mobility: "travel",
  sportsbook: "gaming", casino: "gaming",
  apparel: "fashion", footwear: "fashion", jewelry_eyewear_watches: "fashion",
  outdoor_gear_coolers: "home_outdoor", cookware_kitchen: "home_outdoor", furniture_home: "home_outdoor",
  telecom: "tech", computing_hardware: "tech", software_it: "tech", office_equipment: "tech",
  energy_oil_gas: "energy_utilities", utilities: "energy_utilities",
  shipping_logistics: "services", ticketing: "services", real_estate_construction: "services",
  beauty_personal_care: "retail", general_retail: "retail", pet: "retail",
  media: "other", education: "other", nonprofit_government: "other", other: "other",
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

const LABELS: Partial<Record<Category, string>> = {
  bank_credit_union: "Bank / credit union", investing_fintech: "Investing / fintech", sports_drink_hydration: "Sports drink / hydration",
  coffee_tea: "Coffee / tea", snacks_packaged_food: "Snacks / packaged food", healthcare_provider: "Healthcare provider",
  supplements_wellness: "Supplements / wellness", auto_dealer_service: "Auto dealer / service", tires_auto_parts: "Tires / auto parts",
  hotel_travel: "Hotel / travel", rideshare_mobility: "Rideshare / mobility", jewelry_eyewear_watches: "Jewelry / eyewear / watches",
  outdoor_gear_coolers: "Outdoor gear / coolers", cookware_kitchen: "Cookware / kitchen", furniture_home: "Furniture / home",
  software_it: "Software / IT", energy_oil_gas: "Energy / oil & gas", shipping_logistics: "Shipping / logistics",
  real_estate_construction: "Real estate / construction", beauty_personal_care: "Beauty / personal care",
  nonprofit_government: "Nonprofit / government", other_spirits: "Other spirits",
};
/** "bank_credit_union" -> "Bank / credit union". */
export const categoryLabel = (c: string) =>
  LABELS[c as Category] ?? c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " ");

/**
 * Sponsorship categories for the per-category view. `tags` are Qloo industry tag slugs (urn:tag:industry:qloo:<slug>);
 * `exclude` drops brands that also carry one of these industry names (the tags are loose: Zoom is "telecommunications",
 * universities are "healthcare"); `covers` maps to the sponsor categories above, to flag categories already signed.
 */
export const SPONSOR_CATEGORIES = [
  { key: "bank", label: "Bank", tags: ["banking"], covers: ["bank_credit_union"] },
  { key: "insurance", label: "Insurance", tags: ["insurance"], covers: ["insurance"] },
  {
    key: "alcohol",
    label: "Beer & spirits",
    tags: ["alcoholic_beverages", "brewery", "brewing", "beer", "spirits"],
    exclude: ["Retail"],
    covers: ["beer", "hard_seltzer", "tequila", "whiskey", "other_spirits", "wine"],
  },
  {
    key: "beverage",
    label: "Drinks & hydration",
    tags: ["soft_drinks", "bottled_water", "functional_beverages", "sports_nutrition", "energy_drinks", "coffee"],
    covers: ["soft_drink", "water", "sports_drink_hydration", "energy_drink", "coffee_tea"],
  },
  { key: "auto", label: "Automotive", tags: ["automotive"], exclude: ["Media & Entertainment", "Publishing"], covers: ["automaker", "auto_dealer_service", "tires_auto_parts"] },
  {
    key: "telecom",
    label: "Telecom",
    tags: ["telecommunications"],
    exclude: ["Software", "Media & Entertainment", "Digital Media", "News", "Streaming Services", "Journalism"],
    covers: ["telecom"],
  },
  { key: "airline", label: "Airline", tags: ["aviation"], exclude: ["Education", "Higher Education"], covers: ["airline"] },
  {
    key: "health",
    label: "Healthcare",
    tags: ["healthcare", "hospitals"],
    exclude: ["Education", "Higher Education", "Nonprofit", "Research", "Medical Research", "Philanthropy"],
    covers: ["healthcare_provider"],
  },
  { key: "betting", label: "Sportsbook", tags: ["sports_betting", "online_sports_betting", "gambling"], covers: ["sportsbook", "casino"] },
  {
    key: "restaurant",
    label: "Restaurants",
    tags: ["quick_service_restaurants", "fast_food", "fast_casual_dining", "restaurant_chain", "casual_dining"],
    covers: ["restaurant"],
  },
  { key: "sportswear", label: "Sportswear & footwear", tags: ["sportswear", "sporting_goods", "athleisure", "footwear"], covers: ["apparel", "footwear"] },
  { key: "retail", label: "Grocery & retail", tags: ["grocery", "supermarket_chain", "general_merchandise"], covers: ["grocery", "general_retail"] },
  { key: "tech", label: "Consumer tech", tags: ["consumer_electronics"], covers: ["computing_hardware", "software_it"] },
] as const satisfies readonly { key: string; label: string; tags: readonly string[]; exclude?: readonly string[]; covers: readonly Category[] }[];
export type SponsorCategoryKey = (typeof SPONSOR_CATEGORIES)[number]["key"];

export interface Sponsor {
  name: string;
  category: Category;
  tier: string;
  sourceUrl: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function sameCompany(a: string, b: string) {
  const [x, y] = [norm(a), norm(b)];
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
}

/** Same primary category = conflict. A secondary category or the same group = crowded (warning only). */
export function checkConflicts(name: string, cats: Category[], sponsors: Sponsor[]) {
  const existing = sponsors.filter((s) => sameCompany(name, s.name));
  const others = sponsors.filter((s) => !existing.includes(s));
  const conflicts = others.filter((s) => s.category === cats[0] && s.category !== "other");
  const groups = new Set<string>([...cats, ...cats.map((c) => CATEGORIES[c])]);
  groups.delete("other");
  const crowded = others.filter(
    (s) => !conflicts.includes(s) && (groups.has(s.category) || groups.has(CATEGORIES[s.category])),
  );
  return { existing, conflicts, crowded };
}
