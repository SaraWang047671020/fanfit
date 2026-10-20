// FanFit pipeline: fan mix -> brand affinity per age bucket -> local businesses -> current sponsors ->
// "why now" signals and exclusivity checks for the shortlist. Streams FanfitEvents so the UI can show each step.
// Qloo answers "who fits"; web search answers "why now" and "who is already signed"; conflicts are decided in code.

import OpenAI from "openai";
import { get, QlooError } from "./qloo";
import { adminClient } from "./supabase/admin";
import {
  AGES,
  AGE_LABEL,
  type Age,
  type BrandHit,
  CATEGORY_KEYS,
  type Category,
  type Kind,
  SPONSOR_CATEGORIES,
  type Sponsor,
  type SponsorCategoryKey,
  checkConflicts,
  sameCompany,
  scoreBrands,
  weightsFromAffinity,
} from "./fanfit-score";

const DEFAULT_MODEL = "gpt-5.4-mini";
const PAGES_PER_BUCKET = 3; // brands: 150 results; ~80% survive the sports filter once the city is in the signal
const PLACE_PAGES_PER_BUCKET = 2; // places are already local (filter.location), no sports filter needed
export const TIMING_TOP_N: Record<Kind, number> = { brand: 10, place: 6 };
const CATEGORY_TAKE = 20;
const CATEGORY_MIN = 5;
export const CATEGORY_SHOWN = 5;

// ---------------------------------------------------------------- events

export interface Signal {
  type: string;
  date: string;
  summary: string;
  url: string;
}

export interface Timing {
  brandId: string;
  name: string;
  categories: Category[];
  timing: 0 | 1 | 2 | 3;
  whyNow: string;
  relationship: string;
  fitRisk: string;
  signals: Signal[];
  existing: Sponsor[];
  conflicts: Sponsor[];
  crowded: Sponsor[];
  exclusivityOnly?: boolean; // checked against the sponsor list only: no news search, so timing is unknown
}

export interface CategoryHit {
  id: string;
  name: string;
  affinity: number;
}

export interface TeamInfo {
  id: string;
  name: string;
  city: string;
  tags: number;
}

export type FanfitEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "warn"; detail?: string }
  | { type: "team"; team: TeamInfo }
  | { type: "composition"; age: Partial<Record<Age, number>>; gender: { male?: number; female?: number }; estimated: boolean }
  | { type: "bucket"; kind: Kind; age: Age; items: BrandHit[] }
  // location = the signal used: the team's city, or "United States" when the city left fewer than CATEGORY_MIN brands.
  | { type: "category"; key: SponsorCategoryKey; location: string; considered: number; items: CategoryHit[] }
  | { type: "sponsors"; sponsors: Sponsor[]; source: "club" | "web" }
  | { type: "timing"; timing: Timing }
  | { type: "saved"; at: string } // replaying a stored run (see /api/fanfit), sent first
  | { type: "done"; ms: number }
  | { type: "error"; message: string };

type Emit = (e: FanfitEvent) => void;

// ---------------------------------------------------------------- Qloo

