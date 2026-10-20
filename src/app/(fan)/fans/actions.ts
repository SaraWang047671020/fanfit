"use server";

import { revalidatePath } from "next/cache";
import { TASTE_TYPES, type Taste, type TasteKind, searchTastes } from "@/lib/fan-taste";
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

/** Qloo search for the taste picker (signed-in fans only: it spends API quota). */
export async function findTastes(query: string, kind?: TasteKind) {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { results: [] as Taste[] };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sign in to save your taste.", results: [] as Taste[] };
  try {
    return { results: await searchTastes(q, kind && kind in TASTE_TYPES ? kind : undefined) };
  } catch {
    return { error: "Search is unavailable right now.", results: [] as Taste[] };
  }
}

/** Add or remove one of the signed-in fan's tastes. RLS keeps it to their own rows (at most 8). */
export async function setTaste(taste: Taste, add: boolean) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sign in to save your taste." };
  if (add && !(taste.kind in TASTE_TYPES)) return { error: "Unknown kind." };
  const { error } = add
    ? await supabase.from("fan_tastes").insert({ entity_id: taste.entity_id.slice(0, 64), name: taste.name.slice(0, 200), kind: taste.kind })
    : await supabase.from("fan_tastes").delete().eq("user_id", data.user.id).eq("entity_id", taste.entity_id);
  revalidatePath("/fans", "layout");
  if (error) return { error: error.message.includes("row-level security") ? "You can keep up to 8 tastes." : error.message };
  return { ok: true };
}
