import { type FanfitEvent, runFanfit, runTiming } from "@/lib/fanfit";
import { currentUser } from "@/lib/supabase/server";

// A full run: ~30 Qloo calls (3 at a time) + ~12 web-search calls (4 at a time), about 1–2 minutes.
export const maxDuration = 300;

const MAX_CONCURRENT_RUNS = 2;
let running = 0;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/fanfit
//   { team, city }                      full run
//   { team, city, brands: [{id,name,category,address?}] }   timing + conflicts only, for candidates surfaced by the sliders
// Streams NDJSON, one FanfitEvent per line.
export async function POST(req: Request) {
  if (process.env.LIVE_RUNS_DISABLED === "true")
    return Response.json({ error: "Live runs are disabled on this deployment." }, { status: 503 });
  if (!process.env.OPENAI_API_KEY || !process.env.QLOO_API_KEY)
    return Response.json({ error: "OPENAI_API_KEY and QLOO_API_KEY must be set" }, { status: 500 });
  // Runs spend Qloo quota and web searches: approved team accounts only.
  const { profile } = await currentUser();
  if (profile?.role !== "team" || !profile.team_approved)
    return Response.json({ error: "Available to approved team accounts." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { team?: unknown; city?: unknown; brands?: unknown };
  const team = str(body.team, 80);
  const city = str(body.city, 80);
  if (!team || !city) return Response.json({ error: "Enter a team and its city." }, { status: 400 });
  const brands = Array.isArray(body.brands)
    ? body.brands
        .slice(0, 10)
        .map((b) => ({
          id: str(b?.id, 64),
          name: str(b?.name, 120),
          category: str(b?.category, 80),
          // Local businesses carry an address; it switches the timing search to local-business signals.
          ...(typeof b?.address === "string" ? { address: str(b.address, 200) } : {}),
        }))
        .filter((b) => b.id && b.name)
    : null;

  if (running >= MAX_CONCURRENT_RUNS) return Response.json({ error: "Busy, try again in a minute." }, { status: 429 });
  running++;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: FanfitEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const t0 = Date.now();
      try {
        if (brands) {
          await runTiming(team, city, brands, send);
          send({ type: "done", ms: Date.now() - t0 });
        } else {
          await runFanfit(team, city, send);
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        running--;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
