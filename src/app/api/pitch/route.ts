// POST /api/pitch: build a pitch report and record the outreach.
//   { kind: "team_to_brand", brand: { id, category }, message, timing? }   an approved team pitches a Qloo brand
//   { kind: "brand_to_team", teamId, message, contactEmail?, target? }     a brand account pitches a team
// Returns { token } for /r/<token>. The report is written with the secret key, so its contents cannot be forged.
import { describeTarget, parseTarget } from "@/lib/audience";
import { entities } from "@/lib/fanfit";
import { errorResponse } from "@/lib/http";
import { buildPitch } from "@/lib/pitch-report";
import { get } from "@/lib/qloo";
import type { DirectoryTeam } from "@/lib/sponsor-fit";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { takeUsage } from "@/lib/usage";

// ~8 Qloo calls (mostly cached), one web search, two model calls.
export const maxDuration = 120;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  if (process.env.LIVE_RUNS_DISABLED === "true") return Response.json({ error: "Live runs are disabled on this deployment." }, { status: 503 });
  const { supabase, user, profile } = await currentUser();
  const db = adminClient();
  if (!user || !db) return Response.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const message = str(b.message, 600);
  if (message.length < 5) return Response.json({ error: "Write a short note to go with the report." }, { status: 400 });

  const { data: teams } = await supabase.from("teams").select("id, name, league, city, qloo_id, fit_mean, fit_sd, claimed_at").returns<DirectoryTeam[]>();
  const directory = teams ?? [];

  try {
    if (b.kind === "team_to_brand") {
      if (profile?.role !== "team" || !profile.team_approved) return Response.json({ error: "Available to approved team accounts." }, { status: 403 });
      const team = directory.find((t) => t.id === profile.team_id);
      const brandId = str((b.brand as Record<string, unknown>)?.id, 64);
      if (!team || !brandId) return Response.json({ error: "Missing team or brand." }, { status: 400 });
      // The brand's name comes from Qloo, not the browser: it is printed on a public page.
      const [hit] = await get("/entities", { entity_ids: brandId }, (raw) => entities({ results: { entities: (raw as { results?: unknown[] }).results } }));
      if (!hit) return Response.json({ error: "Qloo does not know this brand." }, { status: 400 });
      const limit = await takeUsage(user.id, "report");
      if (limit) return Response.json({ error: limit }, { status: 429 });

      const t = b.timing as { timing?: unknown; whyNow?: unknown; signals?: unknown } | undefined;
      const timing =
        t && typeof t.timing === "number" && Array.isArray(t.signals)
          ? { timing: t.timing, whyNow: str(t.whyNow, 400), signals: (t.signals as never[]).slice(0, 8) }
          : undefined;
      const body = await buildPitch({
        kind: "team_to_brand",
        team,
        teams: directory,
        brand: { qlooId: hit.entity_id, name: hit.name, category: str((b.brand as Record<string, unknown>)?.category, 80) },
        message,
        timing,
      });
      const { data: report, error } = await db
        .from("pitch_reports")
        .insert({ kind: "team_to_brand", team_id: team.id, brand_qloo_id: hit.entity_id, brand_name: hit.name, body, demo: !!profile.is_demo, created_by: user.id })
        .select("id, token")
        .single();
      if (error) throw error;
      // One pitch per team and brand: pitching again replaces the note and report.
      await db
        .from("team_outreach")
        .upsert(
          { team_id: team.id, brand_qloo_id: hit.entity_id, brand_name: hit.name, message, report_id: report.id, status: "new", demo: !!profile.is_demo, created_by: user.id },
          { onConflict: "team_id,brand_qloo_id" },
        );
      return Response.json({ token: report.token });
    }

    if (b.kind === "brand_to_team") {
      if (profile?.role !== "sponsor" || !profile.sponsor_id) return Response.json({ error: "Only brand accounts can send this." }, { status: 403 });
      const team = directory.find((t) => t.id === str(b.teamId, 64));
      const { data: sponsor } = await supabase.from("sponsors").select("id, name, qloo_id, categories").eq("id", profile.sponsor_id).single();
      if (!team || !sponsor?.qloo_id) return Response.json({ error: "Missing team, or your brand is not linked to Qloo." }, { status: 400 });
      const email = str(b.contactEmail, 200);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "That email address doesn't look right." }, { status: 400 });
      const target = parseTarget((b.target as Record<string, string>) ?? {});

      // The note first (RLS checks the brand may send it), so a refused note costs nothing.
      const { data: note, error: noteError } = await supabase
        .from("sponsor_interest")
        .insert({ sponsor_id: sponsor.id, team_id: team.id, message, contact_email: email || null, target: target ? describeTarget(target) : null, created_by: user.id })
        .select("id")
        .single();
      if (noteError) return Response.json({ error: noteError.code === "23505" ? "You have already contacted this team." : noteError.message }, { status: 400 });
      const limit = await takeUsage(user.id, "report");
      if (limit) {
        await supabase.from("sponsor_interest").delete().eq("id", note.id);
        return Response.json({ error: limit }, { status: 429 });
      }
      const label = SPONSOR_CATEGORIES.filter((c) => (sponsor.categories as string[]).includes(c.key)).map((c) => c.label)[0] ?? "";
      const body = await buildPitch({ kind: "brand_to_team", team, teams: directory, brand: { qlooId: sponsor.qloo_id, name: sponsor.name, category: label }, message });
      const { data: report, error } = await db
        .from("pitch_reports")
        .insert({ kind: "brand_to_team", team_id: team.id, sponsor_id: sponsor.id, brand_qloo_id: sponsor.qloo_id, brand_name: sponsor.name, body, demo: !!profile.is_demo, created_by: user.id })
        .select("id, token")
        .single();
      if (error) throw error;
      await db.from("sponsor_interest").update({ report_id: report.id, fit_z: body.fit.z }).eq("id", note.id);
      return Response.json({ token: report.token });
    }

    return Response.json({ error: "Unknown kind." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
