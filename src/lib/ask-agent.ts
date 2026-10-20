// "Ask FanFit": a goal-driven tool-use agent (OpenAI Responses API + FanFit's Qloo tools) for sponsors and teams.
// The model plans and writes; every team, brand and place it may name comes from a tool result.
// Grounding is enforced in code: submit_answer is rejected if a pick's id was never returned by a tool.
import OpenAI from "openai";
import type { FunctionTool, ResponseInputItem } from "openai/resources/responses/responses";
import { brandCategories, categoryLeaders, composition, currentSponsors, entities, tagNames } from "./fanfit";
import {
  AGES,
  AGE_LABEL,
  type Age,
  type BrandHit,
  type Kind,
  SPONSOR_CATEGORIES,
  type SponsorCategoryKey,
  checkConflicts,
  rankWithTiming,
  shortlist,
  scoreBrands,
  weightsFromAffinity,
} from "./fanfit-score";
import type { Timing } from "./fanfit";
import { loadSavedRun } from "./saved-runs";
import { get } from "./qloo";
import { audience, sharedAge, sharedTaste, sharedTraits, teamNews } from "./sponsor-detail";
import { INTERESTS, parseTarget } from "./audience";
import { type DirectoryTeam, type TeamFit, targetedFit, teamFit } from "./sponsor-fit";
import { fitBand } from "./sponsor-fit-band";

const DEFAULT_MODEL = "gpt-5.4-mini";
const CLASH_WORDS = /clash|conflict|already (a |an )?sponsor|taken|sold|blocked|not open|closed/i;
const MAX_TURNS = 10;
const MAX_WEB_SEARCHES = 2; // team_news calls per question: each is a paid web search

export type AskContext =
  | { role: "sponsor"; brand: { name: string; qlooId: string; categories: string[] }; teams: DirectoryTeam[]; listed: { team_id: string; name: string; category: string }[] }
  | { role: "team"; team: { id: string; name: string; city: string; qlooId: string }; teams: DirectoryTeam[] };

export interface Pick {
  id: string;
  name: string;
  kind: "team" | "brand" | "place";
  why: string;
  evidence: string[];
}
export interface Answer {
  summary: string;
  picks: Pick[];
  caveats: string;
}

export type AskEvent =
  | { type: "tool_call"; step: number; tool: string; reason: string; args: Record<string, unknown> }
  | { type: "tool_result"; step: number; tool: string; summary: string; error?: boolean }
  | { type: "note"; text: string }
  | { type: "answer"; answer: Answer }
  | { type: "error"; message: string }
  | { type: "done"; ms: number; toolCalls: number };

type ToolResult = { summary: string; output: unknown };
type Tool = (args: Record<string, unknown>) => Promise<ToolResult>;

const reason = { type: "string", description: "One short sentence: why this step, shown to the user." };
const fn = (name: string, description: string, properties: Record<string, unknown>): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: {
    type: "object",
    properties: { reason, ...properties },
    required: ["reason", ...Object.keys(properties)],
    additionalProperties: false,
  },
});
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

const SUBMIT = fn("submit_answer", "Finish with the answer. Every pick id must come from an earlier tool result.", {
  summary: { type: "string", description: "2-4 sentences answering the question directly." },
  picks: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id exactly as a tool returned it." },
        kind: { type: "string", enum: ["team", "brand", "place"] },
        why: { type: "string", description: "One sentence, in plain words." },
        evidence: { type: "array", items: { type: "string" }, description: "1-3 short facts from tool results (numbers welcome)." },
      },
      required: ["id", "kind", "why", "evidence"],
      additionalProperties: false,
    },
  },
  caveats: { type: "string", description: "What the data cannot tell (thin data, unknown sponsor lists, no deal history). Empty if none." },
});

const round = (x: number | null, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const ageSkew = (a: Record<string, number> | undefined) =>
  a ? Object.entries(a).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, v]) => `${AGE_LABEL[k as keyof typeof AGE_LABEL]} (${v > 0 ? "+" : ""}${v.toFixed(2)})`) : [];

// ---------------------------------------------------------------- tools by role

