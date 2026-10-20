// POST /api/ask { question } — "Ask FanFit" for sponsors and approved team accounts. Streams AskEvents as NDJSON.
import { type AskContext, type AskEvent, runAsk } from "@/lib/ask-agent";
import type { DirectoryTeam } from "@/lib/sponsor-fit";
import { currentUser } from "@/lib/supabase/server";
import { takeUsage } from "@/lib/usage";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (process.env.LIVE_RUNS_DISABLED === "true")
    return Response.json({ error: "Live runs are disabled on this deployment." }, { status: 503 });
  const { supabase, user, profile } = await currentUser();
  const isTeam = profile?.role === "team" && profile.team_approved;
  if (!user || !(isTeam || profile?.role === "sponsor"))
    return Response.json({ error: "Available to sponsors and approved team accounts." }, { status: 403 });
  const { question } = (await req.json().catch(() => ({}))) as { question?: unknown };
  const q = typeof question === "string" ? question.trim().slice(0, 500) : "";
  if (q.length < 5) return Response.json({ error: "Ask a question." }, { status: 400 });

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, league, city, qloo_id, fit_mean, fit_sd, claimed_at")
    .returns<DirectoryTeam[]>();
  let ctx: AskContext;
  if (isTeam) {
    const t = (teams ?? []).find((x) => x.id === profile!.team_id);
    if (!t) return Response.json({ error: "Team not found." }, { status: 404 });
    ctx = { role: "team", team: { id: t.id, name: t.name, city: t.city, qlooId: t.qloo_id }, teams: teams ?? [] };
  } else {
    const { data: s } = await supabase.from("sponsors").select("name, qloo_id, categories").eq("id", profile!.sponsor_id!).single();
    if (!s?.qloo_id) return Response.json({ error: "Link your brand to Qloo first." }, { status: 400 });
    const { data: listed } = await supabase.from("team_sponsors").select("team_id, name, category");
    ctx = { role: "sponsor", brand: { name: s.name, qlooId: s.qloo_id, categories: s.categories }, teams: teams ?? [], listed: listed ?? [] };
  }

  const limit = await takeUsage(user.id, "agent");
  if (limit) return Response.json({ error: limit }, { status: 429 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AskEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAsk(q, ctx, send);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
