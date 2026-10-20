"use server";

import { revalidatePath } from "next/cache";
import { type RawEntity, tagNames, teamSponsors } from "@/lib/fanfit";
import { CATEGORY_KEYS, sameCompany } from "@/lib/fanfit-score";
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
export async function createOffer(input: { placeId: string; title: string; details: string; endsOn: string; fit: number | null; demo?: boolean }) {
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
      fit: input.fit !== null && Number.isFinite(input.fit) ? Math.round(input.fit) : null,
      ends_on: /^\d{4}-\d{2}-\d{2}$/.test(input.endsOn) ? input.endsOn : null,
      demo: !!input.demo,
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

// ---------------------------------------------------------------- the club's sponsor list (team_sponsors)

export interface SponsorInput {
  name: string;
  category: string;
  tier: string;
  sourceUrl: string;
}

function cleanSponsor(s: SponsorInput) {
  const name = s.name.trim().slice(0, 120);
  if (!name) throw new Error("Enter the sponsor's name.");
  if (!(CATEGORY_KEYS as readonly string[]).includes(s.category)) throw new Error("Pick a category.");
  const url = s.sourceUrl.trim();
  return { name, category: s.category, tier: s.tier.trim().slice(0, 80), source_url: /^https?:\/\//.test(url) ? url.slice(0, 500) : null };
}

const friendly = (message: string) =>
  /duplicate key|team_sponsors_team_id_name_key/.test(message) ? "That sponsor is already on your list." : message;

export async function addSponsor(input: SponsorInput) {
  try {
    const { supabase, user, teamId } = await teamMember();
    const { error } = await supabase.from("team_sponsors").insert({ ...cleanSponsor(input), team_id: teamId, added_by: user.id });
    revalidatePath("/team/sponsors");
    return error ? { error: friendly(error.message) } : { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateSponsor(id: string, input: SponsorInput) {
  try {
    const { supabase } = await teamMember();
    const { error } = await supabase.from("team_sponsors").update(cleanSponsor(input)).eq("id", id); // RLS: own team only
    revalidatePath("/team/sponsors");
    return error ? { error: friendly(error.message) } : { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeSponsor(id: string) {
  const { supabase } = await teamMember();
  await supabase.from("team_sponsors").delete().eq("id", id);
  revalidatePath("/team/sponsors");
}

/** Web-search candidates for the list (same search the sponsor finder uses), minus sponsors already listed. */
export async function findSponsorsOnWeb() {
  try {
    const { supabase, teamId } = await teamMember();
    const [{ data: team }, { data: listed }] = await Promise.all([
      supabase.from("teams").select("name, city").eq("id", teamId).single<{ name: string; city: string }>(),
      supabase.from("team_sponsors").select("name").eq("team_id", teamId),
    ]);
    if (!team) return { error: "Team not found." };
    const found = await teamSponsors(team.name, team.city);
    const have = (listed ?? []).map((s) => s.name);
    return { candidates: found.filter((f) => !have.some((h) => sameCompany(h, f.name))) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function importSponsors(items: SponsorInput[]) {
  try {
    const { supabase, user, teamId } = await teamMember();
    const rows = items.slice(0, 100).map((s) => ({ ...cleanSponsor(s), team_id: teamId, added_by: user.id }));
    const { error } = await supabase.from("team_sponsors").upsert(rows, { onConflict: "team_id,name", ignoreDuplicates: true });
    revalidatePath("/team/sponsors");
    return error ? { error: friendly(error.message) } : { ok: true, count: rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- sponsor locations for the fan map

export interface PlaceCandidate {
  id: string;
  name: string;
  address: string;
  inCity: boolean;
}

/**
 * Qloo places that could be this sponsor in the team's city. Qloo search cannot filter by location, so it searches the
 * name (or the club's own wording, e.g. "Providence Swedish") alone and with the city, keeps places whose name matches,
 * and puts those in the team's city first. The club picks one.
 */
export async function findSponsorPlaces(sponsorId: string, query?: string): Promise<{ candidates?: PlaceCandidate[]; error?: string }> {
  try {
    const { supabase, teamId } = await teamMember();
    const [{ data: s }, { data: team }] = await Promise.all([
      supabase.from("team_sponsors").select("name").eq("id", sponsorId).single<{ name: string }>(),
      supabase.from("teams").select("city").eq("id", teamId).single<{ city: string }>(),
    ]);
    if (!s || !team) return { error: "Sponsor not found." };
    const cityName = team.city.split(",")[0].trim();
    const search = (query: string) =>
      get("/search", { query, types: "urn:entity:place", take: 8 }, (raw) =>
        ((raw as { results?: RawEntity[] }).results ?? []).map((e) => ({ id: e.entity_id, name: e.name, address: e.properties?.address ?? "" })),
      );
    const term = query?.trim().slice(0, 80) || s.name;
    const [a, b] = await Promise.all([search(term), search(`${term} ${cityName}`)]);
    const seen = new Set<string>();
    const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    // A place matches when it shares the first word of the search ("Providence Swedish Cancer Institute" for "Providence"),
    // so city landmarks that only matched the city name drop out.
    const key = norm(term.split(/\s+/)[0]);
    const candidates = [...a, ...b]
      .filter((p) => !seen.has(p.id) && seen.add(p.id))
      .filter((p) => norm(p.name).includes(key))
      .map((p) => ({ ...p, inCity: p.address.toLowerCase().includes(cityName.toLowerCase()) }))
      .sort((x, y) => Number(y.inCity) - Number(x.inCity))
      .slice(0, 6);
    return { candidates };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pin a sponsor to a Qloo place (address and coordinates fetched on the server), or clear it with null. */
export async function setSponsorPlace(sponsorId: string, placeId: string | null) {
  try {
    const { supabase } = await teamMember();
    let patch: { place_qloo_id: string | null; address: string; lat: number | null; lon: number | null } = { place_qloo_id: null, address: "", lat: null, lon: null };
    if (placeId) {
      const [place] = await get("/entities", { entity_ids: placeId }, (raw) =>
        ((raw as { results?: (RawEntity & { location?: { lat?: number; lon?: number } })[] }).results ?? []),
      );
      if (!place?.location?.lat) return { error: "Qloo has no coordinates for this place." };
      patch = { place_qloo_id: place.entity_id, address: place.properties?.address ?? "", lat: place.location.lat, lon: place.location.lon ?? null };
    }
    const { error } = await supabase.from("team_sponsors").update(patch).eq("id", sponsorId); // RLS: own team only
    revalidatePath("/team/sponsors");
    return error ? { error: error.message } : { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