function sponsorTools(ctx: Extract<AskContext, { role: "sponsor" }>, seen: Map<string, { name: string; kind: Pick["kind"] }>, web: { used: number }) {
  const covered = new Set<string>(SPONSOR_CATEGORIES.filter((c) => ctx.brand.categories.includes(c.key)).flatMap((c) => c.covers));
  const byId = new Map(ctx.teams.map((t) => [t.id, t]));
  const team = (id: unknown) => {
    const t = byId.get(String(id));
    if (!t) throw new Error(`Unknown team_id ${id}. Use ids from rank_teams.`);
    return t;
  };
  const categoryStatus = (teamId: string) => {
    const listed = ctx.listed.filter((s) => s.team_id === teamId);
    const taken = listed.filter((s) => covered.has(s.category)).map((s) => s.name);
    return taken.length ? `taken by ${taken.join(", ")}` : listed.length ? "open (per the club's list)" : "unknown (club has not listed sponsors; check before outreach)";
  };

  const defs: FunctionTool[] = [
    fn("rank_teams", `Rank teams by how much more their fans like ${ctx.brand.name} than a typical big brand (Qloo; z-score). Filters are optional.`, {
      league: nullable({ type: "string", enum: ["NBA", "MLS", "WNBA", "NWSL"] }),
      states: nullable({ type: "array", items: { type: "string" }, description: "Two-letter US states or Canadian provinces, e.g. GA, FL." }),
      open_category_only: { type: "boolean", description: "Drop teams whose club lists a sponsor in the brand's categories (teams with unknown lists stay)." },
      limit: { type: "integer", description: "1-15" },
      target_age: nullable({ type: "string", enum: [...AGES], description: "Score for fans in this age group only." }),
      target_gender: nullable({ type: "string", enum: ["female", "male"] }),
      target_interest: nullable({ type: "string", enum: Object.keys(INTERESTS), description: "Score for fans into this interest." }),
    }),
    fn("team_audience", `Fans of a team vs ${ctx.brand.name}'s customers by age and gender (Qloo demographics).`, { team_id: { type: "string" } }),
    fn("shared_taste", `Brands, artists and places liked by people who like both the team and ${ctx.brand.name}, plus shared Qloo tags.`, { team_id: { type: "string" } }),
    fn("team_news", `Recent news on why the team is (or is not) a good sponsorship opportunity now. Web search; at most ${MAX_WEB_SEARCHES} per question.`, { team_id: { type: "string" } }),
    SUBMIT,
  ];

  const tools: Record<string, Tool> = {
    rank_teams: async ({ league, states, open_category_only, limit, target_age, target_gender, target_interest }) => {
      const target = parseTarget({ age: target_age as string, gender: target_gender as string, interest: target_interest as string });
      const fits: (TeamFit & { overallRank?: number })[] = target
        ? await targetedFit(ctx.brand.qlooId, ctx.teams, target)
        : await teamFit(ctx.brand.qlooId, ctx.teams);
      const st = Array.isArray(states) ? states.map((s) => String(s).toUpperCase()) : null;
      const rows = fits
        .filter((f) => (!league || f.team.league === league) && (!st || st.includes(f.team.city.split(",").pop()!.trim().toUpperCase())))
        .map((f) => ({
          team_id: f.team.id,
          name: f.team.name,
          league: f.team.league,
          city: f.team.city,
          fit_z: round(f.z),
          fit: fitBand(f.z),
          ...(f.overallRank ? { rank_for_all_fans: f.overallRank } : {}),
          category: categoryStatus(f.team.id),
        }))
        .filter((r) => !open_category_only || !r.category.startsWith("taken"))
        .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 15));
      rows.forEach((r) => seen.set(r.team_id, { name: r.name, kind: "team" }));
      return { summary: `${rows.length} teams: ${rows.slice(0, 4).map((r) => `${r.name} ${r.fit_z ?? "?"}σ`).join(", ")}${rows.length > 4 ? "…" : ""}`, output: rows };
    },
    team_audience: async ({ team_id }) => {
      const t = team(team_id);
      const [ta, ba] = await Promise.all([audience(t.qloo_id), audience(ctx.brand.qlooId)]);
      const both = sharedAge(ta, ba);
      return {
        summary: `${t.name}: fans skew ${ageSkew(ta?.age).join(", ") || "n/a"}; strongest overlap ${AGE_LABEL[both]}`,
        output: { team: t.name, fans_top_ages: ageSkew(ta?.age), customers_top_ages: ageSkew(ba?.age), strongest_overlap: AGE_LABEL[both], fans_gender: ta?.gender, customers_gender: ba?.gender },
      };
    },
    shared_taste: async ({ team_id }) => {
      const t = team(team_id);
      const [s, traits] = await Promise.all([sharedTaste(t.qloo_id, ctx.brand.qlooId, t.city), sharedTraits(t.qloo_id, ctx.brand.qlooId)]);
      [...s.brands].forEach((b) => seen.set(b.id, { name: b.name, kind: "brand" }));
      s.places.forEach((p) => seen.set(p.id, { name: p.name, kind: "place" }));
      return {
        summary: `${t.name}: ${s.brands.slice(0, 3).map((b) => b.name).join(", ")}; artists ${s.artists.slice(0, 2).map((a) => a.name).join(", ")}`,
        output: {
          team: t.name,
          brands: s.brands.map((b) => ({ id: b.id, name: b.name })),
          artists: s.artists.map((a) => a.name),
          places: s.places.map((p) => ({ id: p.id, name: p.name, category: p.detail })),
          shared_tags: traits,
        },
      };
    },
    team_news: async ({ team_id }) => {
      if (web.used >= MAX_WEB_SEARCHES) throw new Error(`News search limit (${MAX_WEB_SEARCHES}) reached for this question.`);
      web.used++;
      const t = team(team_id);
      const labels = SPONSOR_CATEGORIES.filter((c) => ctx.brand.categories.includes(c.key)).map((c) => c.label);
      const n = await teamNews(t.name, t.city, ctx.brand.name, labels);
      return { summary: `${t.name}: timing ${n.timing}/3${n.whyNow ? ` · ${n.whyNow}` : ""}`, output: { team: t.name, ...n } };
    },
  };
  return { defs, tools };
}