interface RawTag { name: string; type?: string }
export interface RawEntity {
  entity_id: string;
  name: string;
  tags?: RawTag[];
  properties?: { address?: string };
  query?: { affinity?: number };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export const tagNames = (e: RawEntity, suffix: string) =>
  (e.tags ?? []).filter((t) => t.type?.endsWith(suffix)).map((t) => t.name);

// Teams, leagues, governing bodies, sports media and athlete charities. Listed explicitly: a plain "Sports" match also
// removed the brands that buy sports sponsorships most (Gatorade, Nike, DraftKings, Dick's carry "Sports & Fitness",
// "Sports Nutrition" or "Sports Betting").
const NOT_A_SPONSOR = new Set([
  "Sports Organization", "Sports Team", "Sports League", "Sports Leagues", "Professional Sports", "Professional Sports League",
  "Professional Sports Leagues", "Professional Sports Organizations", "Leagues & Tournaments", "Major League Baseball",
  "National Football League", "National Hockey League", "NBA G League", "Minor League Baseball", "American Hockey League",
  "Athletics", "Collegiate Athletics", "Intercollegiate Athletics", "Sports & Athletics", "Sports Governance",
  "Sports Governing Bodies", "Sports", "Sports Broadcasting", "Sports Media", "Sports NGO", "Sports Agency",
  "Sports Marketing", "Professional Sports Promotions",
]);

/** Other teams, leagues and sports media crowd out brands in raw results. */
export function isSportsy(e: RawEntity) {
  return [...tagNames(e, "industry:qloo"), ...tagNames(e, "genre:brand")].some((t) => NOT_A_SPONSOR.has(t));
}

export function category(e: RawEntity) {
  const industry = tagNames(e, "industry:qloo").filter((t) => t !== "Media & Entertainment");
  return industry[0] ?? tagNames(e, "genre:brand")[0] ?? tagNames(e, "category:place")[0] ?? "—";
}

export const entities = (raw: unknown) => (raw as { results?: { entities?: RawEntity[] } }).results?.entities ?? [];

async function findTeam(name: string) {
  const hits = await get("/search", { query: name, types: "urn:entity:brand", take: 5 }, (raw) =>
    ((raw as { results?: RawEntity[] }).results ?? []).map((e) => ({ id: e.entity_id, name: e.name, tags: e.tags?.length ?? 0 })),
  );
  // Qloo search always returns its nearest guess ("Rakuten Monkeys" -> Rakuten), so require a name match.
  return { hit: hits.find((h) => norm(h.name) === norm(name)), nearest: hits.map((h) => h.name) };
}

export async function composition(teamId: string) {
  return get("/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": teamId }, (raw) => {
    const d = (raw as { results?: { demographics?: { query?: { age?: Record<string, number>; gender?: Record<string, number> } }[] } })
      .results?.demographics?.[0]?.query;
    return d ? { age: (d.age ?? {}) as Partial<Record<Age, number>>, gender: d.gender ?? {} } : null;
  });
}

/** city = null drops the location signal for brands (some cities, e.g. "Savannah, GA", make Qloo return nothing). */
const kindParams = (kind: Kind, city: string | null): Record<string, string> =>
  kind === "brand"
    ? { "filter.type": "urn:entity:brand", ...(city ? { "signal.location.query": city } : {}) }
    : { "filter.type": "urn:entity:place", "filter.location.query": city ?? "" };

/** One age bucket. Brands: team + city as taste signals. Places: team taste, results restricted to the city. */
async function bucket(kind: Kind, teamId: string, city: string | null, age: Age): Promise<BrandHit[]> {
  const params = kindParams(kind, city);
  const pages = await Promise.all(
    Array.from({ length: kind === "brand" ? PAGES_PER_BUCKET : PLACE_PAGES_PER_BUCKET }, (_, i) =>
      get(
        "/v2/insights",
        { ...params, "signal.interests.entities": teamId, "signal.demographics.age": age, take: 50, page: i + 1 },
        (raw) =>
          entities(raw)
            .filter((e) => kind === "place" || !isSportsy(e))
            .map((e) => ({
              id: e.entity_id,
              name: e.name,
              category: kind === "brand" ? category(e) : (tagNames(e, "category:place")[0] ?? "—"),
              affinity: e.query?.affinity ?? 0,
              ...(kind === "place" ? { address: e.properties?.address ?? "" } : {}),
            })),
      ),
    ),
  );
  const seen = new Set<string>();
  return pages.flat().filter((b) => !seen.has(b.id) && seen.add(b.id));
}

const BACKFILL_CHUNK = 40;

/**
 * A brand that made the top results for one age group usually did not for the others. Instead of guessing its
 * affinity there, ask Qloo for it directly (filter.results.entities, same signals as the bucket).
 * Backfilled hits are flagged so "in N/6 age groups" still counts only real top-list appearances.
 */
