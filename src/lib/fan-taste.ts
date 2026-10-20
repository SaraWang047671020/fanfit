// "For you": orders a fan's deals and partner businesses by the fan's own tastes, with Qloo.
// One insights call per taste (the taste as the signal, the fan's places as the only allowed results). Qloo's
// affinities sit close together and their level differs by taste, so each taste ranks the places, and a place's match
// is its average rank across tastes. The taste it ranks best under is the "because you like …".
import { entities } from "./fanfit";
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

/** Qloo search across the taste kinds, for the picker. */
export async function searchTastes(query: string): Promise<Taste[]> {
  const kinds = Object.entries(TASTE_TYPES) as [TasteKind, string][];
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
