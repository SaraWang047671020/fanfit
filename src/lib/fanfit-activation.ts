// Activation idea for one team × partner. Every ingredient is grounded in Qloo; the model only names and writes it up.
//   theme       <- overlap of the team's and the partner's Qloo tags (lifestyle, values, tone, aesthetics)
//   performer   <- artists liked by people who like BOTH the team and the partner (+ the partner's strongest age group)
//   co-partner  <- brand partner: a local place those people like; place partner: a brand those people like
//                  (both minus anything clashing with a current team sponsor)
//   hook        <- the partner's "why now" signal from the timing step, if any
// Each performer / co-partner is scored separately against the team and against the partner, so the card can show
// "fits Austin FC fans 0.91 · fits Made In customers 0.88".

import { get } from "./qloo";
import { AGE_LABEL, type Age, type Kind, checkConflicts } from "./fanfit-score";
import { type RawEntity, S, ask, brandCategories, category, entities, isSportsy, obj, tagNames, teamSponsors } from "./fanfit";

const TAG_KINDS = {
  "lifestyle:qloo": "lifestyle",
  "core_value:qloo": "values",
  "emotional_tone:qloo": "tone",
  "cultural_relevance:qloo": "culture",
  "aesthetic_property:qloo": "look",
  "customer_segment:qloo": "audience",
  "category:place": "category",
  "ambience:qloo": "ambience",
} as const;

export interface ActivationRequest {
  team: { id: string; name: string; city: string };
  partner: { id: string; name: string; kind: Kind; category: string };
  driver: Age;
  whyNow?: string;
}

export interface Scored {
  id: string;
  name: string;
  detail: string;
  fitTeam: number | null;
  fitPartner: number | null;
}

export interface Activation {
  title: string;
  concept: string;
  segment: string;
  theme: { team: string[]; partner: string[] };
  performer: Scored | null;
  coPartner: (Scored & { kind: Kind }) | null;
  merch: string;
  hook: string;
  alternatives: { performers: string[]; coPartners: string[] };
}

export type Profile = Record<string, string[]>;

export function profile(e: RawEntity): Profile {
  const out: Profile = {};
  for (const [suffix, label] of Object.entries(TAG_KINDS)) {
    const v = tagNames(e, suffix);
    if (v.length) out[label] = v.slice(0, 8);
  }
  return out;
}

export async function profiles(ids: string[]) {
  const ents = await get("/entities", { entity_ids: ids.join(",") }, (raw) => (raw as { results?: RawEntity[] }).results ?? []);
  return new Map(ents.map((e) => [e.entity_id, e]));
}

const insights = (params: Record<string, string | number | undefined>) =>
  get("/v2/insights", params, (raw) => entities(raw));

/** Affinity of each candidate toward one signal entity (null if Qloo does not return it). */
async function affinityTo(signalId: string, type: string, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const ents = await insights({
    "filter.type": type,
    "signal.interests.entities": signalId,
    "filter.results.entities": ids.join(","),
    take: ids.length,
  });
  return new Map(ents.map((e) => [e.entity_id, e.query?.affinity ?? 0]));
}

