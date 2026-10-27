import { type FanfitEvent, runExclusivity, runFanfit, runTiming } from "@/lib/fanfit";
import { appendTimings, loadSavedRun, teamKey } from "@/lib/saved-runs";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { takeUsage } from "@/lib/usage";

// A full run: ~200 Qloo calls (paced) + ~12 web-search calls, about 2–3 minutes.
export const maxDuration = 300;

const MAX_CONCURRENT_RUNS = 2;
let running = 0;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };

function candidates(list: unknown[], max: number) {
  return (list as Record<string, unknown>[])
    .slice(0, max)
    .map((b) => ({
      id: str(b?.id, 64),
      name: str(b?.name, 120),
      category: str(b?.category, 80),
      // Local businesses carry an address; it switches the timing search to local-business signals.
      ...(typeof b?.address === "string" ? { address: str(b.address, 200) } : {}),
    }))
    .filter((b) => b.id && b.name);
}

/** Keep only the last bucket event per kind and age group: the UI replaces buckets, so earlier ones are noise. */
function trim(events: FanfitEvent[]) {
  const last = new Map<string, number>();
  events.forEach((e, i) => e.type === "bucket" && last.set(`${e.kind}:${e.age}`, i));
  return events.filter((e, i) => e.type !== "bucket" || last.get(`${e.kind}:${e.age}`) === i);
}

// POST /api/fanfit
//   { team, city }                 latest saved run if any, else a full run that gets saved
//   { team, city, fresh: true }    full run even if a saved one exists
//   { team, city, savedOnly: true } the saved run if any, else an empty stream (page load never starts a run)
//   { team, city, brands: [...] }  timing + conflicts only, for candidates surfaced by the sliders
//   { team, city, exclusivity: [...] } conflicts only (sponsor list, no news), for candidates timing never reached
// Streams NDJSON, one FanfitEvent per line.
export async function POST(req: Request) {
  if (process.env.LIVE_RUNS_DISABLED === "true")
    return Response.json({ error: "Live runs are disabled on this deployment." }, { status: 503 });
  if (!process.env.OPENAI_API_KEY || !process.env.QLOO_API_KEY)
    return Response.json({ error: "OPENAI_API_KEY and QLOO_API_KEY must be set" }, { status: 500 });
  // Runs spend Qloo quota and web searches: approved team accounts only.
  const { user, profile } = await currentUser();
  if (!user || profile?.role !== "team" || !profile.team_approved)
    return Response.json({ error: "Available to approved team accounts." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    team?: unknown;
    city?: unknown;
    brands?: unknown;
    exclusivity?: unknown;
    fresh?: unknown;
    savedOnly?: unknown;
  };
  const team = str(body.team, 80);
  const city = str(body.city, 80);
  if (!team || !city) return Response.json({ error: "Enter a team and its city." }, { status: 400 });
  const brands = Array.isArray(body.brands) ? candidates(body.brands, 10) : null;

  // Exclusivity only: no Qloo, no web search beyond the cached sponsor list, so no usage count.
  if (Array.isArray(body.exclusivity)) {
    const items = candidates(body.exclusivity, 30);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (e: FanfitEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        try {
          if (items.length) await runExclusivity(team, city, items, send);
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : String(err) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: NDJSON });
  }

  const db = adminClient();

  // Saved run: replay it without spending anything.
  if (!brands && body.fresh !== true && db) {
    const saved = await loadSavedRun(team, city);
    if (saved) {
      const events: FanfitEvent[] = [{ type: "saved", at: saved.created_at }, ...saved.events];
      return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { headers: NDJSON });
    }
  }
  if (body.savedOnly === true) return new Response("", { headers: NDJSON });

  const limit = await takeUsage(user.id, brands ? "team_check" : "run");
  if (limit) return Response.json({ error: limit }, { status: 429 });
  if (running >= MAX_CONCURRENT_RUNS) return Response.json({ error: "Busy, try again in a minute." }, { status: 429 });
  running++;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const collected: FanfitEvent[] = [];
      const send = (e: FanfitEvent) => {
        collected.push(e);
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      const t0 = Date.now();
      try {
        if (brands) {
          await runTiming(team, city, brands, send);
          send({ type: "done", ms: Date.now() - t0 });
          await appendTimings(team, city, collected);
        } else {
          await runFanfit(team, city, send);
          if (db)
            await db.from("analysis_runs").insert({
              team_key: teamKey(team, city),
              team_name: team,
              city,
              events: trim(collected),
              ms: Date.now() - t0,
              created_by: user.id,
            });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        running--;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: NDJSON });
}