function teamTools(ctx: Extract<AskContext, { role: "team" }>, seen: Map<string, { name: string; kind: Pick["kind"] }>, blocked: Map<string, string>) {
  const { team } = ctx;
  const findBrand = (name: string) =>
    get("/search", { query: name, types: "urn:entity:brand", take: 5 }, (raw) =>
      ((raw as { results?: { entity_id: string; name: string }[] }).results ?? []).map((e) => ({ id: e.entity_id, name: e.name })),
    );

  const defs: FunctionTool[] = [
    fn(
      "saved_analysis",
      `The latest full Find sponsors run for ${team.name} (if saved in the last 14 days): the ranked brands and local businesses to call, with fit scores, the age group each is strongest with, timing ("why now") from web news, and which were set aside for clashing with current sponsors. No Qloo cost. Use it first for "who should we call" questions so answers match the Find sponsors page.`,
      {},
    ),
    fn("fan_profile", `Who ${team.name}'s fans are: age and gender skew vs the average (Qloo demographics).`, {}),
    fn("brand_fit", `How much more ${team.name}'s fans like a named brand than other teams' fans do (Qloo; rank among all teams).`, {
      brand_name: { type: "string" },
    }),
    fn("category_leaders", `Brands in one sponsorship category that ${team.name}'s fans like most (Qloo, team + ${team.city}).`, {
      category: { type: "string", enum: SPONSOR_CATEGORIES.map((c) => c.key) },
    }),
    fn("local_businesses", `Local businesses in ${team.city} that ${team.name}'s fans like most (Qloo places).`, {
      limit: { type: "integer", description: "1-15" },
    }),
    fn("check_conflicts", `Whether a brand clashes with ${team.name}'s current sponsors (the club's list, else web search).`, {
      brand_name: { type: "string" },
    }),
    SUBMIT,
  ];

  const tools: Record<string, Tool> = {
    saved_analysis: async () => {
      const run = await loadSavedRun(team.name, team.city);
      if (!run) throw new Error(`No saved Find sponsors run for ${team.name} in the last 14 days. Use the other tools, and suggest running Find sponsors.`);
      const buckets: Record<Kind, Partial<Record<Age, BrandHit[]>>> = { brand: {}, place: {} };
      const timings: Record<string, Timing> = {};
      let weights = Object.fromEntries(AGES.map((a) => [a, 1 / AGES.length])) as Record<Age, number>;
      for (const e of run.events) {
        if (e.type === "bucket") buckets[e.kind][e.age] = e.items;
        else if (e.type === "timing") timings[e.timing.brandId] = e.timing;
        else if (e.type === "composition" && e.estimated) weights = weightsFromAffinity(e.age);
      }
      // Find sponsors checks timing for its first candidates only. Check the rest against the current sponsor list
      // here (one category lookup, no Qloo) so an unchecked brand that is already signed never reads as open, and pull
      // in more candidates as signed ones drop out, the same way the page does.
      const scored = { brand: [] as ReturnType<typeof scoreBrands>, place: [] as ReturnType<typeof scoreBrands> };
      for (const k of ["brand", "place"] as const) {
        const b = buckets[k];
        if (AGES.every((a) => b[a])) scored[k] = scoreBrands(b as Record<Age, BrandHit[]>, weights);
      }
      let sponsors: Awaited<ReturnType<typeof currentSponsors>>["sponsors"] | null = null;
      const tops = { brand: shortlist(scored.brand, timings, "brand"), place: shortlist(scored.place, timings, "place") };
      for (let round = 0; round < 4; round++) {
        const unchecked = (["brand", "place"] as const).flatMap((k) => tops[k].filter((r) => !timings[r.id]).map((r) => ({ r, k })));
        if (!unchecked.length) break;
        sponsors ??= (await currentSponsors(team.name, team.city)).sponsors;
        const cats = await brandCategories(unchecked.map(({ r }) => ({ name: r.name, category: r.category })));
        for (const { r, k } of unchecked) {
          const c = checkConflicts(r.name, cats.get(r.name) ?? ["other"], sponsors, k === "place");
          timings[r.id] = { brandId: r.id, name: r.name, categories: cats.get(r.name) ?? [], timing: 0, whyNow: "", relationship: "", fitRisk: "", signals: [], ...c, exclusivityOnly: true };
        }
        tops.brand = shortlist(scored.brand, timings, "brand");
        tops.place = shortlist(scored.place, timings, "place");
      }
      const out = (kind: Kind) => {
        const { ranked, excluded } = rankWithTiming(tops[kind], timings, kind);
        const row = (r: (typeof ranked)[number]) => {
          seen.set(r.row.id, { name: r.row.name, kind: kind === "place" ? "place" : "brand" });
          const t = timings[r.row.id];
          return {
            id: r.row.id,
            name: r.row.name,
            category: r.row.category,
            fit_score: Math.round(r.row.score),
            strongest_age: AGE_LABEL[r.row.driver],
            timing: t && !t.exclusivityOnly ? `${t.timing}/3` : "not checked",
            why_now: t?.whyNow || undefined,
            clash:
              t && (t.existing.length || (kind === "brand" && t.conflicts.length))
                ? [...t.existing, ...(kind === "brand" ? t.conflicts : [])].map((x) => x.name).join(", ")
                : undefined,
          };
        };
        const aside = excluded.map(row);
        aside.forEach((r) => r.clash && blocked.set(r.name.toLowerCase(), `clashes with ${r.clash}`));
        return { ranked: ranked.map(row), set_aside: aside };
      };
      const brands = out("brand");
      const places = out("place");
      return {
        summary: `saved ${run.created_at.slice(0, 10)}: brands ${brands.ranked.slice(0, 3).map((r) => r.name).join(", ")}; places ${places.ranked.slice(0, 2).map((r) => r.name).join(", ")}`,
        output: { saved_on: run.created_at.slice(0, 10), brands, local_businesses: places },
      };
    },
    fan_profile: async () => {
      const c = await composition(team.qlooId);
      return { summary: `fans skew ${ageSkew(c?.age as Record<string, number> | undefined).join(", ") || "n/a"}`, output: c ?? { note: "no demographic data" } };
    },
    brand_fit: async ({ brand_name }) => {
      const hits = await findBrand(String(brand_name));
      const b = hits.find((h) => h.name.toLowerCase() === String(brand_name).toLowerCase()) ?? hits[0];
      if (!b) throw new Error(`Qloo has no brand called ${brand_name}.`);
      const fits = await teamFit(b.id, ctx.teams);
      const i = fits.findIndex((f) => f.team.name === team.name);
      seen.set(b.id, { name: b.name, kind: "brand" });
      const mine = fits[i];
      return {
        summary: `${b.name}: ${fitBand(mine?.z ?? null)} (${round(mine?.z ?? null)}σ), #${i + 1} of ${fits.length} teams`,
        output: { brand_id: b.id, brand: b.name, fit_z: round(mine?.z ?? null), fit: fitBand(mine?.z ?? null), rank_among_teams: i + 1, teams: fits.length, top_teams: fits.slice(0, 3).map((f) => f.team.name) },
      };
    },
    category_leaders: async ({ category }) => {
      const { location, items } = await categoryLeaders(team.qlooId, team.city, category as SponsorCategoryKey);
      const top = items.slice(0, 8);
      top.forEach((x) => seen.set(x.id, { name: x.name, kind: "brand" }));
      return { summary: `${category}: ${top.slice(0, 4).map((x) => x.name).join(", ")}${location !== team.city ? " (US-wide)" : ""}`, output: { location, brands: top.map((x) => ({ id: x.id, name: x.name })) } };
    },
    local_businesses: async ({ limit }) => {
      const n = Math.min(Math.max(Number(limit) || 10, 1), 15);
      const places = await get(
        "/v2/insights",
        { "filter.type": "urn:entity:place", "signal.interests.entities": team.qlooId, "filter.location.query": team.city, take: 30 },
        (raw) => entities(raw).map((e) => ({ id: e.entity_id, name: e.name, category: tagNames(e, "category:place")[0] ?? "", address: e.properties?.address ?? "" })),
      );
      const top = places.slice(0, n);
      top.forEach((p) => seen.set(p.id, { name: p.name, kind: "place" }));
      return { summary: top.slice(0, 4).map((p) => p.name).join(", "), output: top };
    },
    check_conflicts: async ({ brand_name }) => {
      const name = String(brand_name);
      const [{ sponsors, source }, cats] = await Promise.all([currentSponsors(team.name, team.city), brandCategories([{ name, category: "" }])]);
      const { existing, conflicts, crowded } = checkConflicts(name, cats.get(name) ?? ["other"], sponsors);
      // A verdict word and a plain sentence: a bare list of "conflicts" was once read as "no conflict".
      const verdict = existing.length ? "already_sponsor" : conflicts.length ? "conflict" : crowded.length ? "same_group" : "clear";
      if (existing.length) blocked.set(name.toLowerCase(), "is already a sponsor");
      else if (conflicts.length) blocked.set(name.toLowerCase(), `clashes with ${conflicts.map((s) => s.name).join(", ")}`);
      else blocked.delete(name.toLowerCase()); // a fresh check overrides the saved run
      const plain =
        verdict === "already_sponsor"
          ? `${name} is already a ${team.name} sponsor.`
          : verdict === "conflict"
            ? `${name} would clash: ${team.name} has already sold this category to ${conflicts.map((s) => s.name).join(", ")}.`
            : verdict === "same_group"
              ? `No direct clash, but ${team.name} has sponsors in a related category: ${crowded.map((s) => s.name).join(", ")}.`
              : `No clash with ${team.name}'s current sponsors.`;
      return {
        summary: `${verdict.toUpperCase()}: ${plain}`,
        output: { brand: name, verdict, explanation: plain, categories: cats.get(name), sponsor_list_source: source },
      };
    },
  };
  return { defs, tools };
}

