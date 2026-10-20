"use server";

// Team access requests. The database decides who may act (decide_team_request: an admin, or an approved member of
// that team); these actions only forward and refresh.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function cancelTeamRequest() {
  const supabase = await createClient();
  await supabase.rpc("cancel_team_request");
  redirect("/onboarding");
}

export async function decideRequest(userId: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_team_request", { p_user: userId, p_approve: approve });
  revalidatePath("/team/members");
  revalidatePath("/admin");
  return error ? { error: error.message } : { ok: true };
}
