"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function joinFan() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_fan");
  revalidatePath("/fans", "layout");
  return error ? { error: error.message } : { ok: true };
}

/** Follow or unfollow a team. RLS limits this to the signed-in fan's own rows. */
export async function setFollow(teamId: string, follow: boolean) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sign in to follow teams." };
  const { error } = follow
    ? await supabase.from("fan_follows").insert({ user_id: data.user.id, team_id: teamId })
    : await supabase.from("fan_follows").delete().eq("user_id", data.user.id).eq("team_id", teamId);
  revalidatePath("/fans", "layout");
  revalidatePath(`/t/${teamId}`);
  return error ? { error: error.message } : { ok: true };
}
