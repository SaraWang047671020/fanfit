// Run the demo agent N times (no recording) and summarise how stable the proposals are.
//   npx tsx --env-file=.env.local scripts/agent-stability.mts 3
import { writeFileSync } from "node:fs";
import { type AgentEvent, type Proposal, runAgent } from "../src/lib/agent";
import { DEMO_AGENT_INPUT } from "../src/lib/demo-agent";

const runs = Number(process.argv[2] ?? 3);
const summary = [];
for (let i = 1; i <= runs; i++) {
  let proposals: Proposal[] = [];
  let done: Extract<AgentEvent, { type: "done" }> | undefined;
  let guardrailHits = 0;
  let evaluations = 0;
  await runAgent(DEMO_AGENT_INPUT, (e) => {
    if (e.type === "proposals") proposals = e.proposals;
    if (e.type === "done") done = e;
    if (e.type === "tool_result" && e.error) guardrailHits++;
    if (e.type === "tool_result" && e.evaluation) evaluations++;
  });
  const best = [...proposals].sort((a, b) => b.evaluation.metrics.targetOverlap - a.evaluation.metrics.targetOverlap)[0];
  const row = {
    run: i,
    seconds: Math.round((done?.ms ?? 0) / 1000),
    toolCalls: done?.toolCalls,
    evaluations,
    guardrailHits,
    best: best && { swaps: best.evaluation.swaps.map((s) => `${s.slot}→${s.name}`), target: best.evaluation.metrics.targetOverlap, core: best.evaluation.metrics.coreRetention },
    proposals: proposals.map((p) => p.evaluation.swaps.map((s) => s.name).join(" + ")),
  };
  summary.push(row);
  console.log(JSON.stringify(row));
}
writeFileSync(new URL("../../spike/out/agent-stability-20261007.json", import.meta.url), JSON.stringify(summary, null, 2));
