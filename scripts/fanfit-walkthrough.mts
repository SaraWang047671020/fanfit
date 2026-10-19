// Walk through the FanFit pipeline in the terminal and print what each step found.
// Uses the same code as the web app (src/lib/fanfit.ts), so results match the /fanfit page.
//   npm run fanfit -- "Austin FC" "Austin, TX"
//   npm run fanfit -- "Savannah Bananas" "Savannah, GA" --no-activation
import type { FanfitEvent, Timing } from "../src/lib/fanfit";
import { runFanfit } from "../src/lib/fanfit";
import { buildActivation } from "../src/lib/fanfit-activation";
import { AGES, AGE_LABEL, type Age, type BrandHit, type FitRow, type Kind, SPONSOR_CATEGORIES, scoreBrands, weightsFromAffinity } from "../src/lib/fanfit-score";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TEAM = args[0] ?? "Austin FC";
const CITY = args[1] ?? "Austin, TX";
const WITH_ACTIVATION = !process.argv.includes("--no-activation");

const KIND_LABEL: Record<Kind, string> = { brand: "品牌", place: "在地商家" };
const pad = (s: string | number, n: number) => {
  const str = String(s);
  // CJK characters take two columns in the terminal.
  const width = [...str].reduce((w, c) => w + (/[　-鿿＀-￯]/.test(c) ? 2 : 1), 0);
  return str + " ".repeat(Math.max(0, n - width));
};
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const line = (title: string) => console.log(`\n${"═".repeat(8)} ${title} ${"═".repeat(Math.max(4, 70 - title.length * 2))}`);

const buckets: Record<Kind, Partial<Record<Age, BrandHit[]>>> = { brand: {}, place: {} };
const timings = new Map<string, Timing>();
let teamInfo: { id: string; name: string; city: string } | null = null;
let ageAffinity: Partial<Record<Age, number>> = {};
const printed = new Set<string>();
const categories: Extract<FanfitEvent, { type: "category" }>[] = [];

function onEvent(e: FanfitEvent) {
  switch (e.type) {
    case "step":
      if (e.status !== "running" && !printed.has(e.id)) {
        printed.add(e.id);
        console.log(`\n▶ ${e.label}\n  ${e.status === "warn" ? "⚠" : "→"} ${e.detail ?? ""}`);
        if (e.id === "category") {
          line("步驟 3c：各贊助品類最契合的品牌（球隊 + 城市，不分年齡）");
          for (const c of SPONSOR_CATEGORIES) {
            const r = categories.find((x) => x.key === c.key);
            if (r) console.log(`  ${pad(c.label, 24)}${r.location === CITY ? "" : "[全美] "}${r.items.map((i) => i.name).join(" · ") || "（Qloo 沒有資料）"}`);
          }
        }
      }
      break;
    case "team":
      teamInfo = { id: e.team.id, name: e.team.name, city: e.team.city };
      line(`步驟 1：在 Qloo 找到球隊`);
      console.log(`  ${e.team.name}  (Qloo ID ${e.team.id}，${e.team.tags} 個標籤)`);
      break;
    case "composition": {
      ageAffinity = e.age;
      line("步驟 2：球迷組成（Qloo urn:demographics）");
      const w = weightsFromAffinity(e.age);
      console.log(`  ${pad("年齡", 8)}${pad("Qloo 相對值", 14)}權重`);
      for (const a of AGES) {
        const v = e.age[a] ?? 0;
        console.log(`  ${pad(AGE_LABEL[a], 8)}${pad((v >= 0 ? "+" : "") + v.toFixed(2), 14)}${pad((w[a] * 100).toFixed(0) + "%", 5)} ${"█".repeat(Math.round(w[a] * 60))}`);
      }
      const lean = (e.gender.male ?? 0) - (e.gender.female ?? 0);
      console.log(`  性別傾向：${lean > 0 ? "偏男性" : lean < 0 ? "偏女性" : "持平"}（male ${e.gender.male ?? 0}, female ${e.gender.female ?? 0}）`);
      if (!e.estimated) console.log("  ⚠ Qloo 沒有這支球隊的組成資料，改用平均分配");
      break;
    }
    case "bucket":
      buckets[e.kind][e.age] = e.items;
      if (AGES.every((a) => buckets[e.kind][a]) && !printed.has(`bucket-${e.kind}`)) {
        printed.add(`bucket-${e.kind}`);
        line(`步驟 3${e.kind === "brand" ? "a" : "b"}：各年齡層的球迷最喜歡的${KIND_LABEL[e.kind]}（各取前 5）`);
        for (const a of AGES) {
          const list = buckets[e.kind][a]!.filter((h) => !h.pool);
          const top = [...list].sort((x, y) => y.affinity - x.affinity).slice(0, 5);
          console.log(`  ${pad(AGE_LABEL[a], 6)} (${pad(list.length + " 筆", 7)}) ${top.map((t) => `${t.name} ${t.affinity.toFixed(2)}`).join(" · ")}`);
        }
      }
      break;
    case "category":
      categories.push(e); // printed together once the step is done, so lines don't interleave with other steps
      break;
    case "sponsors":
      line(`步驟 4：球隊現有贊助商（網路搜尋，${e.sponsors.length} 家）`);
      for (const s of e.sponsors) console.log(`  ${pad(s.category, 24)} ${s.name}  (${cut(s.tier, 30)})`);
      line("步驟 5：逐一查時機與排他（完成一個印一個）");
      break;
    case "timing": {
      const t = e.timing;
      timings.set(t.brandId, t);
      const flag = t.existing.length
        ? `✗ 已是贊助商`
        : t.conflicts.length
          ? `✗ 衝突：${t.conflicts.map((s) => s.name).join(", ")}`
          : t.crowded.length
            ? `△ 同類群：${t.crowded.map((s) => s.name).join(", ")}`
            : "✓ 無衝突";
      console.log(`  [時機 ${t.timing}/3] ${pad(cut(t.name, 28), 30)} ${pad(t.categories.join("/"), 30)} ${flag}`);
      if (t.whyNow) console.log(`      為什麼是現在：${cut(t.whyNow, 140)}`);
      if (t.signals[0]) console.log(`      來源：${t.signals[0].url}`);
      break;
    }
    case "done":
      console.log(`\n（流程完成，共 ${(e.ms / 1000).toFixed(0)} 秒）`);
      break;
    case "error":
      console.error(`\n✗ 錯誤：${e.message}`);
      break;
  }
}

