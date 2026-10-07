// Research experiments for the 10/13 alignment meeting (2026-10-07).
//   npx tsx --env-file=.env.local scripts/research.mts
// Output contains Qloo response data, so it is written to ../spike/out (gitignored).
import { writeFileSync } from "node:fs";
import OpenAI from "openai";
import { DEMO_PROJECT, PACKAGE_A, TARGET_AUDIENCE } from "../src/lib/demo";
import { DOMAINS, insightsDeep } from "../src/lib/qloo";
import { type CreativePackage, type PackageEntity, applySwaps, evaluatePackage, resolveEntity } from "../src/lib/tasteframe";

const seeds = TARGET_AUDIENCE.seeds.map((s) => s.id);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const out: Record<string, unknown> = { ranAt: new Date().toISOString() };

async function score(label: string, pkg: CreativePackage) {
  const m = await evaluatePackage(pkg, PACKAGE_A, seeds);
  console.log(`  ${label.padEnd(34)} target ${pct(m.targetOverlap).padStart(6)}  core ${pct(m.coreRetention).padStart(6)}`);
  return { label, target: m.targetOverlap, core: m.coreRetention };
}

async function resolveMany(names: string[], type: "person" | "movie" | "brand" | "artist") {
  const r = await Promise.all(names.map((n) => resolveEntity(n, type)));
  return r.filter((x): x is NonNullable<typeof x> => !!x);
}

// ---------------------------------------------------------------- R1: LLM-only casting vs Qloo
console.log("\n# R1 LLM-only casting suggestions, scored with Qloo");
const client = new OpenAI();
const res = await client.responses.create({
  model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  input: `A film team is making "${DEMO_PROJECT.title}": ${DEMO_PROJECT.logline}
Current lead: Florence Pugh. Goal: ${DEMO_PROJECT.goal}
Suggest 5 real actors to replace the lead. Reply with JSON only: {"actors": ["name", ...]}`,
});
const llmActors: string[] = JSON.parse(res.output_text.replace(/```json|```/g, "").trim()).actors;
console.log(`  LLM suggested: ${llmActors.join(", ")}`);
const base = await score("Base (Florence Pugh)", PACKAGE_A);
const r1 = [];
for (const a of await resolveMany(llmActors, "person"))
  r1.push(await score(`LLM pick: ${a.name}`, applySwaps(PACKAGE_A, [{ ...a, slot: "cast" }], a.id)));
const [mid90s] = await resolveMany(["Mid90s"], "movie");
const [schafer] = await resolveMany(["Hunter Schafer"], "person");
const agentBest = await score(
  "Agent: Mid90s + Hunter Schafer",
  applySwaps(PACKAGE_A, [{ ...mid90s, slot: "film_ref_2" }, { ...schafer, slot: "cast" }], "agent"),
);
out.r1 = { llmActors, base, llmPicks: r1, agentBest };

// ---------------------------------------------------------------- R2: age signal on the audience
console.log("\n# R2 Does adding age (24_and_younger) change the target audience?");
const r2 = [];
for (const d of DOMAINS) {
  const [plain, young] = await Promise.all([
    insightsDeep({ entities: seeds, domain: d }),
    insightsDeep({ entities: seeds, domain: d, age: "24_and_younger" }),
  ]);
  const ids = new Set(plain.map((e) => e.entity_id));
  const shared = young.filter((e) => ids.has(e.entity_id)).length / Math.max(young.length, 1);
  const entering = young.filter((e) => !ids.has(e.entity_id)).slice(0, 5).map((e) => e.name);
  console.log(`  ${d.padEnd(7)} overlap with/without age ${pct(shared)} | new with age: ${entering.join(", ")}`);
  r2.push({ domain: d, overlap: shared, entering });
}
out.r2 = r2;

// ---------------------------------------------------------------- R3: native /v2/analysis/compare
console.log("\n# R3 /v2/analysis/compare — what do Package A and the target audience share?");
const key = process.env.QLOO_API_KEY!;
const qs = new URLSearchParams({
  "a.signal.interests.entities": PACKAGE_A.entities.map((e) => e.id).join(","),
  "b.signal.interests.entities": seeds.join(","),
  take: "15",
});
const cmp = (await (await fetch(`https://hackathon.api.qloo.com/v2/analysis/compare?${qs}`, { headers: { "X-Api-Key": key } })).json()) as {
  results?: { tags?: { name: string; subtype?: string; query?: { score?: number } }[] };
};
const tags = (cmp.results?.tags ?? []).map((t) => ({ name: t.name, subtype: t.subtype?.split(":").pop(), score: t.query?.score }));
console.log(`  shared tags: ${tags.map((t) => `${t.name} (${t.subtype}, ${t.score?.toFixed(2)})`).join(", ")}`);
out.r3 = tags;

// ---------------------------------------------------------------- R4: virtual characters as cast candidates
console.log("\n# R4 Virtual characters (seed sets) swapped into the cast slot");
const characters: Record<string, [string, "movie" | "brand" | "artist"][]> = {
  "Vale (guards the core)": [["Suspiria", "movie"], ["FKA twigs", "artist"], ["Balenciaga", "brand"]],
  "Juno (chases the audience)": [["Mid90s", "movie"], ["Off-White", "brand"], ["Tyler, the Creator", "artist"]],
  "Mira (built from bridges)": [["Eighth Grade", "movie"], ["Comme des Garcons", "brand"], ["FKA twigs", "artist"]],
};
const r4 = [];
for (const [name, list] of Object.entries(characters)) {
  const ents = (await Promise.all(list.map(([n, t]) => resolveEntity(n, t)))).filter((x): x is NonNullable<typeof x> => !!x);
  const pkg: CreativePackage = {
    id: name,
    label: name,
    entities: [...PACKAGE_A.entities.filter((e) => e.slot !== "cast"), ...ents.map((e, i): PackageEntity => ({ ...e, slot: `cast_seed_${i}` }))],
  };
  r4.push({ ...(await score(name, pkg)), seeds: ents.map((e) => e.name) });
}
out.r4 = r4;


const file = new URL("../../spike/out/research-20261007.json", import.meta.url);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nSaved ${file.pathname}`);
