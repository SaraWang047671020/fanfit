import { type AgentEvent, type AgentInput, runAgent } from "@/lib/agent";
import { DEMO_AGENT_INPUT } from "@/lib/demo-agent";

// Agent runs take ~40–60 s (Qloo calls are 2–5 s each).
export const maxDuration = 300;

const MAX_CONCURRENT_RUNS = 2;
let running = 0;

// POST /api/agent { goal?: string, maxSwaps?: number }
// Streams the agent trace as NDJSON (one AgentEvent per line).
// For now live runs always use the demo package; custom packages come with the Package Builder.
export async function POST(req: Request) {
  if (process.env.AGENT_LIVE_DISABLED === "true")
    return Response.json({ error: "Live agent runs are disabled on this deployment; use the recorded run." }, { status: 503 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  if (running >= MAX_CONCURRENT_RUNS) return Response.json({ error: "The agent is busy, try again in a minute." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { goal?: unknown; maxSwaps?: unknown };
  const input: AgentInput = {
    ...DEMO_AGENT_INPUT,
    goal: typeof body.goal === "string" && body.goal.trim() ? body.goal.trim().slice(0, 500) : DEMO_AGENT_INPUT.goal,
    maxSwaps: body.maxSwaps === 1 || body.maxSwaps === 2 || body.maxSwaps === 3 ? body.maxSwaps : DEMO_AGENT_INPUT.maxSwaps,
  };

  running++;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(input, send);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        running--;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
