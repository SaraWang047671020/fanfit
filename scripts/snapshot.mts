// Regenerate the demo snapshot from live Qloo data:
//   npm run snapshot
import { writeFileSync } from "node:fs";
import { computeDemo } from "../src/lib/demo-analysis";

const t0 = Date.now();
const snapshot = await computeDemo();
const out = new URL("../src/data/demo-snapshot.json", import.meta.url);
writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Wrote ${out.pathname} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const c of snapshot.comparisons) console.log(`  ${c.domain}: ${Math.round(c.overlap * 100)}% kept`);
for (const b of snapshot.bridges) console.log(`  bridge ${b.domain}: ${b.bridges.slice(0, 4).map((x) => x.name).join(", ")}`);
