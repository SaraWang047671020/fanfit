"use client";

// Write a note, build a FanFit pitch report (~30-40 s), then share its link. FanFit does not send email itself:
// "Email it" opens the user's own mail app with the subject, note and link filled in.
import { useState } from "react";

export default function PitchComposer({
  title,
  intro,
  defaultMessage,
  payload,
  subject,
  onSent,
  extra,
}: {
  title: string;
  intro: string;
  defaultMessage: string;
  payload: () => Record<string, unknown>; // the kind-specific part of the /api/pitch body
  subject: string; // email subject
  onSent?: () => void;
  extra?: (set: (k: string, v: string) => void, values: Record<string, string>) => React.ReactNode; // more fields
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<"edit" | "busy" | "done">("edit");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), ...values, message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.token) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLink(`${window.location.origin}/r/${json.token}`);
      setState("done");
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("edit");
    }
  }

  if (state === "done")
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gain">Report ready. Share the link; it opens without signing in.</p>
        <div className="flex items-center gap-2 rounded-full border border-line bg-panel-2 py-1 pl-4 pr-1 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
            }}
            className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={link} target="_blank" rel="noreferrer" className="rounded-full border border-accent px-4 py-1.5 font-semibold text-accent">
            Open report ↗
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\nWhy we think it fits, with the data: ${link}`)}`}
            className="rounded-full border border-line px-4 py-1.5 font-semibold hover:border-accent"
          >
            ✉ Email it
          </a>
        </div>
      </div>
    );

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{title}</p>
      <p className="mt-1 text-xs text-muted">{intro}</p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={600}
        rows={3}
        disabled={state === "busy"}
        aria-label="Your note"
        className="mt-3 w-full rounded-2xl border border-line bg-panel-2 px-4 py-3 text-sm outline-none focus:border-accent disabled:opacity-60"
      />
      {extra?.((k, v) => setValues((x) => ({ ...x, [k]: v })), values)}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          disabled={state === "busy" || message.trim().length < 5}
          onClick={create}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {state === "busy" ? "Building the report… (~30 s)" : "Create report"}
        </button>
        {state === "busy" && (
          <span className="animate-pulse text-xs text-muted">Fit, shared fans and tastes from Qloo; news; an activation idea…</span>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </div>
  );
}