async function backfill(
  kind: Kind,
  teamId: string,
  city: string | null,
  age: Age,
  have: BrandHit[],
  all: Map<string, BrandHit>,
  pool?: "team",
) {
  const present = new Set(have.map((h) => h.id));
  const missing = [...all.values()].filter((h) => !present.has(h.id));
  const params = kindParams(kind, city);
  const chunks = Array.from({ length: Math.ceil(missing.length / BACKFILL_CHUNK) }, (_, i) =>
    missing.slice(i * BACKFILL_CHUNK, (i + 1) * BACKFILL_CHUNK),
  );
  const found = await Promise.all(
    chunks.map((chunk) =>
      get(
        "/v2/insights",
        {
          ...params,
          "signal.interests.entities": teamId,
          "signal.demographics.age": age,
          "filter.results.entities": chunk.map((h) => h.id).join(","),
          take: chunk.length,
        },
        (raw) => entities(raw).map((e) => [e.entity_id, e.query?.affinity] as const),
      ),
    ),
  );
  const filled: BrandHit[] = [];
  for (const [id, affinity] of found.flat()) {
    const h = all.get(id);
    if (h && typeof affinity === "number") filled.push({ ...h, affinity, filled: true, pool });
  }
  return [...have, ...filled];
}

/**
 * Best-fit brands in one sponsorship category for a team's fans: one Qloo call with the team and city as signals,
 * filtered by industry tags; widened to the US when the city leaves fewer than CATEGORY_MIN brands.
 */
export async function categoryLeaders(teamId: string, city: string, key: SponsorCategoryKey) {
  const c = SPONSOR_CATEGORIES.find((x) => x.key === key)!;
  const exclude = new Set<string>("exclude" in c ? c.exclude : []);
  const query = (location: string) =>
    get(
      "/v2/insights",
      {
        "filter.type": "urn:entity:brand",
        "filter.tags": c.tags.map((t) => `urn:tag:industry:qloo:${t}`).join(","),
        "signal.interests.entities": teamId,
        "signal.location.query": location,
        take: CATEGORY_TAKE,
      },
      (raw) =>
        entities(raw)
          .filter((e) => !isSportsy(e) && !tagNames(e, "industry:qloo").some((t) => exclude.has(t)))
          .map((e) => ({ id: e.entity_id, name: e.name, affinity: e.query?.affinity ?? 0 })),
    );
  let location = city;
  let items = await query(city);
  if (items.length < CATEGORY_MIN) {
    location = "United States";
    items = await query(location);
  }
  return { location, items };
}

/**
 * Best fit per sponsorship category: one Qloo call per category (team + city, no age split), filtered by industry tags.
 * Sponsorship is sold by category, and the overall list rarely reaches banks, insurers or airlines. The team signal alone
 * is not used as a fallback here: without a location it returns banks from every country.
 */
async function categoryFit(teamId: string, city: string, emit: Emit) {
  const label = "Best fit by sponsorship category (Qloo, team + city)";
  emit({ type: "step", id: "category", label, status: "running" });
  let widened = 0;
  const failed: string[] = [];
  await Promise.all(
    SPONSOR_CATEGORIES.map(async (c) => {
      try {
        const { location, items } = await categoryLeaders(teamId, city, c.key);
        if (location !== city) widened++;
        emit({ type: "category", key: c.key, location, considered: items.length, items: items.slice(0, CATEGORY_SHOWN) });
      } catch {
        failed.push(c.label); // a side view: one category failing should not stop the main run
      }
    }),
  );
  emit({
    type: "step",
    id: "category",
    label,
    status: failed.length ? "warn" : "done",
    detail:
      `${SPONSOR_CATEGORIES.length - failed.length} categories` +
      (widened ? `; ${widened} had too few brands with ${city} and use the US instead` : "") +
      (failed.length ? `; Qloo failed for ${failed.join(", ")}` : ""),
  });
}

// ---------------------------------------------------------------- OpenAI (web search + structured output)

export const S = { type: "string" };
const CAT = { type: "string", enum: CATEGORY_KEYS };
export const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export async function ask<T>(instructions: string, input: string, name: string, schema: object, search = true): Promise<T> {
  const client = new OpenAI();
  const res = await client.responses.create({
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    instructions,
    input,
    tools: search ? [{ type: "web_search" }] : [],
    text: { format: { type: "json_schema", name, schema: schema as Record<string, unknown>, strict: true } },
  });
  return JSON.parse(res.output_text) as T;
}

export const today = () => new Date().toISOString().slice(0, 10);

