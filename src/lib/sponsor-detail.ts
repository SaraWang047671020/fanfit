// Sponsor side, one team in detail: why the fit is there (all from Qloo) and why now (web search).
//   audiences  <- urn:demographics for the team and for the brand, side by side
//   shared     <- brands / artists / local places liked by people who like BOTH the team and the brand
//   traits     <- Qloo tags (lifestyle, values, tone...) the team and the brand have in common
//   news       <- web search for reasons to sponsor this team now (model call; on demand)
import { get } from "./qloo";
import { type RawEntity, S, ask, category, entities, isSportsy, obj, tagNames, today } from "./fanfit";
import { profile, profiles } from "./fanfit-activation";
import { AGES, type Age } from "./fanfit-score";

export interface Audience {
  age: Record<Age, number>; // Qloo relative affinity, about -1..1 (0 = average)
  gender: { male: number; female: number };
}

export async function audience(qlooId: string): Promise<Audience | null> {
  return get("/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": qlooId }, (raw) => {
    const q = (raw as { results?: { demographics?: { query?: { age?: Record<string, number>; gender?: Record<string, number> } }[] } }).results
      ?.demographics?.[0]?.query;
    if (!q?.age) return null;
    return {
      age: Object.fromEntries(AGES.map((a) => [a, q.age?.[a] ?? 0])) as Record<Age, number>,
      gender: { male: q.gender?.male ?? 0, female: q.gender?.female ?? 0 },
    };
  });
}

/**
 * The age group where both audiences over-index: the best of the weaker side. A sum would let one strong side win alone
 * (Tillamook's ≤24 skew outvoted Thorns fans being below average there).
 */
export function sharedAge(team: Audience | null, brand: Audience | null): Age {
  const both = (a: Age) => Math.min(team?.age[a] ?? 0, brand?.age[a] ?? 0);
  return AGES.reduce((best, a) => (both(a) > both(best) ? a : best));
}

export interface SharedItem {
  id: string;
  name: string;
  detail: string;
}

const SHARED_TAKE = 6;

export async function sharedTaste(teamId: string, brandId: string, city: string) {
  const both = `${teamId},${brandId}`;
  const [brands, artists, places] = await Promise.all([
    get("/v2/insights", { "filter.type": "urn:entity:brand", "signal.interests.entities": both, "signal.location.query": city, take: 20 }, entities),
    get("/v2/insights", { "filter.type": "urn:entity:artist", "signal.interests.entities": both, "signal.location.query": city, take: SHARED_TAKE }, entities),
    get("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": both, "filter.location.query": city, take: SHARED_TAKE }, entities),
  ]);
  const genre = (e: RawEntity) => (e.tags ?? []).find((t) => t.type?.includes(":genre"))?.name ?? "";
  const item = (detail: (e: RawEntity) => string) => (e: RawEntity) => ({ id: e.entity_id, name: e.name, detail: detail(e) });
  return {
    // Other teams and leagues top the raw brand list; they say little about a sponsorship.
    brands: brands.filter((e) => !isSportsy(e) && e.entity_id !== brandId).slice(0, SHARED_TAKE).map(item(category)),
    artists: artists.map(item(genre)),
    places: places.map(item((e) => tagNames(e, "category:place")[0] ?? "")),
  };
}

/** Tag kinds (lifestyle, values, tone...) where the team and the brand share Qloo tags. */
export async function sharedTraits(teamId: string, brandId: string) {
  const ents = await profiles([teamId, brandId]);
  const t = profile(ents.get(teamId) ?? { entity_id: teamId, name: "" });
  const b = profile(ents.get(brandId) ?? { entity_id: brandId, name: "" });
  return Object.keys(t)
    .map((kind) => ({ kind, tags: t[kind].filter((x) => (b[kind] ?? []).includes(x)) }))
    .filter((x) => x.tags.length > 0);
}

// ---------------------------------------------------------------- why now (web search)

const NEWS_TYPES = ["new_venue_or_renovation", "on_field_success", "audience_growth", "sponsor_change", "media_or_broadcast", "community_or_event", "negative_news"];

export interface TeamNews {
  signals: { type: string; date: string; summary: string; url: string }[];
  timing: 0 | 1 | 2 | 3;
  whyNow: string;
  risk: string;
}

export async function teamNews(team: string, city: string, brand: string, categories: string[]): Promise<TeamNews> {
  const schema = obj({
    signals: { type: "array", items: obj({ type: { type: "string", enum: NEWS_TYPES }, date: S, summary: S, url: S }) },
    timing: { type: "integer", enum: [0, 1, 2, 3], description: "0 = no reason to approach now, 3 = strong, recent reason." },
    why_now: { type: "string", description: "One sentence the brand's partnership manager could use, or empty if timing is 0." },
    risk: { type: "string", description: "What makes this team a risky partner now (scandal, relocation, falling attendance). Empty if nothing notable." },
  });
  const r = await ask<{ signals: TeamNews["signals"]; timing: TeamNews["timing"]; why_now: string; risk: string }>(
    `You help a brand's partnerships team decide which sports teams to approach. Today is ${today()}. Use web search. ` +
      "Report only signals you found a source for, from the last 18 months, with the source URL. Do not invent dates.",
    `Team: ${team} (${city}). Brand: ${brand}, interested in these sponsorship categories: ${categories.join(", ") || "any"}.\n` +
      "Find recent reasons this team is a good sponsorship opportunity now: new or renovated venue, winning or playoff runs, " +
      "attendance or viewership growth, new broadcast deals, a sponsor in these categories leaving or a deal expiring, " +
      "community programs or events the brand could join. Also note negative news.",
    "team_news",
    schema,
  );
  return { signals: r.signals, timing: r.timing, whyNow: r.why_now, risk: r.risk };
}