function ranking(kind: Kind) {
  const b = buckets[kind];
  if (!AGES.every((a) => b[a])) return { ranked: [], excluded: [] };
  const top = scoreBrands(b as Record<Age, BrandHit[]>, weightsFromAffinity(ageAffinity)).slice(0, kind === "brand" ? 15 : 12);
  const rows = top.map((row, i) => {
    const t = timings.get(row.id);
    return { row, fitRank: i + 1, t, key: i + 1 - 3 * (t?.timing ?? 0), excluded: !!t && (t.existing.length > 0 || t.conflicts.length > 0) };
  });
  const sort = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.key - b.key || a.fitRank - b.fitRank;
  return { ranked: rows.filter((r) => !r.excluded).sort(sort), excluded: rows.filter((r) => r.excluded) };
}

function printRanking(kind: Kind) {
  const { ranked, excluded } = ranking(kind);
  line(`結果：${KIND_LABEL[kind]}推薦排序（契合度排名，時機每 1 分往前 3 名）`);
  console.log(`  ${pad("最終", 5)}${pad("契合", 5)}${pad("名稱", 32)}${pad("類別", 24)}${pad("主要族群", 10)}${pad("分數", 7)}時機`);
  ranked.forEach((r, i) =>
    console.log(
      `  ${pad(i + 1, 5)}${pad(r.fitRank, 5)}${pad(cut(r.row.name, 30), 32)}${pad(cut(r.t?.categories.join("/") ?? r.row.category, 22), 24)}${pad(AGE_LABEL[r.row.driver], 10)}${pad(r.row.score.toFixed(0), 7)}${r.t ? r.t.timing + "/3" : "未查"}${r.row.noLocal ? "  （此城市無在地資料，只依球隊粉絲）" : ""}`,
    ),
  );
  if (excluded.length) {
    console.log("  擱置（已是贊助商或類別衝突）：");
    for (const r of excluded)
      console.log(`    - ${r.row.name}（契合度第 ${r.fitRank}）→ ${r.t!.existing.length ? "已是贊助商" : "衝突 " + r.t!.conflicts.map((s) => `${s.name}(${s.category})`).join(", ")}`);
  }
  return ranked;
}

console.log(`FanFit 流程走查：${TEAM}（${CITY}）`);
await runFanfit(TEAM, CITY, onEvent);
const brands = printRanking("brand");
printRanking("place");

if (WITH_ACTIVATION && teamInfo && brands[0]) {
  const pick: FitRow = brands[0].row;
  line(`步驟 6：活動提案（第 1 名品牌：${pick.name}）`);
  const a = await buildActivation({
    team: teamInfo,
    partner: { id: pick.id, name: pick.name, kind: "brand", category: pick.category },
    driver: pick.driver,
    whyNow: timings.get(pick.id)?.whyNow,
  });
  console.log(`  主題：${a.title}（目標族群 ${a.segment}）`);
  console.log(`  ${a.concept}`);
  if (a.performer) console.log(`  中場表演：${a.performer.name}  球隊契合 ${a.performer.fitTeam?.toFixed(2) ?? "n/a"} · 品牌契合 ${a.performer.fitPartner?.toFixed(2) ?? "n/a"}`);
  if (a.coPartner) console.log(`  合作店家：${a.coPartner.name}（${a.coPartner.detail}）  球隊契合 ${a.coPartner.fitTeam?.toFixed(2) ?? "n/a"} · 品牌契合 ${a.coPartner.fitPartner?.toFixed(2) ?? "n/a"}`);
  console.log(`  聯名商品：${a.merch}`);
  if (a.hook) console.log(`  時機：${a.hook}`);
  console.log(`  主題依據（Qloo 標籤）：球隊 ${a.theme.team.join("、")} ｜ 品牌 ${a.theme.partner.join("、")}`);
  console.log(`  其他候選：${[...a.alternatives.performers, ...a.alternatives.coPartners].join("、")}`);
}
