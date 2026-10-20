// "For you": orders a fan's deals and partner businesses by the fan's own tastes, with Qloo.
// One insights call per taste (the taste as the signal, the fan's places as the only allowed results). Qloo's
// affinities sit close together and their level differs by taste, so each taste ranks the places, and a place's match
// is its average rank across tastes. The taste it ranks best under is the "because you like …".
import { entities, isSportsy, tagNames } from "./fanfit";
import { get } from "./qloo";

export type TasteKind = "brand" | "artist" | "movie" | "tv_show";
export interface Taste {
  entity_id: string;
  name: string;
  kind: TasteKind;
}
export interface Match {
  score: number; // 0-100, average rank across the fan's tastes (100 = top under every taste)
  because: string; // the taste this place ranks highest under
}

export const TASTE_TYPES: Record<TasteKind, string> = {
  brand: "urn:entity:brand",
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
};
const MAX_PLACES = 50;

// Causes and campaigns rank high in Qloo's brand lists but are not something to pick as a taste for deals.
const NOT_A_TASTE = /nonprofit|non-profit|advocacy|civil rights|politic|government|charit|religio/i;

/**
 * Suggestions for one kind: what fans of the fan's teams like (popular titles only), or what is popular in the US for
 * a fan who follows no team yet. Brands also take the team's city as a signal and drop other teams and causes: the team
 * signal alone returns other clubs.
 */
export async function suggestTastes(kind: TasteKind, teams: { qloo_id: string; city: string }[]): Promise<Taste[]> {
  const signal = teams.length
    ? {
        "signal.interests.entities": teams.slice(0, 3).map((t) => t.qloo_id).join(","),
        ...(kind === "brand" ? { "signal.location.query": teams[0].city } : {}),
      }
    : { "signal.location.query": "United States" };
  return get(
    "/v2/insights",
    { "filter.type": TASTE_TYPES[kind], ...signal, "filter.popularity.min": kind === "brand" ? 0.9 : 0.95, take: kind === "brand" ? 40 : 16 },
    (raw) =>
      entities(raw)
        .filter((e) => kind !== "brand" || (!isSportsy(e) && !tagNames(e, "industry:qloo").some((t) => NOT_A_TASTE.test(t))))
        .slice(0, 12)
        .map((e) => ({ entity_id: e.entity_id, name: e.name, kind })),
  );
}

/** Qloo search for the picker, in one kind or across all of them. */
export async function searchTastes(query: string, only?: TasteKind): Promise<Taste[]> {
  const kinds = (Object.entries(TASTE_TYPES) as [TasteKind, string][]).filter(([k]) => !only || k === only);
  return get("/search", { query, types: kinds.map(([, t]) => t).join(","), take: 8 }, (raw) =>
    ((raw as { results?: { entity_id: string; name: string; types?: string[] }[] }).results ?? []).flatMap((e) => {
      const kind = kinds.find(([, t]) => e.types?.includes(t))?.[0];
      return kind ? [{ entity_id: e.entity_id, name: e.name, kind }] : [];
    }),
  );
}

/** Match per place id for this fan's tastes; empty when there are no tastes or places. */
export async function matchPlaces(tastes: Taste[], placeIds: string[]): Promise<Map<string, Match>> {
  const ids = [...new Set(placeIds)].sort().slice(0, MAX_PLACES); // sorted: same set, same cache entry
  const out = new Map<string, Match>();
  if (!tastes.length || ids.length < 2) return out;
  const perTaste = await Promise.all(
    tastes.map(async (t) => {
      const ranked = await get(
        "/v2/insights",
        { "filter.type": "urn:entity:place", "signal.interests.entities": t.entity_id, "filter.results.entities": ids.join(","), take: ids.length },
        (raw) => entities(raw).map((e) => e.entity_id),
      ).catch(() => [] as string[]);
      // Rank to 0-1 (1 = this taste's top place); places Qloo left out count as last.
      const rank = new Map(ranked.map((id, i) => [id, ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1]));
      return { taste: t, rank };
    }),
  );
  const usable = perTaste.filter((p) => p.rank.size > 0);
  if (!usable.length) return out;
  for (const id of ids) {
    const ranks = usable.map((p) => ({ name: p.taste.name, r: p.rank.get(id) ?? 0 }));
    const best = ranks.reduce((a, b) => (b.r > a.r ? b : a));
    out.set(id, { score: Math.round((100 * ranks.reduce((s, x) => s + x.r, 0)) / ranks.length), because: best.name });
  }
  return out;
}
