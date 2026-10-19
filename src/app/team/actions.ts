"use server";

import { revalidatePath } from "next/cache";
import { type RawEntity, tagNames } from "@/lib/fanfit";
import { get } from "@/lib/qloo";
import { currentUser } from "@/lib/supabase/server";

async function teamMember() {
  const { supabase, user, profile } = await currentUser();
  if (!user || profile?.role !== "team" || !profile.team_id) throw new Error("Team account required.");
  return { supabase, user, teamId: profile.team_id };
}

/**
 * Put an offer from a recommended local business on the team's fan map. Name, address and coordinates come from Qloo
 * on the server (one cached call), not from the browser.
 */
export async function createOffer(input: { placeId: string; title: string; details: string; endsOn: string; fit: number }) {
  try {
    const { supabase, user, teamId } = await teamMember();
    const [place] = await get("/entities", { entity_ids: input.placeId }, (raw) =>
      ((raw as { results?: (RawEntity & { location?: { lat?: number; lon?: number } })[] }).results ?? []),
    );
    if (!place) return { error: "Qloo does not know this place." };
    const { error } = await supabase.from("offers").insert({
      team_id: teamId,
      place_qloo_id: place.entity_id,
      place_name: place.name,
      address: place.properties?.address ?? "",
      lat: place.location?.lat ?? null,
      lon: place.location?.lon ?? null,
      category: tagNames(place, "category:place")[0] ?? "",
      title: input.title.trim().slice(0, 80),
      details: input.details.trim().slice(0, 300),
      fit: Number.isFinite(input.fit) ? Math.round(input.fit) : null,
      ends_on: /^\d{4}-\d{2}-\d{2}$/.test(input.endsOn) ? input.endsOn : null,
      created_by: user.id,
    });
    if (error) return { error: error.message };
    revalidatePath("/team/offers");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setOfferActive(offerId: string, active: boolean) {
  const { supabase } = await teamMember();
  await supabase.from("offers").update({ active }).eq("id", offerId); // RLS limits this to the team's own offers
  revalidatePath("/team/offers");
}

export async function simulateClaims(offerId: string) {
  const { supabase } = await teamMember();
  const { error } = await supabase.rpc("simulate_claims", { p_offer: offerId, p_count: 40 });
  revalidatePath("/team/offers");
  return error ? { error: error.message } : { ok: true };
}

export async function clearSimulated() {
  const { supabase, teamId } = await teamMember();
  await supabase.rpc("clear_simulated", { p_team: teamId });
  revalidatePath("/team/offers");
}
