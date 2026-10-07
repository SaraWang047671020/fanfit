// TasteFrame core analyses. Every number here is computed from Qloo responses;
// the LLM layer only plans and explains, it never produces scores.
// Algorithms follow docs/tasteframe_product_plan_v3.html §6 (validated by spike/ on 2026-10-06).

import { DOMAINS, type Domain, type EntityType, type QlooEntity, insights, insightsDeep, search } from "./qloo";

export interface PackageEntity {
  id: string;
  name: string;
  type: EntityType;
  slot: string; // e.g. "film_ref", "cast", "music", "brand", "virtual_character"
}

export interface CreativePackage {
  id: string;
  label: string;
  entities: PackageEntity[];
}

export interface RankedEntity {
  id: string;
  name: string;
  rank: number; // 1-based
  affinity?: number;
  image?: string;
}

const ids = (pkg: CreativePackage) => pkg.entities.map((e) => e.id);

function toRanked(ents: QlooEntity[]): RankedEntity[] {
  return ents.map((e, i) => ({
    id: e.entity_id,
    name: e.name,
    rank: i + 1,
    affinity: e.affinity,
    image: e.image,
  }));
}

// ---------------------------------------------------------------- resolve

export async function resolveEntity(name: string, type: EntityType) {
  const [top] = await search(name, type, 3);
  if (!top) return null;
  return { id: top.entity_id, name: top.name, type, exact: top.name.toLowerCase() === name.toLowerCase() };
}

// ---------------------------------------------------------------- tags → Shift Map labels

// Tags are pre-filtered to genre / subgenre / style / theme in qloo.ts.
function tagCounts(ents: QlooEntity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of ents)
    for (const t of e.tags ?? []) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  return counts;
}

export interface TagShift {
  tag: string;
  before: number;
  after: number;
  delta: number;
}

function tagShift(a: QlooEntity[], b: QlooEntity[], limit = 8) {
  const ca = tagCounts(a);
  const cb = tagCounts(b);
  const all = new Set([...ca.keys(), ...cb.keys()]);
  const shifts: TagShift[] = [...all].map((tag) => {
    const before = ca.get(tag) ?? 0;
    const after = cb.get(tag) ?? 0;
    return { tag, before, after, delta: after - before };
  });
  return {
    rising: shifts.filter((s) => s.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, limit),
    falling: shifts.filter((s) => s.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, limit),
  };
}

// ---------------------------------------------------------------- context & compare

export async function packageContext(pkg: CreativePackage, domain: Domain, take = 50) {
  return insights({ entities: ids(pkg), domain, take });
}

export interface DomainComparison {
  domain: Domain;
  overlap: number; // share of A's results still present in B (0–1)
  a: RankedEntity[];
  b: RankedEntity[];
  gained: RankedEntity[];
  lost: RankedEntity[];
  tags: { rising: TagShift[]; falling: TagShift[] };
}

export async function compareDomain(a: CreativePackage, b: CreativePackage, domain: Domain): Promise<DomainComparison> {
  const [ea, eb] = await Promise.all([packageContext(a, domain), packageContext(b, domain)]);
  const ra = toRanked(ea);
  const rb = toRanked(eb);
  const inA = new Set(ra.map((e) => e.id));
  const inB = new Set(rb.map((e) => e.id));
  return {
    domain,
    overlap: ra.length ? ra.filter((e) => inB.has(e.id)).length / ra.length : 0,
    a: ra,
    b: rb,
    gained: rb.filter((e) => !inA.has(e.id)),
    lost: ra.filter((e) => !inB.has(e.id)),
    tags: tagShift(ea, eb),
  };
}

// ---------------------------------------------------------------- Taste Bridge (v2: combined signal)

export interface BridgeCandidate extends RankedEntity {
  rankInPackage: number; // provenance: rank when signalled by the package alone
  rankInAudience: number; // provenance: rank when signalled by the audience seeds alone
}

export async function tasteBridge(pkg: CreativePackage, audienceSeeds: string[], domain: Domain, audienceAge?: string) {
  const [p, t, c] = await Promise.all([
    insightsDeep({ entities: ids(pkg), domain }),
    insightsDeep({ entities: audienceSeeds, domain, age: audienceAge }),
    insights({ entities: [...ids(pkg), ...audienceSeeds], domain, take: 50 }),
  ]);
  const rankP = new Map(p.map((e, i) => [e.entity_id, i + 1]));
  const rankT = new Map(t.map((e, i) => [e.entity_id, i + 1]));
  const pkgIds = new Set(ids(pkg));

  const bridges: BridgeCandidate[] = toRanked(c)
    .filter((e) => rankP.has(e.id) && rankT.has(e.id) && !pkgIds.has(e.id))
    .map((e) => ({ ...e, rankInPackage: rankP.get(e.id)!, rankInAudience: rankT.get(e.id)! }));

  return { domain, bridges, insufficientSignal: bridges.length === 0 };
}

