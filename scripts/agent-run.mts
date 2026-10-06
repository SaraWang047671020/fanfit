// Run the agent on the demo project, print the trace, and record it for the replay UI:
//   npm run agent:record
import { writeFileSync } from "node:fs";
import { type AgentEvent, runAgent } from "../src/lib/agent";
import { DEMO_AGENT_INPUT } from "../src/lib/demo-agent";

const events: { at: number; event: AgentEvent }[] = [];
const t0 = Date.now();
await runAgent(DEMO_AGENT_INPUT, (event) => {
  events.push({ at: Date.now() - t0, event });
  const e = event;
  if (e.type === "tool_call") console.log(`#${e.step} ${e.tool} ${JSON.stringify(e.args)}\n    why: ${e.reason}`);
  else if (e.type === "tool_result") console.log(`  ${e.error ? "✗" : "→"} #${e.step} ${e.summary}`);
  else if (e.type === "proposals") for (const p of e.proposals) console.log(`\n★ ${p.versionId} ${p.title}\n  ${p.rationale}`);
  else if (e.type === "start") console.log(`model ${e.model} | baseline target ${(e.baseline.targetOverlap * 100).toFixed(1)}%`);
  else console.log(`[${e.type}]`, "text" in e ? e.text : "message" in e ? e.message : JSON.stringify(e));
});
const out = new URL("../src/data/demo-agent-run.json", import.meta.url);
writeFileSync(out, JSON.stringify({ recordedAt: new Date().toISOString(), events }, null, 2) + "\n");
console.log(`\nRecorded ${events.length} events to ${out.pathname}`);
