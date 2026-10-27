"use client";

// "Tell {team} you're interested": the brand's note plus a FanFit report on why the brand fits the team's fans,
// or, once sent, the note, its report link and the team's answer.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import PitchComposer from "../../../PitchComposer";
import { withdrawInterest } from "../../../interest-actions";
import SectionIcon from "@/app/SectionIcon";
import { Send } from "lucide-react";

export interface SentNote {
  status: "new" | "interested" | "declined";
  created_at: string;
  message: string;
  report: { token: string; views: number } | null;
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
  const router = useRouter();
  const [pending, start] = useTransition();

  if (sent) {
    const answer =
      sent.status === "interested"
        ? { text: `${teamName} is interested. Expect them at your contact email.`, tone: "text-gain" }
        : sent.status === "declined"
          ? { text: `${teamName} passed for now.`, tone: "text-muted" }
          : { text: onFanfit ? `Waiting for ${teamName} to answer.` : `${teamName} isn't on FanFit yet; they will see your note when they join.`, tone: "text-muted" };
    return (
      <section data-tour="interest" className="rounded-3xl border border-gain/40 bg-panel/90 p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent"><SectionIcon icon={Send} tone="brand" /> Your note to {teamName}</p>
        <p className="mt-2 text-sm">“{sent.message}”</p>
        <p className="mt-1 text-xs text-muted">
          Sent {new Date(sent.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {sent.report && (
            <>
              {" · "}
              <a href={`/r/${sent.report.token}`} target="_blank" rel="noreferrer" className="text-accent">
                FanFit report ↗
              </a>{" "}
              · opened {sent.report.views} time{sent.report.views === 1 ? "" : "s"}
            </>
          )}
        </p>
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
      <PitchComposer
        title={`Tell ${teamName} you're interested`}
        intro={
          onFanfit
            ? `${teamName} is on FanFit: your note lands in their inbox with a FanFit report on why ${brand} fits their fans.`
            : `${teamName} isn't on FanFit yet: share the report link yourself; the note is the first thing they see when they join.`
        }
        defaultMessage={`Hi ${teamName}, your fans are a strong match for ${brand}, and we'd like to talk about a partnership this season.`}
        subject={`${brand} × ${teamName}: why your fans fit`}
        // The audience the brand was ranking for travels in the URL from the ranking page.
        payload={() => ({ kind: "brand_to_team", teamId, target: Object.fromEntries(new URLSearchParams(window.location.search)) })}
        onSent={() => router.refresh()}
        extra={(set, values) => (
          <input
            type="email"
            value={values.contactEmail ?? email}
            onChange={(e) => set("contactEmail", e.target.value)}
            ref={(el) => {
              if (el && values.contactEmail === undefined) set("contactEmail", email);
            }}
            placeholder="Contact email (optional)"
            aria-label="Contact email"
            className="mt-1 w-full rounded-full border border-line bg-panel-2 px-4 py-2 text-sm outline-none focus:border-accent"
          />
        )}
      />
    </section>
  );
}
