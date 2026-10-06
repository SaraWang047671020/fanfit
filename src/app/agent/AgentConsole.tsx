"use client";

import { useRef, useState } from "react";
import type { AgentEvent, Proposal } from "@/lib/agent";
import type { PackageMetrics } from "@/lib/tasteframe";

type Recorded = { recordedAt: string; events: { at: number; event: AgentEvent }[] };
type Step = {
  step: number;
  tool: string;
  reason: string;
  args: Record<string, unknown>;
  result?: { summary: string; error?: boolean };
};

const TOOL_LABEL: Record<string, string> = {
  inspect_package: "Inspect package",
  find_bridges: "Find bridges",
  search_entity: "Resolve entity",
  evaluate_swaps: "Evaluate swaps",
  submit_proposals: "Submit proposals",
};

const MIN_CORE = 0.5;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function AgentConsole({ recorded, defaultGoal }: { recorded: Recorded; defaultGoal: string }) {
  const [goal, setGoal] = useState(defaultGoal);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [mode, setMode] = useState<"replay" | "live" | null>(null);
  const [baseline, setBaseline] = useState<PackageMetrics | null>(null);
  const [model, setModel] = useState<string>("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ ms: number; toolCalls: number } | null>(null);
  const runId = useRef(0);

  function reset() {
    setSteps([]);
    setNotes([]);
    setProposals([]);
    setError(null);
    setStats(null);
    setBaseline(null);
  }

  function apply(e: AgentEvent) {
    switch (e.type) {
      case "start":
        setBaseline(e.baseline);
        setModel(e.model);
        break;
      case "tool_call":
        setSteps((s) => [...s, { step: e.step, tool: e.tool, reason: e.reason, args: e.args }]);
        break;
      case "tool_result":
        setSteps((s) => s.map((x) => (x.step === e.step ? { ...x, result: { summary: e.summary, error: e.error } } : x)));
        break;
      case "note":
        setNotes((n) => [...n, e.text]);
        break;
      case "proposals":
        setProposals(e.proposals);
        break;
      case "error":
        setError(e.message);
        break;
      case "done":
        setStats({ ms: e.ms, toolCalls: e.toolCalls });
        break;
    }
  }

  async function replay() {
    const id = ++runId.current;
    reset();
    setMode("replay");
    setStatus("running");
    let last = 0;
    for (const { at, event } of recorded.events) {
      // Compress real time ~4x, cap gaps so the replay stays watchable.
      await new Promise((r) => setTimeout(r, Math.min(1200, Math.max(120, (at - last) / 4))));
      last = at;
      if (runId.current !== id) return;
      apply(event);
    }
    setStatus("done");
  }

  async function live() {
    const id = ++runId.current;
    reset();
    setMode("live");
    setStatus("running");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done || runId.current !== id) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as AgentEvent);
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const running = status === "running";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-panel/90 p-6 sm:p-8">
        <label htmlFor="goal" className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
          Mission
        </label>
        <textarea
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-panel-2 px-4 py-3 text-base outline-none focus:border-accent"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={replay}
            disabled={running}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg disabled:opacity-50"
          >
            ▶ Replay recorded run
          </button>
          <button
            onClick={live}
            disabled={running}
            className="rounded-full border border-accent px-5 py-2 text-sm font-semibold text-accent disabled:opacity-50"
          >
            Run live (~1 min)
          </button>
          <span className="text-xs text-muted">
            {mode === "replay" && `Recorded ${recorded.recordedAt.slice(0, 10)} · replayed at 4× speed. `}
            Live runs use the mission above on the demo package.
          </span>
        </div>
      </section>

      {baseline && (
        <p className="text-sm text-muted">
          Model <span className="font-mono text-text">{model}</span> · baseline target overlap{" "}
          <span className="font-mono text-text">{pct(baseline.targetOverlap)}</span>
          {stats && (
            <>
              {" "}
              · {stats.toolCalls} tool calls in {(stats.ms / 1000).toFixed(0)} s
            </>
          )}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-3xl border border-line bg-panel/90 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Agent trace</p>
          {steps.length === 0 && !running && <p className="mt-3 text-sm text-muted">Start a run to watch the agent work.</p>}
          <ol className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.step} className="rounded-xl border border-line bg-panel-2 p-3 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted">#{s.step}</span>
                  <span className="font-semibold">{TOOL_LABEL[s.tool] ?? s.tool}</span>
                  <span className="truncate font-mono text-xs text-muted">{argSummary(s)}</span>
                </div>
                {s.reason && <p className="mt-1 italic text-muted">{s.reason}</p>}
                {s.result ? (
                  <p className={`mt-1 ${s.result.error ? "text-warn" : "text-gain"}`}>
                    {s.result.error ? "⚠ Guardrail: " : "→ "}
                    {s.result.summary}
                  </p>
                ) : (
                  <p className="mt-1 animate-pulse text-muted">querying Qloo…</p>
                )}
              </li>
            ))}
          </ol>
          {notes.map((n, i) => (
            <p key={i} className="mt-3 text-sm text-muted">
              {n}
            </p>
          ))}
          {running && steps.length > 0 && <p className="mt-3 animate-pulse text-sm text-muted">thinking…</p>}
        </section>

        <section className="rounded-3xl border border-line bg-panel/90 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Proposals</p>
          {error && <p className="mt-3 text-sm text-loss">{error}</p>}
          {proposals.length === 0 && !error && (
            <p className="mt-3 text-sm text-muted">The agent proposes; you decide. Proposals appear here when it finishes.</p>
          )}
          <div className="mt-4 space-y-4">
            {proposals.map((p) => (
              <ProposalCard key={p.versionId} p={p} baseline={baseline} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function argSummary(s: Step) {
  const a = s.args;
  if (s.tool === "find_bridges") return String(a.domain);
  if (s.tool === "search_entity") return `${a.name} (${a.type})`;
  if (s.tool === "evaluate_swaps") return (a.swaps as { slot: string }[] | undefined)?.map((x) => x.slot).join(" + ") ?? "";
  return "";
}

function ProposalCard({ p, baseline }: { p: Proposal; baseline: PackageMetrics | null }) {
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);
  const m = p.evaluation.metrics;
  return (
    <article
      className={`rounded-2xl border p-5 ${decision === "accepted" ? "border-gain" : decision === "rejected" ? "border-line opacity-50" : "border-line"} bg-panel-2`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">{p.title}</h3>
        <span className="font-mono text-xs text-muted">{p.versionId}</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
        {p.evaluation.swaps.map((s) => (
          <li key={s.slot} className="rounded-full border border-gain px-2 py-0.5 text-gain">
            {s.slot.replace(/_\d$/, "")} → {s.name}
          </li>
        ))}
      </ul>
      <Meter label="Target overlap" value={m.targetOverlap} marker={baseline?.targetOverlap} markerLabel="base" tone="bg-gain" />
      <Meter label="Core retained" value={m.coreRetention} marker={MIN_CORE} markerLabel="min" tone="bg-accent" />
      <p className="mt-3 text-sm text-muted">{p.rationale}</p>
      <div className="mt-4 flex gap-2 text-sm">
        <button onClick={() => setDecision("accepted")} className="rounded-full border border-gain px-3 py-1 text-gain">
          Accept
        </button>
        <button onClick={() => setDecision("rejected")} className="rounded-full border border-line px-3 py-1 text-muted">
          Reject
        </button>
      </div>
    </article>
  );
}

function Meter({
  label,
  value,
  marker,
  markerLabel,
  tone,
}: {
  label: string;
  value: number;
  marker?: number;
  markerLabel: string;
  tone: string;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono">{pct(value)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-bg">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
        {marker !== undefined && (
          <div
            className="absolute -top-1 h-4 w-0.5 bg-text"
            style={{ left: `${marker * 100}%` }}
            title={`${markerLabel} ${pct(marker)}`}
          />
        )}
      </div>
    </div>
  );
}
