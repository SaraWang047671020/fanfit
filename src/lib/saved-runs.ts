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
