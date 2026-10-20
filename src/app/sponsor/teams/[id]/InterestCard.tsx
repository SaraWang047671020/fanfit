"use client";

// "Tell {team} you're interested": the brand's note to the team, or the note already sent and the team's answer.
import { useState, useTransition } from "react";
import { sendInterest, withdrawInterest } from "../../../interest-actions";

export interface SentNote {
  status: "new" | "interested" | "declined";
  created_at: string;
  message: string;
}

export default function InterestCard({
  teamId,
  teamName,
  brand,
  onFanfit,
  sent,
  email,
}: {
  teamId: string;
  teamName: string;
  brand: string;
  onFanfit: boolean;
  sent: SentNote | null;
  email: string;
}) {
  const [message, setMessage] = useState(
    `Hi ${teamName}, FanFit shows your fans are a strong match for ${brand}. We'd like to talk about a partnership this season.`,
  );
  const [contact, setContact] = useState(email);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (sent) {
    const answer =
      sent.status === "interested"
        ? { text: `${teamName} is interested. Expect them at your contact email.`, tone: "text-gain" }
        : sent.status === "declined"
          ? { text: `${teamName} passed for now.`, tone: "text-muted" }
          : {
              text: onFanfit
                ? `Waiting for ${teamName} to answer.`
                : `${teamName} isn't on FanFit yet; they will see your note when they join.`,
              tone: "text-muted",
            };
    return (
      <section data-tour="interest" className="rounded-3xl border border-gain/40 bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Your note to {teamName}</p>
        <p className="mt-2 text-sm">“{sent.message}”</p>
        <p className="mt-1 text-xs text-muted">Sent {new Date(sent.created_at).toLocaleDateString()}</p>
        <p className={`mt-3 text-sm font-semibold ${answer.tone}`}>{answer.text}</p>
        {/* Always offered: shared demo accounts need a way to send again, and a brand may change its mind. */}
        <button
          disabled={pending}
          onClick={() => start(async () => void (await withdrawInterest(teamId)))}
          className="mt-3 block text-xs text-muted underline hover:text-loss disabled:opacity-50"
        >
          Withdraw note
        </button>
      </section>
    );
  }

  return (
    <section data-tour="interest" className="rounded-3xl border border-line bg-panel/90 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Tell {teamName} you&apos;re interested</p>
      <p className="mt-1 text-xs text-muted">
        {onFanfit
          ? `${teamName} is on FanFit: your note lands in their inbox with FanFit's fit score attached.`
          : `${teamName} isn't on FanFit yet: your note waits for them and is the first thing they see when they join.`}
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={600}
        rows={3}
        aria-label="Your note"
        className="mt-3 w-full rounded-2xl border border-line bg-panel-2 px-4 py-3 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Contact email (optional)"
          aria-label="Contact email"
          className="min-w-0 flex-1 rounded-full border border-line bg-panel-2 px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={pending || message.trim().length < 5}
          onClick={() =>
            start(async () => {
              // The audience the brand was ranking for travels in the URL from the ranking page.
              const target = Object.fromEntries(new URLSearchParams(window.location.search));
              const r = await sendInterest({ teamId, message, contactEmail: contact, target });
              setError(r.error ?? "");
            })
          }
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send note"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </section>
  );
}
