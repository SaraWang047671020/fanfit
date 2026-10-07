// TasteFrame Agent: a goal-driven tool-use loop (OpenAI Responses API + Qloo tools).
// The model plans, proposes candidates and writes rationales; every metric comes from Qloo via tasteframe.ts.
// Grounding rule enforced in code: an entity can only be swapped in after a tool has returned its Qloo ID.

import OpenAI from "openai";
import type { FunctionTool, ResponseInputItem } from "openai/resources/responses/responses";
import { DOMAINS, type Domain, type EntityType } from "./qloo";
import {
  type CreativePackage,
  type PackageEntity,
  type PackageMetrics,
  applySwaps,
  compareDomain,
  evaluatePackage,
  packageContext,
  resolveEntity,
  tasteBridge,
} from "./tasteframe";

const DEFAULT_MODEL = "gpt-5.4-mini";
const MAX_TURNS = 14;
const MIN_CORE_RETENTION = 0.5;

export interface AgentInput {
  goal: string;
  base: CreativePackage;
  audience: { label: string; seeds: { id: string; name: string }[]; age?: string };
  maxSwaps: number;
}

export interface Evaluation {
  versionId: string;
  swaps: PackageEntity[];
  metrics: PackageMetrics;
}

export interface Proposal {
  versionId: string;
  title: string;
  rationale: string;
  evaluation: Evaluation;
}

export type AgentEvent =
  | { type: "start"; goal: string; model: string; base: CreativePackage; audience: string; baseline: PackageMetrics }
  | { type: "tool_call"; step: number; tool: string; reason: string; args: Record<string, unknown> }
  | { type: "tool_result"; step: number; tool: string; summary: string; evaluation?: Evaluation; error?: boolean }
  | { type: "note"; text: string }
  | { type: "proposals"; proposals: Proposal[] }
  | { type: "done"; ms: number; toolCalls: number }
  | { type: "error"; message: string };

// ---------------------------------------------------------------- tool schemas

const reason = { type: "string", description: "One sentence: why you are making this call. Shown to the user." };
const entityType = { type: "string", enum: ["movie", "artist", "brand", "person"] };
const fn = (name: string, description: string, properties: Record<string, unknown>): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: { type: "object", properties: { reason, ...properties }, required: ["reason", ...Object.keys(properties)], additionalProperties: false },
});

const TOOLS: FunctionTool[] = [
  fn("inspect_package", "See the base package's slots and its current cultural neighbourhood per domain (top Qloo results and tags).", {}),
  fn(
    "find_bridges",
    "Find Qloo entities that rank for BOTH the base package and the target audience in one domain. Good swap candidates for the slot of the same type.",
    { domain: { type: "string", enum: [...DOMAINS] } },
  ),
  fn(
    "search_entity",
    "Resolve a candidate you thought of (e.g. an actor or musician) to a Qloo entity ID. Required before you can swap it in.",
    { name: { type: "string" }, type: entityType },
  ),
  fn(
    "evaluate_swaps",
    "Apply one or more swaps to the BASE package and measure the result with Qloo. Each replacement must have the same type as the slot it replaces and an ID returned by an earlier tool.",
    {
      swaps: {
        type: "array",
        items: {
          type: "object",
          properties: { slot: { type: "string" }, entity_id: { type: "string" } },
          required: ["slot", "entity_id"],
          additionalProperties: false,
        },
      },
    },
  ),
  fn("submit_proposals", "Finish: submit 2–3 evaluated versions as proposals for the human to decide on.", {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          version_id: { type: "string" },
          title: { type: "string", description: "Short, e.g. 'Swap cast to Jenna Ortega'" },
          rationale: { type: "string", description: "2–3 sentences citing only numbers and entities returned by tools." },
        },
        required: ["version_id", "title", "rationale"],
        additionalProperties: false,
      },
    },
  }),
];