const SPONSOR_PROMPTS = [
  "List the current corporate partners/sponsors of {team} ({city}): the official partner list, jersey and sleeve sponsors, stadium naming rights.",
  "Find 2024–2026 announcements of new or renewed partnerships for {team} ({city}): 'official beer/spirits/bank/healthcare/auto/airline/beverage partner' and similar.",
  // Category-by-category pass: single-category deals (e.g. an official tequila) are easy to miss in list pages.
  "Search category by category for {team} ({city}): official beer, tequila, whiskey or spirits, wine, soft drink, water, sports drink, coffee, " +
    "restaurant, grocery, bank or credit union, insurance, healthcare, automaker, auto dealer, airline, hotel, telecom, sportsbook, apparel partner.",
];

// Sponsor lists and brand categories change slowly; keep them for the life of the server process.
const sponsorCache = new Map<string, Promise<Sponsor[]>>();
const categoryCache = new Map<string, Category[]>();

export function teamSponsors(team: string, city: string) {
  const key = norm(team);
  if (!sponsorCache.has(key)) {
    const p = (async () => {
      const schema = obj({ sponsors: { type: "array", items: obj({ name: S, category: CAT, tier: S, source_url: S }) } });
      const passes = await Promise.all(
        SPONSOR_PROMPTS.map((prompt) =>
          ask<{ sponsors: { name: string; category: Category; tier: string; source_url: string }[] }>(
            `You research sports sponsorship. Today is ${today()}. Use web search. Only list sponsors you found a source for. ` +
              "Map each to the single category it holds rights in (e.g. Michelob Ultra -> beer, a tequila brand -> tequila).",
            prompt.replace("{team}", team).replace("{city}", city) + " Give tier (e.g. 'jersey', 'stadium naming', 'official partner').",
            "team_sponsors",
            schema,
          ),
        ),
      );
      // Passes name the same deal differently ("Anheuser-Busch / Michelob Ultra" vs "Michelob Ultra"); keep the first.
      const parts = (n: string) => n.split(/[/&,]| and /).map(norm).filter(Boolean);
      const merged: Sponsor[] = [];
      for (const s of passes.flatMap((p) => p.sponsors)) {
        const dup = merged.some((m) => parts(m.name).some((a) => parts(s.name).some((b) => sameCompany(a, b))));
        if (!dup) merged.push({ name: s.name, category: s.category, tier: s.tier, sourceUrl: s.source_url });
      }
      return merged.sort((a, b) => a.category.localeCompare(b.category));
    })();
    p.catch(() => sponsorCache.delete(key));
    sponsorCache.set(key, p);
  }
  return sponsorCache.get(key)!;
}

/**
 * The team's current sponsors: the list the club keeps on FanFit when it has one (exact and stable), else web search.
 * Matched by team name, since runs and activations know the team by name and city.
 */
export async function currentSponsors(team: string, city: string): Promise<{ sponsors: Sponsor[]; source: "club" | "web" }> {
  const db = adminClient();
  if (db) {
    const { data } = await db
      .from("team_sponsors")
      .select("name, category, tier, source_url, teams!inner(name)")
      .eq("teams.name", team)
      .returns<{ name: string; category: Category; tier: string; source_url: string | null }[]>();
    if (data?.length)
      return {
        sponsors: data.map((s) => ({ name: s.name, category: s.category, tier: s.tier, sourceUrl: s.source_url ?? "" })),
        source: "club",
      };
  }
  return { sponsors: await teamSponsors(team, city), source: "web" };
}

export async function brandCategories(brands: { name: string; category: string }[]) {
  const todo = brands.filter((b) => !categoryCache.has(norm(b.name)));
  if (todo.length) {
    const schema = obj({
      brands: {
        type: "array",
        items: obj({ name: S, categories: { type: "array", items: CAT, description: "1–2 categories, main product line first." } }),
      },
    });
    const got = await ask<{ brands: { name: string; categories: Category[] }[] }>(
      "Classify consumer brands into sponsorship categories by their main product line.",
      "For each brand, give 1–2 categories it could be the 'official X partner' of:\n" +
        todo.map((b) => `- ${b.name} (Qloo industry: ${b.category})`).join("\n"),
      "brand_categories",
      schema,
      false,
    );
    const byName = new Map(got.brands.map((g) => [norm(g.name), g.categories]));
    for (const b of todo) categoryCache.set(norm(b.name), byName.get(norm(b.name))?.length ? byName.get(norm(b.name))! : ["other"]);
  }
  return new Map(brands.map((b) => [b.name, categoryCache.get(norm(b.name))!]));
}

