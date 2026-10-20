// Pitch report: a snapshot of why a team and a brand fit, built from FanFit's analysis and shared by link.
// team_to_brand: a club pitches a brand ("our fans love you"); brand_to_team: a brand pitches a club ("your fans love us").
// Every number and name comes from Qloo or a sourced web search; the model only writes the summary from those facts.
import { type Activation, buildActivation } from "./fanfit-activation";
import { type Signal, ask, brandCategories, brandTiming, currentSponsors } from "./fanfit";
import { AGE_LABEL, type Age, checkConflicts } from "./fanfit-score";
import { type Audience, audience, sharedAge, sharedTaste, sharedTraits, teamNews } from "./sponsor-detail";
import { type DirectoryTeam, teamFit } from "./sponsor-fit";
import { fitBand } from "./sponsor-fit-band";

export type PitchKind = "team_to_brand" | "brand_to_team";

export interface PitchReport {
  v: 1;
  kind: PitchKind;
  createdAt: string;
  team: { name: string; league: string; city: string };
  brand: { name: string; category: string };
  message: string;
  headline: string;
  summary: string;
  ask: string;
  fit: { z: number | null; band: string; rank: number; of: number };
  audience: { team: Audience | null; brand: Audience | null; overlap: Age; overlapLabel: string };
  shared: { brands: string[]; artists: string[]; places: { name: string; detail: string }[] };
  traits: { kind: string; tags: string[] }[];
  timing: { score: number; whyNow: string; signals: Signal[] } | null;
  exclusivity: { status: "clear" | "conflict" | "already" ; with: string[]; source: "club" | "web" } | null;
  activation: Activation | null;
}

export interface PitchInput {
  kind: PitchKind;
  team: DirectoryTeam;
  teams: DirectoryTeam[]; // the directory, for the fit rank
  brand: { qlooId: string; name: string; category: string };
  message: string;
  timing?: { timing: number; whyNow: string; signals: Signal[] }; // already found by Find sponsors: no second search
}

const safe = <T>(p: Promise<T>) => p.catch(() => null);

export async function buildPitch(input: PitchInput): Promise<PitchReport> {
  const { kind, team, brand } = input;
  const [fits, [ta, ba], shared, traits] = await Promise.all([
    teamFit(brand.qlooId, input.teams),
    Promise.all([safe(audience(team.qloo_id)), safe(audience(brand.qlooId))]),
    safe(sharedTaste(team.qloo_id, brand.qlooId, team.city)),
    safe(sharedTraits(team.qloo_id, brand.qlooId)),
  ]);
  const i = fits.findIndex((f) => f.team.id === team.id);
  const z = fits[i]?.z ?? null;
  const overlap = sharedAge(ta, ba);

  const [timing, exclusivity, activation] = await Promise.all([
    input.timing
      ? Promise.resolve(input.timing)
      : kind === "team_to_brand"
        ? safe(brandTiming(team.name, team.city, { id: brand.qlooId, name: brand.name, category: brand.category })).then((t) =>
            t ? { timing: t.timing, whyNow: t.why_now, signals: t.signals } : null,
          )
        : safe(teamNews(team.name, team.city, brand.name, [brand.category])).then((t) =>
            t ? { timing: t.timing, whyNow: t.whyNow, signals: t.signals } : null,
          ),
    safe(
      (async () => {
        const [{ sponsors, source }, cats] = await Promise.all([
          currentSponsors(team.name, team.city),
          brandCategories([{ name: brand.name, category: brand.category }]),
        ]);
        const c = checkConflicts(brand.name, cats.get(brand.name) ?? ["other"], sponsors);
        return c.existing.length
          ? { status: "already" as const, with: c.existing.map((s) => s.name), source }
          : c.conflicts.length
            ? { status: "conflict" as const, with: c.conflicts.map((s) => s.name), source }
            : { status: "clear" as const, with: [], source };
      })(),
    ),
    safe(
      buildActivation({
        team: { id: team.qloo_id, name: team.name, city: team.city },
        partner: { id: brand.qlooId, name: brand.name, kind: "brand", category: brand.category },
        driver: overlap,
      }),
    ),
  ]);

  const facts = {
    from: kind === "team_to_brand" ? team.name : brand.name,
    to: kind === "team_to_brand" ? brand.name : team.name,
    fit: { band: fitBand(z), z: z === null ? null : Math.round(z * 10) / 10, rank_among_teams: i + 1, teams: fits.length },
    strongest_shared_age_group: AGE_LABEL[overlap],
    fans_also_love: { brands: shared?.brands.slice(0, 5).map((b) => b.name), artists: shared?.artists.slice(0, 4).map((a) => a.name) },
    shared_traits: traits?.flatMap((t) => t.tags).slice(0, 6),
    why_now: timing?.whyNow || null,
    exclusivity: exclusivity ? `${exclusivity.status}${exclusivity.with.length ? `: ${exclusivity.with.join(", ")}` : ""}` : "unknown",
    activation_idea: activation ? `${activation.title}: ${activation.concept}` : null,
    sender_note: input.message,
  };
  const words = await ask<{ headline: string; summary: string; ask: string }>(
    "You write the opening of a one-page sponsorship pitch. Use only the facts given; do not add numbers, names or claims. " +
      "Plain, confident business English. If exclusivity starts with 'conflict' or 'already', the summary's last sentence must say so " +
      "plainly (who holds the category) and the ask should allow for it; never call that an open door.",
    JSON.stringify(facts),
    "pitch_summary",
    {
      type: "object",
      additionalProperties: false,
      required: ["headline", "summary", "ask"],
      properties: {
        headline: { type: "string", description: "Under 12 words, e.g. 'Seattle Sounders fans already love REI'." },
        summary: { type: "string", description: "3 sentences: the fit and its strength, who the shared fans are, why now." },
        ask: { type: "string", description: "One sentence: the concrete next step proposed." },
      },
    },
    false,
  );

  return {
    v: 1,
    kind,
    createdAt: new Date().toISOString(),
    team: { name: team.name, league: team.league, city: team.city },
    brand: { name: brand.name, category: brand.category },
    message: input.message,
    headline: words.headline,
    summary: words.summary,
    ask: words.ask,
    fit: { z, band: fitBand(z), rank: i + 1, of: fits.length },
    audience: { team: ta, brand: ba, overlap, overlapLabel: AGE_LABEL[overlap] },
    shared: {
      brands: (shared?.brands ?? []).slice(0, 8).map((b) => b.name),
      artists: (shared?.artists ?? []).slice(0, 6).map((a) => a.name),
      places: (shared?.places ?? []).slice(0, 6).map((p) => ({ name: p.name, detail: p.detail })),
    },
    traits: traits ?? [],
    timing: timing ? { score: timing.timing, whyNow: timing.whyNow, signals: timing.signals } : null,
    exclusivity,
    activation,
  };
}