function instructions(input: AgentInput) {
  return `You are TasteFrame's creative-packaging agent. A film team gives you a creative package and a goal.
You explore alternative packages and report evidence; the humans make the creative decision.

Goal: ${input.goal}
Target audience: ${input.audience.label} (seeds: ${input.audience.seeds.map((s) => s.name).join(", ")}${input.audience.age ? `; age ${input.audience.age}` : ""})
Constraints: change at most ${input.maxSwaps} slot(s) per proposal. Keep core_retention >= ${MIN_CORE_RETENTION}.

Metrics (computed from Qloo, never estimate them yourself):
- target_overlap: share of the package's cultural neighbours that the target audience also likes. Higher = closer to the audience.
- core_retention: share of neighbours kept from the original package. Lower = the original identity is being lost.

Process:
1. inspect_package once.
2. Use find_bridges in the domains that match swappable slots. Bridges do not cover "person" slots, so propose
   2–3 actors yourself who could plausibly fit both the original tone and the audience, and resolve them with search_entity.
   Only swap in entities whose IDs a tool returned. Never swap in the audience seed entities themselves.
3. Call evaluate_swaps on at least 5 distinct single swaps covering different slots (including cast).
4. After seeing the results, evaluate combinations of the best singles from different slots.
5. submit_proposals with the 2–3 best versions that beat the base target_overlap and keep the core. If fewer qualify, submit only those. Rationales must cite tool numbers only; no box office, no success claims.
Be efficient: make independent calls in parallel. Every call needs a one-sentence reason.`;
}

// ---------------------------------------------------------------- run

