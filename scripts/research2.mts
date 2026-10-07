// Research round 2 (2026-10-07): element influence, age-aware metrics.
//   npx tsx --env-file=.env.local scripts/research2.mts
import { writeFileSync } from "node:fs";
import { PACKAGE_A, TARGET_AUDIENCE } from "../src/lib/demo";
import { type CreativePackage, type PackageEntity, applySwaps, elementInfluence, evaluatePackage, resolveEntity } from "../src/lib/tasteframe";

const seeds = TARGET_AUDIENCE.seeds.map((s) => s.id);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
const out: Record<string, unknown> = { ranAt: new Date().toISOString() };

console.log("\n# R5 Element influence (leave-one-out) vs Qloo explainability (~20% each)");
const inf = await elementInfluence(PACKAGE_A);
for (const e of inf)
  console.log(`  ${e.name.padEnd(16)} ${pct(e.influence)}  | ${e.perDomain.map((d) => `${d.domain} ${pct(d.influence)}`).join("  ")}`);
out.r5 = inf.map((e) => ({ name: e.name, slot: e.slot, influence: e.influence, perDomain: e.perDomain }));

console.log("\n# R6 Metrics with vs without age 24_and_younger on the audience");
const r = async (n: string, t: "movie" | "person" | "brand" | "artist") => (await resolveEntity(n, t))!;
const [mid90s, schafer, ortega, offwhite, eighth, cdg, fka, tyler] = await Promise.all([
  r("Mid90s", "movie"), r("Hunter Schafer", "person"), r("Jenna Ortega", "person"), r("Off-White", "brand"),
  r("Eighth Grade", "movie"), r("Comme des Garcons", "brand"), r("FKA twigs", "artist"), r("Tyler, the Creator", "artist"),
]);
const charPkg = (name: string, ents: { id: string; name: string; type: PackageEntity["type"] }[]): CreativePackage => ({
  id: name, label: name,
  entities: [...PACKAGE_A.entities.filter((e) => e.slot !== "cast"), ...ents.map((e, i) => ({ ...e, slot: `cast_seed_${i}` }))],
});
const versions: [string, CreativePackage][] = [
  ["Base", PACKAGE_A],
  ["Cast → Jenna Ortega", applySwaps(PACKAGE_A, [{ ...ortega, slot: "cast" }], "o")],
  ["Ref → Mid90s", applySwaps(PACKAGE_A, [{ ...mid90s, slot: "film_ref_2" }], "m")],
  ["Cast → Hunter Schafer", applySwaps(PACKAGE_A, [{ ...schafer, slot: "cast" }], "h")],
  ["Mid90s + Hunter Schafer", applySwaps(PACKAGE_A, [{ ...mid90s, slot: "film_ref_2" }, { ...schafer, slot: "cast" }], "mh")],
  ["Brand → Off-White", applySwaps(PACKAGE_A, [{ ...offwhite, slot: "brand" }], "ow")],
  ["Mira (bridges)", charPkg("mira", [eighth, cdg, fka])],
  ["Juno (audience)", charPkg("juno", [mid90s, offwhite, tyler])],
];
const r6 = [];
console.log(`  ${"version".padEnd(26)} target(no age) target(age<25)   core`);
for (const [label, pkg] of versions) {
  const [plain, young] = await Promise.all([evaluatePackage(pkg, PACKAGE_A, seeds), evaluatePackage(pkg, PACKAGE_A, seeds, "24_and_younger")]);
  console.log(`  ${label.padEnd(26)} ${pct(plain.targetOverlap)}         ${pct(young.targetOverlap)}      ${pct(plain.coreRetention)}`);
  r6.push({ label, targetNoAge: plain.targetOverlap, targetAge: young.targetOverlap, core: plain.coreRetention });
}
out.r6 = r6;

const file = new URL("../../spike/out/research2-20261007.json", import.meta.url);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nSaved ${file.pathname}`);
