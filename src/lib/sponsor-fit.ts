// Sponsor side: which teams' fans love this brand. Teams are Qloo brand entities, so one call with the sponsor's brand
// as the signal scores up to 40 teams at once (filter.results.entities).
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
 * Fit = how this brand scores for the team's fans compared with a fixed 40-brand panel for the same team
 * (z-score against teams.fit_mean / fit_sd). Raw affinities are not comparable across teams: some teams score high
 * for every brand, thin-data teams score low.
 */
export async function teamFit(brandQlooId: string, teams: DirectoryTeam[]): Promise<TeamFit[]> {
  const chunks = Array.from({ length: Math.ceil(teams.length / CHUNK) }, (_, i) => teams.slice(i * CHUNK, (i + 1) * CHUNK));
  const scored = new Map<string, number>();
  await Promise.all(
    chunks.map(async (chunk) => {
      const pairs = await get(
        "/v2/insights",
        {
          "filter.type": "urn:entity:brand",
          "signal.interests.entities": brandQlooId,
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
