// Sponsor side: which teams' fans love this brand. Teams are Qloo brand entities, so one call with the sponsor's brand
// as the signal scores up to 40 teams at once (filter.results.entities).
import { type Target, targetSignals } from "./audience";
import { get } from "./qloo";
import { entities } from "./fanfit";

const CHUNK = 40;

export interface DirectoryTeam {
  id: string;
  name: string;
  league: string;
  city: string;
  qloo_id: string;
  fit_mean: number;
  fit_sd: number;
  claimed_at: string | null;
}

export interface TeamFit {
  team: DirectoryTeam;
  affinity: number | null; // null: Qloo returned no score for this team
  z: number | null;
}

/**
 * With a target, Qloo scores the brand for that audience among each team's fans (age, gender, interest signals).
 * The z-score still uses the all-fans panel, so targeted scores are shifted as a whole (an audience may like every
 * brand less); targetedFit re-centres them for display. The order between teams is what the target changes.
 *
 * Fit = how this brand scores for the team's fans compared with a fixed 40-brand panel for the same team
 * (z-score against teams.fit_mean / fit_sd). Raw affinities are not comparable across teams: some teams score high
 * for every brand, thin-data teams score low.
 */
export async function teamFit(brandQlooId: string, teams: DirectoryTeam[], target?: Target | null): Promise<TeamFit[]> {
  const chunks = Array.from({ length: Math.ceil(teams.length / CHUNK) }, (_, i) => teams.slice(i * CHUNK, (i + 1) * CHUNK));
  const scored = new Map<string, number>();
  await Promise.all(
    chunks.map(async (chunk) => {
      const pairs = await get(
        "/v2/insights",
        {
          "filter.type": "urn:entity:brand",
          "signal.interests.entities": brandQlooId,
          ...targetSignals(target),
          "filter.results.entities": chunk.map((t) => t.qloo_id).join(","),
          take: chunk.length,
        },
        (raw) => entities(raw).map((e) => [e.entity_id, e.query?.affinity] as const),
      );
      for (const [id, a] of pairs) if (typeof a === "number") scored.set(id, a);
    }),
  );
  return teams
    .map((team) => {
      const affinity = scored.get(team.qloo_id) ?? null;
      return { team, affinity, z: affinity === null || !team.fit_sd ? null : (affinity - team.fit_mean) / team.fit_sd };
    })
    .sort((a, b) => (b.z ?? -Infinity) - (a.z ?? -Infinity));
}

/**
 * Targeted fits, re-centred so the average team sits where it does for all fans: the spread and order come from the
 * target, the scale stays readable next to the overall scores. Adds each team's overall rank for the "moved" column.
 */
export async function targetedFit(brandQlooId: string, teams: DirectoryTeam[], target: Target) {
  const [all, aimed] = await Promise.all([teamFit(brandQlooId, teams), teamFit(brandQlooId, teams, target)]);
  const mean = (xs: TeamFit[]) => {
    const zs = xs.map((x) => x.z).filter((z): z is number => z !== null);
    return zs.reduce((s, z) => s + z, 0) / (zs.length || 1);
  };
  const shift = mean(all) - mean(aimed);
  const overallRank = new Map(all.map((f, i) => [f.team.id, i + 1]));
  return aimed.map((f) => ({ ...f, z: f.z === null ? null : f.z + shift, overallRank: overallRank.get(f.team.id)! }));
}