const SIGNAL_TYPES = ["market_expansion", "new_product", "sports_sponsorship", "marketing_campaign", "local_event", "funding_or_growth", "negative_news"];

export async function brandTiming(team: string, city: string, item: Candidate) {
  const schema = obj({
    signals: { type: "array", items: obj({ type: { type: "string", enum: SIGNAL_TYPES }, date: S, summary: S, url: S }) },
    relationship: {
      type: "string",
      description: "A sourced, direct tie with THIS team (sponsorship, licensed merchandise, collaboration). Empty string if none was found; do not explain absence.",
    },
    fit_risk: { type: "string", description: "What makes this a poor or risky partner (no presence in the market, closed, controversy). Empty string if nothing notable." },
    timing: { type: "integer", enum: [0, 1, 2, 3], description: "0 = no reason to talk now, 3 = strong, recent, local reason." },
    why_now: { type: "string", description: "One sentence a sales rep could use, or empty if timing is 0." },
  });
  const subject =
    item.address !== undefined
      ? `Local business: ${item.name} (${item.category}), ${item.address}.\n` +
        "Find recent reasons it might want a partnership with the team now: new or upcoming locations, anniversaries, new menus or services, " +
        "local events, awards or press, sponsorships of other local teams. Also note closures or negative news."
      : `Brand: ${item.name} (category: ${item.category}).\n` +
        `Find recent reasons this brand might want a local sports partnership now: opening stores or expanding in or near ${city}, ` +
        "launching products, sponsoring other teams or events, big campaigns, growth or funding. Also note negative news.";
  return ask<{ signals: Signal[]; relationship: string; fit_risk: string; timing: 0 | 1 | 2 | 3; why_now: string }>(
    `You help a sports team's sales staff decide whom to call. Today is ${today()}. Use web search. ` +
      "Report only signals you found a source for, from the last 18 months, with the source URL. Prefer signals tied to the team's city. Do not invent dates.",
    `Team: ${team} (${city}).\n${subject}\nAlso note any existing tie with this team. If it is a poor fit, say so in fit_risk.`,
    "brand_timing",
    schema,
  );
}

// ---------------------------------------------------------------- pipeline

export interface Candidate {
  id: string;
  name: string;
  category: string;
  address?: string; // set for local businesses
}

/** Timing + conflict checks for brands and local businesses; used by the full run and by "check new candidates". */
export async function runTiming(team: string, city: string, brands: Candidate[], emit: Emit) {
  const sponsorLabel = "Current sponsors (the club's list on FanFit, else web search)";
  emit({ type: "step", id: "sponsors", label: sponsorLabel, status: "running" });
  const { sponsors, source } = await currentSponsors(team, city);
  emit({ type: "sponsors", sponsors, source });
  emit({
    type: "step",
    id: "sponsors",
    label: sponsorLabel,
    status: "done",
    detail: `${sponsors.length} sponsors ${source === "club" ? "listed by the club" : "found by web search (the club has not listed its sponsors)"}`,
  });

  const cats = await brandCategories(brands);
  const nPlaces = brands.filter((b) => b.address !== undefined).length;
  const what = [brands.length - nPlaces && `${brands.length - nPlaces} brands`, nPlaces && `${nPlaces} local businesses`]
    .filter(Boolean)
    .join(" + ");
  const label = `Check "why now" signals and exclusivity for ${what}`;
  emit({ type: "step", id: "timing", label, status: "running" });
  let done = 0;
  const queue = [...brands];
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const brand = b;
        const categories = cats.get(brand.name)!;
        const t = await brandTiming(team, city, brand).catch(() => null);
        const { existing, conflicts, crowded } = checkConflicts(brand.name, categories, sponsors, brand.address !== undefined);
        emit({
          type: "timing",
          timing: {
            brandId: brand.id,
            name: brand.name,
            categories,
            timing: t?.timing ?? 0,
            whyNow: t?.why_now ?? "",
            // The model sometimes explains an absence ("No direct tie found…") despite the schema; treat that as none.
            relationship: /^(no|none|not)\b|not found|no (direct|sourced|explicit)/i.test(t?.relationship ?? "") ? "" : (t?.relationship ?? ""),
            fitRisk: t ? t.fit_risk : "Search failed for this one.",
            signals: t?.signals ?? [],
            existing,
            conflicts,
            crowded,
          },
        });
        emit({ type: "step", id: "timing", label, status: "running", detail: `${++done}/${brands.length} checked` });
      }
    }),
  );
  emit({ type: "step", id: "timing", label, status: "done", detail: `${brands.length} checked; conflicts decided by category rules` });
}

