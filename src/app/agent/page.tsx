import Link from "next/link";
import type { Metadata } from "next";
import { DEMO_PROJECT, PACKAGE_A, TARGET_AUDIENCE } from "@/lib/demo";
import { DEMO_AGENT_INPUT } from "@/lib/demo-agent";
import recorded from "@/data/demo-agent-run.json";
import AgentConsole from "./AgentConsole";

export const metadata: Metadata = { title: "Agent Mission · TasteFrame" };

export default function AgentPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← Shift Map
      </Link>
      <header className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">TasteFrame Agent · {DEMO_PROJECT.title}</p>
        <h1 className="mt-2 text-4xl font-bold">Give it a goal. Watch it test the options.</h1>
        <p className="mt-3 max-w-3xl text-muted">
          The agent inspects the package, finds Qloo bridges to <b className="text-text">{TARGET_AUDIENCE.label}</b>,
          proposes and resolves candidates, measures every swap with Qloo, and hands back the best trade-offs. Metrics come
          from Qloo; the model can only swap in entities a tool has returned.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2 text-sm">
          {PACKAGE_A.entities.map((e) => (
            <li key={e.id} className="rounded-full border border-line px-3 py-1 text-muted">
              <span className="opacity-60">{e.slot.replace(/_\d$/, "")} · </span>
              {e.name}
            </li>
          ))}
        </ul>
      </header>
      <div className="mt-8">
        <AgentConsole recorded={recorded as Parameters<typeof AgentConsole>[0]["recorded"]} defaultGoal={DEMO_AGENT_INPUT.goal} />
      </div>
    </main>
  );
}
