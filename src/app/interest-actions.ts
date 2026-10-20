"use server";

// Answering and withdrawing outreach notes. Sending goes through /api/pitch, which also builds the FanFit report.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  revalidatePath("/team/outreach");
  if (error) return { error: error.message };
  return data?.length ? { ok: true } : { error: "Not allowed." };
}

/** A brand answers a team's pitch (team_outreach); RLS limits it to pitches addressed to the brand's Qloo id. */
export async function answerPitch(id: string, status: "interested" | "declined" | "new") {
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_outreach").update({ status }).eq("id", id).select("id");
  revalidatePath("/sponsor/outreach");
  if (error) return { error: error.message };
  return data?.length ? { ok: true } : { error: "Not allowed." };
}

/** A team withdraws a pitch it sent. */
export async function withdrawPitch(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("team_outreach").delete().eq("id", id);
  revalidatePath("/team/outreach");
  return error ? { error: error.message } : { ok: true };
}
