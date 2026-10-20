// Saved sponsor-finder runs (analysis_runs): replayed on the Find sponsors page and read by Ask FanFit.
import type { FanfitEvent } from "./fanfit";
import { adminClient } from "./supabase/admin";

export const SAVED_FOR_MS = 14 * 24 * 60 * 60 * 1000;
export const teamKey = (team: string, city: string) => `${team.toLowerCase()}|${city.toLowerCase()}`;

/** The latest run for this team and city from the last 14 days, or null. */
export async function loadSavedRun(team: string, city: string) {
  const db = adminClient();
  if (!db) return null;
  const { data } = await db
    .from("analysis_runs")
    .select("events, created_at")
    .eq("team_key", teamKey(team, city))
    .gte("created_at", new Date(Date.now() - SAVED_FOR_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ events: FanfitEvent[]; created_at: string }>();
  return data;
}