// ---------------------------------------------------------------- drivers (explainability)

/** Which package element pulls this domain's results the most? Sums Qloo's per-signal contributions. */
export async function packageDrivers(pkg: CreativePackage, domain: Domain, take = 20) {
  const ents = await insights({ entities: ids(pkg), domain, take, explain: true });
  const totals = new Map<string, number>();
  for (const e of ents)
    for (const s of e.explainability ?? [])
      totals.set(s.entity_id, (totals.get(s.entity_id) ?? 0) + s.score);
  const sum = [...totals.values()].reduce((x, y) => x + y, 0) || 1;
  return pkg.entities
    .map((e) => ({ ...e, share: (totals.get(e.id) ?? 0) / sum }))
    .sort((x, y) => y.share - x.share);
}

// ---------------------------------------------------------------- element influence (leave-one-out)

export interface ElementInfluence extends PackageEntity {
  /** Mean share of the package's top-50 neighbours that disappear when this element is removed (0–1). */
  influence: number;
  perDomain: { domain: Domain; influence: number }[];
}

/**
 * Which element shapes the package's neighbourhood most? Qloo's explainability scores came back nearly flat
 * (~20% each for 5 inputs), so we measure it directly: drop one element at a time and see how much the
 * top-50 results change. 3 calls per element, all cacheable.
 */
export async function elementInfluence(pkg: CreativePackage): Promise<ElementInfluence[]> {
  const full = new Map(
    await Promise.all(DOMAINS.map(async (d) => [d, new Set((await packageContext(pkg, d)).map((e) => e.entity_id))] as const)),
  );
  const rows = await Promise.all(
    pkg.entities.map(async (el) => {
      const without: CreativePackage = { ...pkg, id: `${pkg.id}-${el.id}`, entities: pkg.entities.filter((e) => e.id !== el.id) };
      const perDomain = await Promise.all(
        DOMAINS.map(async (domain) => {
          const res = await packageContext(without, domain);
          const kept = res.filter((e) => full.get(domain)!.has(e.entity_id)).length;
          return { domain, influence: 1 - kept / (full.get(domain)!.size || 1) };
        }),
      );
      return { ...el, perDomain, influence: perDomain.reduce((s, d) => s + d.influence, 0) / perDomain.length };
    }),
  );
  return rows.sort((a, b) => b.influence - a.influence);
}

// ---------------------------------------------------------------- package helpers

export function swap(pkg: CreativePackage, slot: string, replacement: PackageEntity, label?: string): CreativePackage {
  return {
    id: `${pkg.id}~${replacement.id.slice(0, 8)}`,
    label: label ?? `${pkg.label} (${replacement.name})`,
    entities: [...pkg.entities.filter((e) => e.slot !== slot), replacement],
  };
}

// ---------------------------------------------------------------- agent metrics (deterministic)

export interface PackageMetrics {
  /** Share of the package's top-50 neighbours that also rank in the audience's top 100 (mean over domains). */
  targetOverlap: number;
  /** Share of the package's top-50 neighbours that were already in the base package's top 50 (mean over domains). */
  coreRetention: number;
  perDomain: { domain: Domain; targetOverlap: number; coreRetention: number }[];
}

export async function evaluatePackage(
  pkg: CreativePackage,
  base: CreativePackage,
  audienceSeeds: string[],
  audienceAge?: string,
): Promise<PackageMetrics> {
  const perDomain = await Promise.all(
    DOMAINS.map(async (domain) => {
      const [p, b, t] = await Promise.all([
        packageContext(pkg, domain),
        packageContext(base, domain),
        insightsDeep({ entities: audienceSeeds, domain, age: audienceAge }),
      ]);
      const inBase = new Set(b.map((e) => e.entity_id));
      const inTarget = new Set(t.map((e) => e.entity_id));
      const n = p.length || 1;
      return {
        domain,
        targetOverlap: p.filter((e) => inTarget.has(e.entity_id)).length / n,
        coreRetention: p.filter((e) => inBase.has(e.entity_id)).length / n,
      };
    }),
  );
  const mean = (k: "targetOverlap" | "coreRetention") => perDomain.reduce((s, d) => s + d[k], 0) / perDomain.length;
  return { targetOverlap: mean("targetOverlap"), coreRetention: mean("coreRetention"), perDomain };
}

export function applySwaps(base: CreativePackage, swaps: PackageEntity[], id: string): CreativePackage {
  const slots = new Set(swaps.map((s) => s.slot));
  return {
    id,
    label: swaps.map((s) => s.name).join(" + "),
    entities: [...base.entities.filter((e) => !slots.has(e.slot)), ...swaps],
  };
}
