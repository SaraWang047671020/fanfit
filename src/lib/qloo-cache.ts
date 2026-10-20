// Persistent cache for Qloo responses (table qloo_cache). Best effort: any failure falls back to calling Qloo.
import { adminClient } from "./supabase/admin";

// 30 days: entries cached while building the demo (late October) must last through judging (Nov 2-16).
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

// Tag kinds FanFit reads (industry/genre for categories and the sports filter, the activation's taste profile).
// Raw insights pages carry hundreds of other tags per entity; keeping them would fill the free database quickly.
const KEPT_TAGS = [
  "industry:qloo", "genre:brand", "category:place", ":genre", "lifestyle:qloo", "core_value:qloo", "emotional_tone:qloo",
  "cultural_relevance:qloo", "aesthetic_property:qloo", "customer_segment:qloo", "ambience:qloo",
];

interface Tag { type?: string; name: string; tag_id?: string }
interface Entity {
  entity_id: string;
  name: string;
  types?: string[];
  tags?: Tag[];
  properties?: { address?: string };
  location?: { lat?: number; lon?: number };
  query?: { affinity?: number };
}

const entity = (e: Entity): Entity => ({
  entity_id: e.entity_id,
  name: e.name,
  ...(e.types?.length ? { types: e.types } : {}), // search results: brand vs artist (the fan taste picker)
  ...(e.tags ? { tags: e.tags.filter((t) => KEPT_TAGS.some((k) => t.type?.includes(k))).map(({ type, name }) => ({ type, name })) } : {}),
  ...(e.properties?.address ? { properties: { address: e.properties.address } } : {}),
  ...(typeof e.location?.lat === "number" ? { location: { lat: e.location.lat, lon: e.location.lon } } : {}), // places: fan map
  ...(typeof e.query?.affinity === "number" ? { query: { affinity: e.query.affinity } } : {}),
});

/**
 * The response with only what FanFit reads. Applied on cache hits and misses alike, so a field missing here breaks
 * locally on the first run instead of only once results come from the cache.
 */
export function compact(raw: unknown): unknown {
  const r = raw as { results?: unknown };
  if (Array.isArray(r.results)) return { results: (r.results as Entity[]).map(entity) }; // /search, /entities
  const res = r.results as { entities?: Entity[]; demographics?: unknown } | undefined;
  return {
    results: {
      ...(res?.entities ? { entities: res.entities.map(entity) } : {}),
      ...(res?.demographics ? { demographics: res.demographics } : {}),
    },
  };
}

export async function readCache(key: string): Promise<unknown | null> {
  const db = adminClient();
  if (!db) return null;
  try {
    const { data } = await db.from("qloo_cache").select("value, fetched_at").eq("key", key).maybeSingle();
    return data && Date.now() - new Date(data.fetched_at).getTime() < TTL_MS ? data.value : null;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  const db = adminClient();
  if (!db) return;
  try {
    await db.from("qloo_cache").upsert({ key, value, fetched_at: new Date().toISOString() });
  } catch {
    // a lost write only costs a Qloo call next time
  }
}
