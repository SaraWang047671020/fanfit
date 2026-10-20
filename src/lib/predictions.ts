// What FanFit predicted for each local business, read back from the team's saved Find sponsors run, so the offers
// dashboard can put it next to who actually claimed. Closes the loop: recommendation -> deal -> claims -> check.
import { AGES, type Age, type BrandHit, type Weights, scoreBrands, weightsFromAffinity } from "./fanfit-score";
import { loadSavedRun } from "./saved-runs";

export interface PlacePrediction {
  driver: Age; // the age group whose fans love it most, relative to the other candidates
  score: number;
}

export async function placePredictions(team: string, city: string) {
  const run = await loadSavedRun(team, city);
  if (!run) return null;
  const buckets: Partial<Record<Age, BrandHit[]>> = {};
  let mix: Weights = Object.fromEntries(AGES.map((a) => [a, 1 / AGES.length])) as Weights;
  for (const e of run.events) {
    if (e.type === "bucket" && e.kind === "place") buckets[e.age] = e.items;
    else if (e.type === "composition" && e.estimated) mix = weightsFromAffinity(e.age);
  }
  if (!AGES.every((a) => buckets[a])) return null;
  const byPlace = new Map<string, PlacePrediction>(
    scoreBrands(buckets as Record<Age, BrandHit[]>, mix).map((r) => [r.id, { driver: r.driver, score: r.score }]),
  );
  return { savedAt: run.created_at, mix, byPlace };
}
