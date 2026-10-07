// Computes every analysis shown on the demo page. Used by scripts/snapshot.mts so the
// public page is served from a precomputed snapshot and never depends on live Qloo latency.

import OpenAI from "openai";
import { DEMO_PROJECT, DEMO_SWAP, PACKAGE_A, TARGET_AUDIENCE } from "./demo";
import { DOMAINS } from "./qloo";
import { applySwaps, compareDomain, elementInfluence, evaluatePackage, resolveEntity, swap, tasteBridge } from "./tasteframe";

export const PACKAGE_B = swap(PACKAGE_A, "cast", DEMO_SWAP, "Package B — Jenna Ortega");

const seeds = TARGET_AUDIENCE.seeds.map((s) => s.id);

/** Ask the LLM alone for casting ideas, then score each with Qloo — the "without Qloo" baseline. */
async function llmOnlyCasting() {
  const res = await new OpenAI().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    input: `A film team is making "${DEMO_PROJECT.title}": ${DEMO_PROJECT.logline}
Current lead: Florence Pugh. Goal: ${DEMO_PROJECT.goal}
Suggest 5 real actors to replace the lead. Reply with JSON only: {"actors": ["name", ...]}`,
  });
  const names: string[] = JSON.parse(res.output_text.replace(/```json|```/g, "").trim()).actors;
  const scored = await Promise.all(
    names.map(async (name) => {
      const hit = await resolveEntity(name, "person");
      if (!hit) return { name, resolved: false as const };
      const m = await evaluatePackage(applySwaps(PACKAGE_A, [{ ...hit, slot: "cast" }], hit.id), PACKAGE_A, seeds);
      return { name: hit.name, resolved: true as const, targetOverlap: m.targetOverlap, coreRetention: m.coreRetention };
    }),
  );
  return scored;
}

export async function computeDemo() {
  const [comparisons, bridges, influence, baseline, llmOnly] = await Promise.all([
    Promise.all(DOMAINS.map((d) => compareDomain(PACKAGE_A, PACKAGE_B, d))),
    Promise.all((["brand", "movie"] as const).map((d) => tasteBridge(PACKAGE_A, seeds, d))),
    elementInfluence(PACKAGE_A),
    evaluatePackage(PACKAGE_A, PACKAGE_A, seeds),
    llmOnlyCasting(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    comparisons,
    bridges,
    influence,
    baseline: { targetOverlap: baseline.targetOverlap },
    llmOnly,
  };
}

export type DemoSnapshot = Awaited<ReturnType<typeof computeDemo>>;