/**
 * Exclusivity only, for candidates the timing step never reached: the sponsor list plus one category lookup, no news
 * search and no Qloo. Keeps an already-signed brand from sitting at the top as if it were open.
 */
export async function runExclusivity(team: string, city: string, items: Candidate[], emit: Emit) {
  const label = `Check exclusivity for ${items.length} more candidates (sponsor list only)`;
  emit({ type: "step", id: "exclusivity", label, status: "running" });
  const [{ sponsors, source }, cats] = await Promise.all([currentSponsors(team, city), brandCategories(items)]);
  emit({ type: "sponsors", sponsors, source });
  let flagged = 0;
  for (const b of items) {
    const categories = cats.get(b.name) ?? ["other"];
    const c = checkConflicts(b.name, categories, sponsors, b.address !== undefined);
    if (c.existing.length || c.conflicts.length) flagged++;
    emit({
      type: "timing",
      timing: { brandId: b.id, name: b.name, categories, timing: 0, whyNow: "", relationship: "", fitRisk: "", signals: [], ...c, exclusivityOnly: true },
    });
  }
  emit({ type: "step", id: "exclusivity", label, status: "done", detail: `${flagged} set aside as signed or clashing` });
}

export async function runFanfit(teamName: string, city: string, emit: Emit) {
  const t0 = Date.now();

  emit({ type: "step", id: "team", label: `Resolve "${teamName}" in Qloo`, status: "running" });
  const { hit, nearest } = await findTeam(teamName);
  if (!hit)
    throw new QlooError(404, `"${teamName}" is not in Qloo as a team. Closest matches: ${nearest.join(", ") || "none"}.`);
  const team: TeamInfo = { id: hit.id, name: hit.name, city, tags: hit.tags };
  emit({ type: "team", team });
  emit({ type: "step", id: "team", label: `Resolve "${teamName}" in Qloo`, status: "done", detail: `${hit.name} · ${hit.tags} tags` });

  emit({ type: "step", id: "mix", label: "Estimate the fan mix (Qloo demographics)", status: "running" });
  const comp = await composition(team.id);
  if (comp) {
    emit({ type: "composition", age: comp.age, gender: comp.gender, estimated: true });
    const w = weightsFromAffinity(comp.age);
    const top = [...AGES].sort((a, b) => w[b] - w[a]).slice(0, 2).map((a) => AGE_LABEL[a]);
    emit({ type: "step", id: "mix", label: "Estimate the fan mix (Qloo demographics)", status: "done", detail: `Largest groups: ${top.join(", ")}. Adjust the sliders if you have your own data.` });
  } else {
    emit({ type: "composition", age: {}, gender: {}, estimated: false });
    emit({ type: "step", id: "mix", label: "Estimate the fan mix (Qloo demographics)", status: "warn", detail: "No demographic data for this team; using an even mix." });
  }

  const KINDS = ["brand", "place"] as const;
  const labels: Record<Kind, string> = {
    brand: `Brands these fans like, by age group (team + ${city})`,
    place: `Local businesses these fans like in ${city}, by age group`,
  };
  const buckets = { brand: {}, place: {} } as Record<Kind, Record<Age, BrandHit[]>>;
  const signalCity: Record<Kind, string | null> = { brand: city, place: city };
  const fetchKind = (kind: Kind) =>
    Promise.all(
      AGES.map(async (age) => {
        buckets[kind][age] = await bucket(kind, team.id, signalCity[kind], age);
        emit({ type: "bucket", kind, age, items: buckets[kind][age] });
        emit({ type: "step", id: kind, label: labels[kind], status: "running", detail: `${Object.keys(buckets[kind]).length}/6 age groups` });
      }),
    );
  // Team-only brand lists, fetched alongside: the reference pool for brands Qloo drops once the city is in the signal,
  // and the whole brand list when the city signal returns nothing at all.
  const teamOnly = {} as Record<Age, BrandHit[]>;
  const fetchTeamOnly = Promise.all(
    AGES.map(async (age) => {
      teamOnly[age] = await bucket("brand", team.id, null, age);
    }),
  );
  for (const kind of KINDS) emit({ type: "step", id: kind, label: labels[kind], status: "running" });
  await Promise.all([...KINDS.map(fetchKind), fetchTeamOnly, categoryFit(team.id, city, emit)]);
  const total = (kind: Kind) => new Set(AGES.flatMap((a) => buckets[kind][a].map((b) => b.id))).size;
  if (total("brand") === 0) {
    // Qloo returns nothing for some city signals; fall back to the team's taste alone.
    signalCity.brand = null;
    for (const age of AGES) {
      buckets.brand[age] = teamOnly[age];
      emit({ type: "bucket", kind: "brand", age, items: teamOnly[age] });
    }
  }
  const teamPool = signalCity.brand
    ? (Object.fromEntries(AGES.map((a) => [a, teamOnly[a].map((h) => ({ ...h, pool: "team" as const }))])) as Record<Age, BrandHit[]>)
    : null;
  for (const kind of KINDS) {
    const n = total(kind);
    const fallback = kind === "brand" && !signalCity.brand;
    const detail =
      kind === "brand"
        ? `${n} distinct brands after removing teams, leagues and sports media${fallback ? ` (Qloo had no brand data with ${city} as a signal, so this uses the team's fans alone)` : ""}`
        : `${n} distinct places`;
    emit({ type: "step", id: kind, label: labels[kind], status: fallback || n === 0 ? "warn" : "done", detail });
  }

  const fillLabel = "Fetch real affinity for every candidate in every age group (Qloo)";
  emit({ type: "step", id: "backfill", label: fillLabel, status: "running" });
  const fillStats = { asked: 0, got: 0, t0: Date.now() };
  await Promise.all(
    KINDS.flatMap((kind) => {
      const pool = kind === "brand" ? teamPool : null;
      // Candidates include brands that only showed up without the city, so they get a team + city try too.
      const all = new Map(AGES.flatMap((a) => [...(pool?.[a] ?? []), ...buckets[kind][a]].map((h) => [h.id, h] as const)));
      return AGES.map(async (age) => {
        const before = buckets[kind][age].length;
        buckets[kind][age] = await backfill(kind, team.id, signalCity[kind], age, buckets[kind][age], all);
        fillStats.asked += all.size - before;
        fillStats.got += buckets[kind][age].length - before;
        if (pool) {
          // Team-only affinity for every candidate, not just the dropped ones: the team-only top list keeps only a
          // handful of brands after the sports filter, so a dropped brand is ranked against all candidates instead.
          // The two signals agree well on shared brands (rank correlation ~0.7–0.8 for Seattle).
          buckets[kind][age] = [...buckets[kind][age], ...(await backfill(kind, team.id, null, age, pool[age], all, "team"))];
        }
        emit({ type: "bucket", kind, age, items: buckets[kind][age] });
      });
    }),
  );
  const local = new Set(AGES.flatMap((a) => buckets.brand[a].filter((h) => !h.pool).map((h) => h.id)));
  const teamOnlyBrands = new Set(AGES.flatMap((a) => buckets.brand[a].filter((h) => h.pool && !local.has(h.id)).map((h) => h.id))).size;
  emit({
    type: "step",
    id: "backfill",
    label: fillLabel,
    status: "done",
    detail:
      `${fillStats.got}/${fillStats.asked} missing scores filled in ${((Date.now() - fillStats.t0) / 1000).toFixed(0)}s; scores are ranked within each age group, then weighted by the fan mix` +
      (teamOnlyBrands ? `. ${teamOnlyBrands} brands have no data with ${city} in the signal and are scored on the team's fans alone` : ""),
  });

  const w = weightsFromAffinity(comp?.age ?? {});
  const shortlist: Candidate[] = KINDS.flatMap((kind) =>
    scoreBrands(buckets[kind], w)
      .slice(0, TIMING_TOP_N[kind])
      .map(({ id, name, category, address }) => ({ id, name, category, ...(kind === "place" ? { address: address ?? "" } : {}) })),
  );
  await runTiming(team.name, city, shortlist, emit);

  emit({ type: "done", ms: Date.now() - t0 });
}
