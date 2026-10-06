// Computes every analysis shown on the demo page. Used by scripts/snapshot.mts so the
// public page is served from a precomputed snapshot and never depends on live Qloo latency.

import { DEMO_SWAP, PACKAGE_A, TARGET_AUDIENCE } from "./demo";
import { DOMAINS } from "./qloo";
import { compareDomain, packageDrivers, swap, tasteBridge } from "./tasteframe";

export const PACKAGE_B = swap(PACKAGE_A, "cast", DEMO_SWAP, "Package B — Jenna Ortega");

export async function computeDemo() {
  const seeds = TARGET_AUDIENCE.seeds.map((s) => s.id);
  const [comparisons, bridges, drivers] = await Promise.all([
    Promise.all(DOMAINS.map((d) => compareDomain(PACKAGE_A, PACKAGE_B, d))),
    Promise.all((["brand", "movie"] as const).map((d) => tasteBridge(PACKAGE_A, seeds, d))),
    packageDrivers(PACKAGE_A, "movie"),
  ]);
  return { generatedAt: new Date().toISOString(), comparisons, bridges, drivers };
}

export type DemoSnapshot = Awaited<ReturnType<typeof computeDemo>>;
