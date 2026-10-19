// Thin client for the Qloo Hackathon API.
// - Callers pass a `slim` function so only the fields they use are kept in memory.
// - Responses are cached in memory and in Supabase (qloo-cache.ts): the taste graph changes slowly, calls take
//   seconds, and the monthly quota is small.
// - Hackathon keys allow 5 requests per second and 10,000 per month (X-Second- / X-Month-RateLimit-* headers).
//   Requests are paced below the per-second limit: a concurrency cap alone was enough from Taiwan (2–5 s per call)
//   but not from Vercel in the US, where calls return fast enough for 3 parallel requests to exceed 5 per second.

import { compact, readCache, writeCache } from "./qloo-cache";

const BASE_URL = process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com";
const CACHE_MS = 1000 * 60 * 60 * 24;
const MAX_CONCURRENT = 3;
const MIN_GAP_MS = 250; // at most 4 request starts per second, under the 5/s limit
const MAX_RETRIES = 6; // backoff 0.8 s → 25.6 s (~50 s total): FanFit's ~200-call runs outlast shorter waits

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

// Per server instance; parallel instances (two users at once) share the key's limit and fall back on the 429 retry.
let nextStart = 0;
async function paced() {
  const now = Date.now();
  const at = Math.max(now, nextStart);
  nextStart = at + MIN_GAP_MS;
  if (at > now) await sleep(at - now);
}

async function fetchJson(url: string, key: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await withSlot(async () => {
      await paced();
      return fetch(url, {
        headers: { "X-Api-Key": key, Accept: "application/json" },
        cache: "no-store", // we cache the slimmed result ourselves
        signal: AbortSignal.timeout(20_000),
      });
    });
    if (res.ok) return res.json();
    if (res.status === 429 && res.headers.get("x-month-ratelimit-remaining") === "0") {
      const days = Math.ceil(Number(res.headers.get("x-month-ratelimit-reset")) / 86_400);
      throw new QlooError(429, `The Qloo API key has used its monthly quota${days > 0 ? `; it resets in about ${days} days` : ""}.`);
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt);
      continue;
    }
    throw new QlooError(res.status, `Qloo ${new URL(url).pathname} failed: ${res.status} ${await res.text()}`);
  }
}

// In-process layer on top of qloo_cache. Holds the compacted response, not the caller's slimmed value: two callers
// can request the same URL with different `slim` functions.
const memo = new Map<string, { at: number; value: Promise<unknown> }>();

/** Rate-limited, cached GET (memory, then qloo_cache, then Qloo). `slim` reduces the response to what the caller keeps. */
export async function get<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  slim: (raw: unknown) => T,
): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError(500, "QLOO_API_KEY is not set");

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const cacheKey = `${path}?${qs}`;

  const hit = memo.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return slim(await hit.value);

  const value = (async () => {
    const stored = await readCache(cacheKey);
    if (stored) return stored;
    const fresh = compact(await fetchJson(`${BASE_URL}${cacheKey}`, key));
    void writeCache(cacheKey, fresh);
    return fresh;
  })();
  memo.set(cacheKey, { at: Date.now(), value });
  value.catch(() => memo.delete(cacheKey)); // never cache failures
  return slim(await value);
}
