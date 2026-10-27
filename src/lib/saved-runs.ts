// Saved sponsor-finder runs (analysis_runs): replayed on the Find sponsors page and read by Ask FanFit.
import type { FanfitEvent } from "./fanfit";
import { adminClient } from "./supabase/admin";

export const teamKey = (team: string, city: string) => `${team.toLowerCase()}|${city.toLowerCase()}`;

/**
 * The latest run for this team and city, however old, or null. Saved runs do not expire: the page shows the run's
 * date and offers a fresh run, and a two-week cut-off would have emptied the demo in the middle of judging.
 */
export async function loadSavedRun(team: string, city: string) {
  const db = adminClient();
  if (!db) return null;
  const { data } = await db
    .from("analysis_runs")
    .select("events, created_at")
    .eq("team_key", teamKey(team, city))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ events: FanfitEvent[]; created_at: string }>();
  return data;
}

/**
 * Add timing checks run after a saved run (the "Check timing" button) to that run, so a reload or the next visitor
 * sees them instead of "Timing not checked yet". A newer check of the same brand replaces the older one.
 */
export async function appendTimings(team: string, city: string, added: FanfitEvent[]) {
  const db = adminClient();
  const timings = added.filter((e) => e.type === "timing");
  if (!db || !timings.length) return;
  const { data } = await db
    .from("analysis_runs")
    .select("id, events")
    .eq("team_key", teamKey(team, city))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; events: FanfitEvent[] }>();
  if (!data) return;
  const ids = new Set(timings.map((e) => e.timing.brandId));
  const kept = data.events.filter((e) => !(e.type === "timing" && ids.has(e.timing.brandId)));
  const end = kept.findLastIndex((e) => e.type === "done");
  const events = end < 0 ? [...kept, ...timings] : [...kept.slice(0, end), ...timings, ...kept.slice(end)];
  await db.from("analysis_runs").update({ events }).eq("id", data.id);
}
