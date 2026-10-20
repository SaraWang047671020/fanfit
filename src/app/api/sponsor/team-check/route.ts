// POST /api/sponsor/team-check { teamId } — for a sponsor account: the team's current sponsors (the club's list, else web search) with the
// ones in the sponsor's categories marked, plus reasons to approach the team now. Team and brand come from the database,
// not the request, so a sponsor can only check on behalf of its own brand.
import { currentSponsors } from "@/lib/fanfit";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { errorResponse } from "@/lib/http";
import { teamNews } from "@/lib/sponsor-detail";
import { currentUser } from "@/lib/supabase/server";
import { takeUsage } from "@/lib/usage";

// Two web-search passes for sponsors + one for news, in parallel.
export const maxDuration = 120;

export async function POST(req: Request) {
  if (process.env.LIVE_RUNS_DISABLED === "true")
    return Response.json({ error: "Live runs are disabled on this deployment." }, { status: 503 });
  const { supabase, user, profile } = await currentUser();
  if (!user || profile?.role !== "sponsor") return Response.json({ error: "Sponsor account required." }, { status: 403 });
  const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: unknown };
  if (typeof teamId !== "string") return Response.json({ error: "Missing team." }, { status: 400 });

  const [{ data: team }, { data: sponsor }] = await Promise.all([
    supabase.from("teams").select("name, city").eq("id", teamId).single<{ name: string; city: string }>(),
    supabase.from("sponsors").select("name, categories").eq("id", profile.sponsor_id!).single<{ name: string; categories: string[] }>(),
  ]);
  if (!team || !sponsor) return Response.json({ error: "Unknown team." }, { status: 404 });
  const limit = await takeUsage(user.id, "team_check");
  if (limit) return Response.json({ error: limit }, { status: 429 });

  const mine = SPONSOR_CATEGORIES.filter((c) => sponsor.categories.includes(c.key));
  const covered = new Set<string>(mine.flatMap((c) => c.covers));
  try {
    const [{ sponsors, source }, news] = await Promise.all([
      currentSponsors(team.name, team.city),
      teamNews(team.name, team.city, sponsor.name, mine.map((c) => c.label)),
    ]);
    return Response.json({ sponsors, source, inMyCategories: sponsors.filter((s) => covered.has(s.category)).map((s) => s.name), news });
  } catch (err) {
    return errorResponse(err);
  }
}
