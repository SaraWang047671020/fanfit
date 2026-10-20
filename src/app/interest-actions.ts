"use server";

// Brand -> team notes ("we'd like to talk"). The brand writes; the team answers. FanFit's fit score is added by the
// server with the secret key, so a brand cannot send a better number than FanFit computed.
import { revalidatePath } from "next/cache";
import { parseTarget, describeTarget } from "@/lib/audience";
import { type DirectoryTeam, teamFit } from "@/lib/sponsor-fit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function sendInterest(input: { teamId: string; message: string; contactEmail: string; target?: Record<string, string> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sign in first." };
  const { data: profile } = await supabase.from("profiles").select("role, sponsor_id").eq("user_id", auth.user.id).single();
  if (profile?.role !== "sponsor" || !profile.sponsor_id) return { error: "Only brand accounts can send this." };

  const target = input.target ? parseTarget(input.target) : null;
  const email = input.contactEmail.trim().slice(0, 200);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email address doesn't look right." };
  const { data: row, error } = await supabase
    .from("sponsor_interest")
    .insert({
      sponsor_id: profile.sponsor_id,
      team_id: input.teamId,
      message: input.message.trim().slice(0, 600),
      contact_email: email || null,
      target: target ? describeTarget(target) : null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "You have already contacted this team." : error.message };

  // FanFit's fit for this brand and team, stamped by the server (all fans; the target is noted as text).
  const db = adminClient();
  const { data: sponsor } = await supabase.from("sponsors").select("qloo_id").eq("id", profile.sponsor_id).single();
  if (db && sponsor?.qloo_id) {
    const { data: teams } = await supabase.from("teams").select("id, name, league, city, qloo_id, fit_mean, fit_sd, claimed_at").returns<DirectoryTeam[]>();
    const fit = (await teamFit(sponsor.qloo_id, teams ?? []).catch(() => [])).find((f) => f.team.id === input.teamId);
    if (fit?.z != null) await db.from("sponsor_interest").update({ fit_z: fit.z }).eq("id", row.id);
  }
  revalidatePath(`/sponsor/teams/${input.teamId}`);
  revalidatePath("/sponsor/outreach");
  return { ok: true };
}

export async function withdrawInterest(teamId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sponsor_interest").delete().eq("team_id", teamId);
  revalidatePath(`/sponsor/teams/${teamId}`);
  revalidatePath("/sponsor/outreach");
  return error ? { error: error.message } : { ok: true };
}

export async function answerInterest(id: string, status: "interested" | "declined" | "new") {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sponsor_interest").update({ status }).eq("id", id).select("id");
  revalidatePath("/team/interest");
  if (error) return { error: error.message };
  return data?.length ? { ok: true } : { error: "Not allowed." };
}