export async function buildActivation(req: ActivationRequest): Promise<Activation> {
  const { team, partner, driver } = req;
  const both = `${team.id},${partner.id}`;
  const coType = partner.kind === "brand" ? "urn:entity:place" : "urn:entity:brand";

  const [ents, artists, coRaw, sponsors] = await Promise.all([
    profiles([team.id, partner.id]),
    insights({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": both,
      "signal.location.query": team.city,
      "signal.demographics.age": driver,
      take: 12,
    }),
    insights(
      partner.kind === "brand"
        ? { "filter.type": coType, "signal.interests.entities": both, "filter.location.query": team.city, take: 20 }
        : { "filter.type": coType, "signal.interests.entities": both, "signal.location.query": team.city, take: 40 },
    ),
    teamSponsors(team.name, team.city),
  ]);

  // Co-partner candidates: drop sports entities, the partner itself, and anything in a current sponsor's category.
  const coCandidates = coRaw
    .filter((e) => e.entity_id !== partner.id && (partner.kind === "place" ? !isSportsy(e) : true))
    .slice(0, 10)
    .map((e) => ({
      id: e.entity_id,
      name: e.name,
      detail: partner.kind === "brand" ? (tagNames(e, "category:place")[0] ?? "") : category(e),
      address: e.properties?.address ?? "",
    }));
  const cats = await brandCategories(coCandidates.map((c) => ({ name: c.name, category: c.detail })));
  const co = coCandidates.filter((c) => {
    const { existing, conflicts } = checkConflicts(c.name, cats.get(c.name) ?? ["other"], sponsors);
    return !existing.length && !conflicts.length;
  });
  const genre = (e: RawEntity) => (e.tags ?? []).find((t) => t.type?.includes(":genre"))?.name ?? "";
  const performers = artists.slice(0, 8).map((e) => ({ id: e.entity_id, name: e.name, detail: genre(e) }));

  const teamTags = profile(ents.get(team.id) ?? { entity_id: team.id, name: team.name });
  const partnerTags = profile(ents.get(partner.id) ?? { entity_id: partner.id, name: partner.name });

  // The model must pick performer / co-partner from the Qloo lists (enums), and cite the tags it used.
  const enumOr = (names: string[]) => ({ type: "string", enum: [...new Set([...names, "none"])] });
  const schema = obj({
    title: { type: "string", description: "Short event name, e.g. 'Texas Kitchen Night'." },
    concept: { type: "string", description: "2–3 sentences: what happens on matchday and why it fits both audiences." },
    theme_team_tags: { type: "array", items: S, description: "The 2–3 team tags (verbatim) the theme rests on most. Not the whole list." },
    theme_partner_tags: { type: "array", items: S, description: "The 2–3 partner tags (verbatim) the theme rests on most. Not the whole list." },
    performer: enumOr(performers.map((p) => p.name)),
    co_partner: enumOr(co.map((c) => c.name)),
    merch: { type: "string", description: "One co-branded item, using the team's and partner's look tags." },
    hook: { type: "string", description: "One sentence tying the event to the partner's current news, or empty if none was given." },
  });
  const written = await ask<{
    title: string;
    concept: string;
    theme_team_tags: string[];
    theme_partner_tags: string[];
    performer: string;
    co_partner: string;
    merch: string;
    hook: string;
  }>(
    "You design sports sponsorship activations. Build the theme only from tags that appear in the lists given. " +
      "Pick the performer and co-partner from the lists (they are ranked by Qloo for people who like both the team and the partner); " +
      "prefer the one that best fits the theme, not necessarily the first. Do not mention any other artist, venue or brand.",
    [
      `Team: ${team.name} (${team.city}). Tags: ${JSON.stringify(teamTags)}`,
      `Partner: ${partner.name} (${partner.kind === "brand" ? "brand" : "local business"}, ${partner.category}). Tags: ${JSON.stringify(partnerTags)}`,
      `Target fans: aged ${AGE_LABEL[driver]} (the partner's strongest age group among this team's fans).`,
      `Performers (Qloo, ranked): ${performers.map((p) => `${p.name}${p.detail ? ` (${p.detail})` : ""}`).join("; ") || "none"}`,
      `${partner.kind === "brand" ? "Local venues" : "Brands"} (Qloo, ranked, sponsor conflicts removed): ${co.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`).join("; ") || "none"}`,
      `Partner news: ${req.whyNow || "none"}`,
    ].join("\n"),
    "activation",
    schema,
    false,
  );

  const perf = performers.find((p) => p.name === written.performer) ?? null;
  const cop = co.find((c) => c.name === written.co_partner) ?? null;

  // Score the chosen ingredients against each side separately.
  const [perfTeam, perfPartner, coTeam, coPartnerFit] = await Promise.all([
    perf ? affinityTo(team.id, "urn:entity:artist", [perf.id]) : null,
    perf ? affinityTo(partner.id, "urn:entity:artist", [perf.id]) : null,
    cop ? affinityTo(team.id, coType, [cop.id]) : null,
    cop ? affinityTo(partner.id, coType, [cop.id]) : null,
  ]);

  const keep = (tags: string[], from: Profile) => {
    const all = new Set(Object.values(from).flat());
    return tags.filter((t) => all.has(t)).slice(0, 3);
  };

  return {
    title: written.title,
    concept: written.concept,
    segment: AGE_LABEL[driver],
    theme: { team: keep(written.theme_team_tags, teamTags), partner: keep(written.theme_partner_tags, partnerTags) },
    performer: perf && {
      ...perf,
      fitTeam: perfTeam?.get(perf.id) ?? null,
      fitPartner: perfPartner?.get(perf.id) ?? null,
    },
    coPartner: cop && {
      id: cop.id,
      name: cop.name,
      detail: [cop.detail, cop.address].filter(Boolean).join(" · "),
      kind: partner.kind === "brand" ? "place" : "brand",
      fitTeam: coTeam?.get(cop.id) ?? null,
      fitPartner: coPartnerFit?.get(cop.id) ?? null,
    },
    merch: written.merch,
    hook: written.hook,
    alternatives: {
      performers: performers.filter((p) => p !== perf).slice(0, 4).map((p) => p.name),
      coPartners: co.filter((c) => c !== cop).slice(0, 4).map((c) => c.name),
    },
  };
}