// ---------------------------------------------------------------- loop

function instructions(ctx: AskContext) {
  const who =
    ctx.role === "sponsor"
      ? `You help ${ctx.brand.name}'s partnerships team choose sports teams to sponsor (categories: ${ctx.brand.categories.join(", ") || "any"}).`
      : `You help ${ctx.team.name}'s (${ctx.team.city}) partnerships team choose brands and local businesses to approach.`;
  return [
    who,
    "Answer the user's goal with FanFit's tools, which read Qloo's taste data. Plan briefly, call the tools you need, then finish with submit_answer.",
    "Rules: name only teams, brands and places that a tool returned, and use their ids exactly. Do not use your own knowledge of sponsors or brands as fact.",
    "Fit scores show how much more these fans like something than a typical comparison; they do not predict sponsorship results. Say so if the user asks about results.",
    'A category marked "unknown" means the club has not listed its sponsors: call it unknown and suggest checking, never "open".',
    'When check_conflicts returns verdict "conflict" or "already_sponsor", say plainly that the category is taken (or the brand is already a sponsor); do not present that brand as an open option.',
    "Prefer 2-5 picks. Keep why and evidence short and concrete (numbers from tools). Put data gaps in caveats.",
    ...(ctx.role === "team"
      ? ["For who-to-call or best-partner questions, start with saved_analysis so the answer matches the Find sponsors page; say which picks it ranked and in what order."]
      : []),
  ].join("\n");
}

