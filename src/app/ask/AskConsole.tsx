"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import OfferButton from "../fanfit/OfferButton";
import type { Answer, AskEvent } from "@/lib/ask-agent";

type Step = { step: number; tool: string; reason: string; args: Record<string, unknown>; summary?: string; error?: boolean };

const TOOL_LABEL: Record<string, string> = {
  rank_teams: "Rank teams (Qloo)",
  team_audience: "Fans vs customers (Qloo demographics)",
  shared_taste: "What both audiences love (Qloo)",
  team_news: "Recent news (web search)",
  saved_analysis: "Saved Find sponsors analysis",
  fan_profile: "Fan profile (Qloo demographics)",
  brand_fit: "Brand fit across teams (Qloo)",
  category_leaders: "Best fit in a category (Qloo)",
  local_businesses: "Local businesses fans love (Qloo)",
  check_conflicts: "Check current sponsors",
  submit_answer: "Answer",
};

export default function AskConsole({ examples, role, initialQuestion }: { examples: string[]; role: "team" | "sponsor"; initialQuestion?: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<{ ms: number; calls: number } | null>(null);
  const runId = useRef(0);

  function apply(e: AskEvent) {
    switch (e.type) {
      case "tool_call":
        setSteps((s) => [...s, { step: e.step, tool: e.tool, reason: e.reason, args: e.args }]);
        break;
      case "tool_result":
        setSteps((s) => s.map((x) => (x.step === e.step ? { ...x, summary: e.summary, error: e.error } : x)));
        break;
      case "note":
        setNotes((n) => [...n, e.text]);
        break;
      case "answer":
        setAnswer(e.answer);
        break;
      case "error":
        setError(e.message);
        break;
      case "done":
        setMeta({ ms: e.ms, calls: e.toolCalls });
        break;
    }
  }

  async function ask(q: string) {
    const id = ++runId.current;
    setQuestion(q);
    setStatus("running");
    setSteps([]);
    setNotes([]);
    setAnswer(null);
    setError("");
    setMeta(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done || runId.current !== id) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as AskEvent);
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  // Arrived from "Ask about this" on Find sponsors: ask once, then drop ?q so a refresh does not ask again.
  useEffect(() => {
    if (!initialQuestion || initialQuestion.trim().length < 5) return;
    // Deferred: keeps state updates out of the effect body, and the cleanup stops a double ask in dev Strict Mode.
    const t = setTimeout(() => {
      router.replace("/ask", { scroll: false });
      ask(initialQuestion.trim());
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the question in the link
  }, []);

  const running = status === "running";
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-panel/90 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length >= 5) ask(question.trim());
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder={role === "team" ? "e.g. Which banks fit our fans best?" : "e.g. Find three NBA teams whose category is open"}
            aria-label="Your goal"
            className="w-full rounded-full border border-line bg-panel-2 px-5 py-3 text-sm outline-none focus:border-accent"
          />
          <button disabled={running || question.trim().length < 5} className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bg disabled:opacity-50">
            {running ? "Working…" : "Ask"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {examples.map((x) => (
            <button key={x} disabled={running} onClick={() => ask(x)} className="rounded-full border border-line px-3 py-1.5 text-left text-muted hover:border-accent hover:text-text disabled:opacity-50">
              {x}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-loss">{error}</p>}
      </section>

      {(steps.length > 0 || running) && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <section className="rounded-3xl border border-line bg-panel/90 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Agent trace</p>
            <ol className="mt-4 space-y-3">
              {steps.map((s) => (
                <li key={s.step} className="rounded-xl border border-line bg-panel-2 p-3 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-muted">{s.step}</span>
                    <span className="font-semibold">{TOOL_LABEL[s.tool] ?? s.tool}</span>
                  </div>
                  {s.reason && <p className="mt-1 text-xs text-muted">{s.reason}</p>}
                  {Object.keys(s.args).length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {Object.entries(s.args)
                        .filter(([, v]) => v !== null && v !== "")
                        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                  <p className={`mt-1 ${s.error ? "text-loss" : s.summary ? "text-gain" : "animate-pulse text-muted"}`}>
                    {s.summary ? `→ ${s.summary}` : "working…"}
                  </p>
                </li>
              ))}
              {running && steps.every((s) => s.summary) && <li className="animate-pulse text-sm text-muted">Thinking…</li>}
            </ol>
            {meta && (
              <p className="mt-3 text-xs text-muted">
                {meta.calls} tool calls in {(meta.ms / 1000).toFixed(0)} s.
              </p>
            )}
            {notes.map((n) => (
              <p key={n} className="mt-2 text-xs text-muted">
                {n}
              </p>
            ))}
          </section>

          <section className="rounded-3xl border border-line bg-panel/90 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Answer</p>
            {!answer ? (
              <p className="mt-3 text-sm text-muted">{running ? "The agent is working…" : "No answer."}</p>
            ) : (
              <>
                <p className="mt-3">{answer.summary}</p>
                <ol className="mt-4 space-y-3">
                  {answer.picks.map((p, i) => (
                    <li key={p.id} className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-muted">{i + 1}</span>
                        {p.kind === "team" && role === "sponsor" ? (
                          <Link href={`/sponsor/teams/${p.id}`} className="font-semibold hover:text-accent">
                            {p.name} →
                          </Link>
                        ) : (
                          <span className="font-semibold">{p.name}</span>
                        )}
                        <span className="text-xs text-muted">{p.kind}</span>
                      </div>
                      <p className="mt-1">{p.why}</p>
                      <ul className="mt-2 space-y-0.5 text-xs text-muted">
                        {p.evidence.map((x) => (
                          <li key={x}>· {x}</li>
                        ))}
                      </ul>
                      {role === "team" && p.kind === "place" && <OfferButton row={{ id: p.id, name: p.name, score: null }} />}
                    </li>
                  ))}
                </ol>
                {answer.caveats && <p className="mt-4 text-xs text-warn">Caveats: {answer.caveats}</p>}
                <p className="mt-3 text-[11px] text-muted">Every pick was returned by a tool in the trace; the agent cannot add names of its own.</p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