export async function runAgent(input: AgentInput, emit: (e: AgentEvent) => void) {
  const t0 = Date.now();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const client = new OpenAI();
  const seeds = input.audience.seeds.map((s) => s.id);
  const age = input.audience.age;

  const known = new Map<string, PackageEntity>(); // entity_id -> entity returned by a tool (grounding)
  const evaluations = new Map<string, Evaluation>();
  const slots = new Map(input.base.entities.map((e) => [e.slot, e]));
  const seedIds = new Set(seeds);
  let step = 0;
  let versionCounter = 0; // allocated synchronously: evaluate_swaps calls run in parallel
  let submitted: Proposal[] | null = null;

  const baseline = await evaluatePackage(input.base, input.base, seeds, age);
  emit({ type: "start", goal: input.goal, model, base: input.base, audience: input.audience.label, baseline });

  const tools: Record<string, (a: Record<string, unknown>) => Promise<{ summary: string; output: unknown; evaluation?: Evaluation }>> = {
    async inspect_package() {
      const ctx = await Promise.all(DOMAINS.map(async (d) => ({ domain: d, top: (await packageContext(input.base, d, 15)) })));
      const output = {
        slots: input.base.entities.map((e) => ({ slot: e.slot, type: e.type, current: e.name })),
        baseline: round(baseline),
        neighbourhood: ctx.map((c) => ({
          domain: c.domain,
          top: c.top.slice(0, 10).map((e) => e.name),
          tags: topTags(c.top.flatMap((e) => e.tags ?? []).map((t) => t.name)),
        })),
      };
      return { summary: `${output.slots.length} slots; baseline target_overlap ${pct(baseline.targetOverlap)}`, output };
    },

    async find_bridges(a) {
      const domain = a.domain as Domain;
      const r = await tasteBridge(input.base, seeds, domain, age);
      const top = r.bridges.slice(0, 8);
      for (const b of top) known.set(b.id, { id: b.id, name: b.name, type: domain, slot: "" });
      const output = r.insufficientSignal
        ? { insufficient_signal: true }
        : top.map((b) => ({ entity_id: b.id, name: b.name, type: domain, rank_for_package: b.rankInPackage, rank_for_audience: b.rankInAudience }));
      return { summary: r.insufficientSignal ? "insufficient signal" : top.slice(0, 4).map((b) => b.name).join(", "), output };
    },

    async search_entity(a) {
      const hit = await resolveEntity(String(a.name), a.type as EntityType);
      if (!hit) return { summary: `"${a.name}" not found in Qloo`, output: { found: false } };
      known.set(hit.id, { id: hit.id, name: hit.name, type: hit.type, slot: "" });
      return { summary: `${hit.name} → ${hit.id.slice(0, 8)}…`, output: { found: true, entity_id: hit.id, name: hit.name, type: hit.type } };
    },

    async evaluate_swaps(a) {
      const raw = (a.swaps as { slot: string; entity_id: string }[]) ?? [];
      if (raw.length === 0 || raw.length > input.maxSwaps) throw new Error(`Use 1–${input.maxSwaps} swaps.`);
      const swaps = raw.map(({ slot, entity_id }) => {
        const current = slots.get(slot);
        const entity = known.get(entity_id);
        if (!current) throw new Error(`Unknown slot "${slot}". Slots: ${[...slots.keys()].join(", ")}`);
        if (!entity) throw new Error(`Entity ${entity_id} was not returned by any tool. Resolve it with search_entity first.`);
        if (entity.type !== current.type) throw new Error(`Slot "${slot}" needs a ${current.type}, got a ${entity.type}.`);
        if (seedIds.has(entity_id)) throw new Error(`${entity.name} is an audience seed; swapping it in would make the metric circular.`);
        return { ...entity, slot };
      });
      const versionId = `v${++versionCounter}`;
      const pkg = applySwaps(input.base, swaps, versionId);
      const [metrics, shifts] = await Promise.all([
        evaluatePackage(pkg, input.base, seeds, age),
        Promise.all(DOMAINS.map((d) => compareDomain(input.base, pkg, d))),
      ]);
      const evaluation: Evaluation = { versionId, swaps, metrics };
      evaluations.set(versionId, evaluation);
      const output = {
        version_id: versionId,
        swaps: swaps.map((s) => `${s.slot}: ${slots.get(s.slot)!.name} -> ${s.name}`),
        target_overlap: { this_version: +metrics.targetOverlap.toFixed(3), base: +baseline.targetOverlap.toFixed(3) },
        core_retention: +metrics.coreRetention.toFixed(3),
        by_domain: metrics.perDomain.map((d, i) => ({
          domain: d.domain,
          target_overlap: +d.targetOverlap.toFixed(3),
          target_overlap_base: +baseline.perDomain[i].targetOverlap.toFixed(3),
          core_retention: +d.coreRetention.toFixed(3),
        })),
        shifts: shifts.map((c) => ({
          domain: c.domain,
          entering: c.gained.slice(0, 4).map((e) => e.name),
          leaving: c.lost.slice(0, 4).map((e) => e.name),
          tags_rising: c.tags.rising.slice(0, 3).map((t) => t.tag),
          tags_falling: c.tags.falling.slice(0, 3).map((t) => t.tag),
        })),
      };
      return {
        summary: `${versionId}: target ${pct(metrics.targetOverlap)} (base ${pct(baseline.targetOverlap)}), core kept ${pct(metrics.coreRetention)}`,
        output,
        evaluation,
      };
    },

    async submit_proposals(a) {
      const list = (a.proposals as { version_id: string; title: string; rationale: string }[]) ?? [];
      const missing = list.filter((p) => !evaluations.has(p.version_id)).map((p) => p.version_id);
      if (list.length === 0 || missing.length) throw new Error(`Unknown version ids: ${missing.join(", ") || "none given"}`);
      if (evaluations.size < 5) throw new Error(`Only ${evaluations.size} options evaluated; evaluate at least 5, including combinations of your best singles.`);
      const improves = (e: Evaluation) =>
        e.metrics.targetOverlap > baseline.targetOverlap && e.metrics.coreRetention >= MIN_CORE_RETENTION;
      const goodSingles = [...evaluations.values()].filter((e) => e.swaps.length === 1 && improves(e));
      const [b1, b2] = goodSingles
        .sort((x, y) => y.metrics.targetOverlap - x.metrics.targetOverlap)
        .filter((e, i, arr) => arr.findIndex((o) => o.swaps[0].slot === e.swaps[0].slot) === i);
      const comboTried = (x: Evaluation, y: Evaluation) =>
        [...evaluations.values()].some((e) => e.swaps.length === 2 && [x, y].every((v) => e.swaps.some((s) => s.id === v.swaps[0].id)));
      if (input.maxSwaps >= 2 && b1 && b2 && !comboTried(b1, b2))
        throw new Error(
          `Before submitting, evaluate the combination of your two best single swaps on different slots: ${b1.versionId} (${b1.swaps[0].slot}) + ${b2.versionId} (${b2.swaps[0].slot}).`,
        );
      const notBetter = list.filter((p) => !improves(evaluations.get(p.version_id)!));
      if (notBetter.length && [...evaluations.values()].some(improves))
        throw new Error(
          `${notBetter.map((p) => p.version_id).join(", ")} do not beat the base target_overlap while keeping core_retention >= ${MIN_CORE_RETENTION}. Propose only versions that do.`,
        );
      const swapKey = (id: string) => evaluations.get(id)!.swaps.map((s) => s.id).sort().join("+");
      const dupes = list.filter((p, i) => list.findIndex((o) => swapKey(o.version_id) === swapKey(p.version_id)) !== i);
      if (dupes.length)
        throw new Error(`${dupes.map((p) => p.version_id).join(", ")} bring in the same entities as another proposal. Submit distinct options.`);
      const weak = list.filter((p) => evaluations.get(p.version_id)!.metrics.coreRetention < MIN_CORE_RETENTION);
      if (weak.length)
        throw new Error(
          `${weak.map((p) => p.version_id).join(", ")} fall below core_retention ${MIN_CORE_RETENTION}. Propose only versions that keep the core; evaluate other combinations if needed.`,
        );
      submitted = list.map((p) => ({ versionId: p.version_id, title: p.title, rationale: p.rationale, evaluation: evaluations.get(p.version_id)! }));
      return { summary: `${submitted.length} proposals submitted`, output: { ok: true } };
    },
  };

  let previousResponseId: string | undefined;
  let nextInput: ResponseInputItem[] = [
    { role: "user", content: `Base package:\n${input.base.entities.map((e) => `- ${e.slot} (${e.type}): ${e.name}`).join("\n")}\n\nStart.` },
  ];

  let nudges = 0;
  for (let turn = 0; turn < MAX_TURNS && !submitted; turn++) {
    const res = await client.responses.create({
      model,
      instructions: instructions(input),
      input: nextInput,
      tools: TOOLS,
      previous_response_id: previousResponseId,
    });
    previousResponseId = res.id;
    if (res.output_text?.trim()) emit({ type: "note", text: res.output_text.trim() });

    const calls = res.output.filter((o) => o.type === "function_call");
    if (calls.length === 0) {
      // The model sometimes stops with a text answer instead of submitting (1 of 3 runs on 2026-10-07). Nudge it.
      if (nudges++ >= 2) break;
      emit({ type: "note", text: "Reminder sent: the agent must finish by calling submit_proposals." });
      nextInput = [{ role: "user", content: "You have not submitted yet. Use the evaluations so far (or run more) and finish by calling submit_proposals." }];
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
        emit({ type: "tool_call", step: n, tool: call.name, reason: String(why ?? ""), args: rest });
        try {
          const tool = tools[call.name];
          if (!tool) throw new Error(`Unknown tool ${call.name}`);
          const r = await tool(rest);
          emit({ type: "tool_result", step: n, tool: call.name, summary: r.summary, evaluation: r.evaluation });
          return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(r.output) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emit({ type: "tool_result", step: n, tool: call.name, summary: message, error: true });
          return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: message }) };
        }
      }),
    );
  }

  if (submitted) emit({ type: "proposals", proposals: submitted });
  else emit({ type: "error", message: "The agent stopped without submitting proposals." });
  emit({ type: "done", ms: Date.now() - t0, toolCalls: step });
}

// ---------------------------------------------------------------- helpers

const pct = (x: number) => `${Math.round(x * 100)}%`;

function round(m: PackageMetrics) {
  return {
    target_overlap: +m.targetOverlap.toFixed(3),
    core_retention: +m.coreRetention.toFixed(3),
    per_domain: m.perDomain.map((d) => ({ domain: d.domain, target_overlap: +d.targetOverlap.toFixed(3), core_retention: +d.coreRetention.toFixed(3) })),
  };
}

function topTags(names: string[], n = 6) {
  const counts = new Map<string, number>();
  for (const t of names) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}
