"use client";

// On-demand parts of the sponsor's team page: they cost model calls with web search, so they run only when asked.
import { useState } from "react";
import type { Activation } from "@/lib/fanfit-activation";
import { AGE_LABEL, type Age, type Sponsor } from "@/lib/fanfit-score";
import type { TeamNews } from "@/lib/sponsor-detail";
import ActivationPanel from "../../../fanfit/ActivationPanel";

type Check = { sponsors: Sponsor[]; source: "club" | "web"; inMyCategories: string[]; news: TeamNews };
type Load<T> = { status: "idle" } | { status: "loading" } | { status: "done"; data: T } | { status: "error"; message: string };

const TIMING_TONE = ["text-muted", "text-warn", "text-gain/80", "text-gain"];

async function post<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

export default function TeamActions({
  team,
  brand,
  listed,
  driver,
}: {
  team: { id: string; qloo: string; name: string; city: string };
  brand: { qloo: string; name: string };
  listed: { name: string; category: string; mine: boolean }[];
  driver: Age;
}) {
  const [check, setCheck] = useState<Load<Check>>({ status: "idle" });
  const [idea, setIdea] = useState<Load<Activation>>({ status: "idle" });

  async function runCheck() {
    setCheck({ status: "loading" });
    try {
      setCheck({ status: "done", data: await post<Check>("/api/sponsor/team-check", { teamId: team.id }) });
    } catch (e) {
      setCheck({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function runIdea() {
    setIdea({ status: "loading" });
    try {
      const data = await post<Activation>("/api/fanfit/activation", {
        team: { id: team.qloo, name: team.name, city: team.city },
        partner: { id: brand.qloo, name: brand.name, kind: "brand", category: "" },
        driver,
        whyNow: check.status === "done" ? check.data.news.whyNow : "",
      });
      setIdea({ status: "done", data });
    } catch (e) {
      setIdea({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-3xl border border-line bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Sponsors and why now</p>
        {listed.length > 0 && (
          <div className="mt-3 text-sm">
            <p className="text-xs text-muted">Listed by the club on FanFit:</p>
            <ul className="mt-1 space-y-0.5">
              {listed.map((s) => (
                <li key={s.name} className={s.mine ? "text-loss" : ""}>
                  {s.name} <span className="font-mono text-xs text-muted">{s.category}</span>
                  {s.mine && <span className="ml-1 text-xs">· your category</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {check.status !== "done" && (
          <>
            <p className="mt-3 text-sm text-muted">
              Search the web for {team.name}&apos;s current sponsors (to see if your category is taken) and for recent reasons to approach
              them now.
            </p>
            <button
              onClick={runCheck}
              disabled={check.status === "loading"}
              className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60"
            >
              {check.status === "loading" ? "Searching… (~1 min)" : "Check sponsors and news"}
            </button>
          </>
        )}
        {check.status === "error" && <p className="mt-2 text-sm text-loss">{check.message}</p>}
        {check.status === "done" && <CheckResult c={check.data} />}
      </section>

      <section className="rounded-3xl border border-line bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Activation idea</p>
        {idea.status !== "done" && (
          <>
            <p className="mt-3 text-sm text-muted">
              A matchday concept for {team.name} × {brand.name}, aimed at fans {AGE_LABEL[driver]} (where the two audiences overlap most).
              Every act and co-partner comes from Qloo.{check.status === "done" && check.data.news.whyNow ? " Uses the news found above." : ""}
            </p>
            <button
              onClick={runIdea}
              disabled={idea.status === "loading"}
              className="mt-3 rounded-full border border-gain px-4 py-2 text-sm font-semibold text-gain disabled:opacity-60"
            >
              {idea.status === "loading" ? "Designing… (~15 s)" : "✦ Activation idea"}
            </button>
          </>
        )}
        {idea.status === "error" && <p className="mt-2 text-sm text-loss">{idea.message}</p>}
        {idea.status === "done" && <ActivationPanel a={idea.data} partner={brand.name} />}
      </section>
    </div>
  );
}

function CheckResult({ c }: { c: Check }) {
  const { news } = c;
  return (
    <div className="mt-3 space-y-4 text-sm">
      <div>
        <p>
          <span className={`font-mono text-xs font-bold ${TIMING_TONE[news.timing]}`}>timing {news.timing}/3</span>{" "}
          {news.whyNow || <span className="text-muted">No recent reason found.</span>}
        </p>
        {news.risk && <p className="mt-1 text-xs text-warn">Risk: {news.risk}</p>}
        {news.signals.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {news.signals.map((s) => (
              <li key={s.url + s.summary}>
                <span className="font-mono text-muted">{s.type}</span> {s.date} · {s.summary}{" "}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">
                  source ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className={c.inMyCategories.length ? "text-loss" : "text-gain"}>
          {c.inMyCategories.length ? `Your category is taken: ${c.inMyCategories.join(", ")}` : "No current sponsor found in your categories."}
        </p>
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-muted">
            {c.sponsors.length} current sponsors {c.source === "club" ? "listed by the club" : "found by web search (lists can miss deals)"}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {c.sponsors.map((s) => (
              <li key={s.name}>
                <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent">
                  {s.name}
                </a>{" "}
                <span className="font-mono text-muted">{s.category}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