export async function runAsk(question: string, ctx: AskContext, emit: (e: AskEvent) => void) {
  const t0 = Date.now();
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const seen = new Map<string, { name: string; kind: Pick["kind"] }>();
  // Brands a tool showed to be signed or in a sold category (lowercase name -> reason): picks must say so.
  const blocked = new Map<string, string>();
  const { defs, tools } = ctx.role === "sponsor" ? sponsorTools(ctx, seen, { used: 0 }) : teamTools(ctx, seen, blocked);
  let answer: Answer | null = null;
  let step = 0;

  tools.submit_answer = async ({ summary, picks, caveats }) => {
    const list = (Array.isArray(picks) ? picks : []) as { id: string; kind: Pick["kind"]; why: string; evidence: string[] }[];
    const unknown = list.filter((p) => !seen.has(p.id));
    if (unknown.length)
      throw new Error(`These ids never came from a tool: ${unknown.map((p) => p.id).join(", ")}. Use only ids returned by tools.`);
    // A clashing brand may be named (e.g. "the bank category is sold"), but never as if it were open.
    const hidden = list.filter((p) => blocked.has(seen.get(p.id)!.name.toLowerCase()) && !CLASH_WORDS.test([p.why, ...p.evidence].join(" ")));
    if (hidden.length)
      throw new Error(
        `${hidden.map((p) => `${seen.get(p.id)!.name} ${blocked.get(seen.get(p.id)!.name.toLowerCase())}`).join("; ")}. Drop these picks, or say the clash plainly in why.`,
      );
    answer = {
      summary: String(summary ?? ""),
      caveats: String(caveats ?? ""),
      picks: list.map((p) => ({ id: p.id, name: seen.get(p.id)!.name, kind: seen.get(p.id)!.kind, why: p.why, evidence: p.evidence.slice(0, 3) })),
    };
    return { summary: `${list.length} picks submitted`, output: { ok: true } };
  };

  let previousResponseId: string | undefined;
  let nextInput: ResponseInputItem[] = [{ role: "user", content: question }];
  let nudges = 0;
  for (let turn = 0; turn < MAX_TURNS && !answer; turn++) {
    const res = await client.responses.create({ model, instructions: instructions(ctx), input: nextInput, tools: defs, previous_response_id: previousResponseId });
    previousResponseId = res.id;
    const calls = res.output.filter((o) => o.type === "function_call");
    if (calls.length === 0) {
      if (res.output_text?.trim()) emit({ type: "note", text: res.output_text.trim() });
      if (nudges++ >= 1) break;
      nextInput = [{ role: "user", content: "Finish by calling submit_answer with picks from the tool results." }];
      continue;
    }
    nextInput = await Promise.all(
      calls.map(async (call): Promise<ResponseInputItem> => {
        const n = ++step;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments);
        } catch {}
        const { reason: why, ...rest } = args;
        emit({ type: "tool_call", step: n, tool: call.name, reason: String(why ?? ""), args: call.name === "submit_answer" ? {} : rest });
        try {
          const tool = tools[call.name];
          if (!tool) throw new Error(`Unknown tool ${call.name}`);
          const r = await tool(rest);
          emit({ type: "tool_result", step: n, tool: call.name, summary: r.summary });
          return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(r.output) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emit({ type: "tool_result", step: n, tool: call.name, summary: message, error: true });
          return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: message }) };
        }
      }),
    );
  }

  if (answer) emit({ type: "answer", answer });
  else emit({ type: "error", message: "The agent stopped without an answer. Try a more specific question." });
  emit({ type: "done", ms: Date.now() - t0, toolCalls: step });
}
