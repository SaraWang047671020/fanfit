// Thin client for the Qloo Hackathon API.
// - Responses are slimmed to the fields TasteFrame uses (raw movie pages are ~2.6 MB).
// - Slimmed responses are memoised in-process: the taste graph changes slowly and calls take 2–5 s.
// - A small concurrency limit + retry keeps us under the hackathon rate limit (bursts of ~17 calls got 429s).

const BASE_URL = process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com";
const CACHE_MS = 1000 * 60 * 60 * 24;
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 6; // backoff 0.8 s → 25.6 s (~50 s total): FanFit's ~200-call runs outlast shorter waits

export const DOMAINS = ["movie", "artist", "brand"] as const;
export type Domain = (typeof DOMAINS)[number];
export type EntityType = Domain | "person";

export interface QlooTag {
  id: string;
  name: string;
  type: string;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  type?: string;
  tags?: QlooTag[];
  popularity?: number;
  image?: string;
  affinity?: number;
  explainability?: { entity_id: string; score: number }[];
}

export class QlooError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- transport

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, key: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await withSlot(() =>
      fetch(url, {
        headers: { "X-Api-Key": key, Accept: "application/json" },
        cache: "no-store", // we cache the slimmed result ourselves
        signal: AbortSignal.timeout(20_000),
      }),
    );
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt);
      continue;
    }
    throw new QlooError(res.status, `Qloo ${new URL(url).pathname} failed: ${res.status} ${await res.text()}`);
  }
}

const memo = new Map<string, { at: number; value: Promise<unknown> }>();

/** Rate-limited, memoised GET. `slim` must reduce the raw response to what the caller keeps. */
export async function get<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  slim: (raw: unknown) => T,
): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError(500, "QLOO_API_KEY is not set");

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${BASE_URL}${path}?${qs}`;

  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;

  const value = fetchJson(url, key).then(slim);
  memo.set(url, { at: Date.now(), value });
  value.catch(() => memo.delete(url)); // never cache failures
  return value;
}

// ---------------------------------------------------------------- slimming

const LABEL_TAG_TYPES = ["genre", "subgenre", "style", "theme"];

interface RawEntity {
  entity_id: string;
  name: string;
  type?: string;
  tags?: QlooTag[];
  popularity?: number;
  properties?: { image?: { url?: string } };
  query?: {
    affinity?: number;
    explainability?: { "signal.interests.entities"?: { entity_id: string; score: number }[] };
  };
}

function slimEntity(e: RawEntity): QlooEntity {
  return {
    entity_id: e.entity_id,
    name: e.name,
    type: e.type,
    popularity: e.popularity,
    image: e.properties?.image?.url,
    affinity: e.query?.affinity,
    explainability: e.query?.explainability?.["signal.interests.entities"],
    tags: e.tags
      ?.filter((t) => LABEL_TAG_TYPES.some((k) => t.type?.includes(k)))
      .map(({ id, name, type }) => ({ id, name, type })),
  };
}

// ---------------------------------------------------------------- endpoints

export async function search(query: string, type: EntityType, take = 5): Promise<QlooEntity[]> {
  return get("/search", { query, types: `urn:entity:${type}`, take }, (raw) =>
    ((raw as { results?: RawEntity[] }).results ?? []).map(slimEntity),
  );
}

export interface InsightsQuery {
  entities: string[];
  domain: Domain;
  take?: number;
  page?: number;
  age?: string;
  explain?: boolean;
}

export async function insights(q: InsightsQuery): Promise<QlooEntity[]> {
  if (q.entities.length === 0) return [];
  return get(
    "/v2/insights",
    {
      "filter.type": `urn:entity:${q.domain}`,
      "signal.interests.entities": q.entities.join(","),
      "signal.demographics.age": q.age,
      "feature.explainability": q.explain ? "true" : undefined,
      take: q.take ?? 50,
      page: q.page,
    },
    (raw) => ((raw as { results?: { entities?: RawEntity[] } }).results?.entities ?? []).map(slimEntity),
  );
}

/** Fetch up to `pages` × 50 results; Qloo caps `take` at 50. */
export async function insightsDeep(q: Omit<InsightsQuery, "take" | "page">, pages = 2): Promise<QlooEntity[]> {
  const all = await Promise.all(
    Array.from({ length: pages }, (_, i) => insights({ ...q, take: 50, page: i + 1 })),
  );
  return all.flat();
}
