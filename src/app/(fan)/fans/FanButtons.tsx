"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinFan, setFollow } from "./actions";

export function JoinFan() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinFan();
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
      >
        {pending ? "Saving…" : "Continue as a fan"}
      </button>
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
    </>
  );
}

/**
 * Favorite (follow) toggle, shown as a heart. Favorite teams' deals and partners share one map on the fan home.
 * `signedInAs`: null = signed out (link to sign in), "none" = no account type yet (link to Account).
 * `compact`: heart only, for team cards.
 */
export function FollowButton({
  teamId,
  teamName,
  following,
  signedInAs = "fan",
  compact = false,
  next,
}: {
  teamId: string;
  teamName?: string;
  following: boolean;
  signedInAs?: string | null;
  compact?: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [pending, start] = useTransition();
  const label = on ? `Remove ${teamName ?? "this team"} from my teams` : `Add ${teamName ?? "this team"} to my teams`;
  const shape = compact ? "h-10 w-10 justify-center text-xl" : "gap-1.5 px-4 py-1.5 text-sm";
  if (signedInAs !== "fan")
    return signedInAs === null || signedInAs === "none" ? (
      <Link
        href={signedInAs === null ? `/login?next=${next ?? `/t/${teamId}`}` : "/fans/account"}
        aria-label={label}
        title="Sign in to save your teams"
        className={`inline-flex shrink-0 items-center rounded-full border border-line text-muted hover:border-loss hover:text-loss ${shape}`}
      >
        ♡{!compact && " Add to my teams"}
      </Link>
    ) : null;
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setFollow(teamId, !on);
          if (!r.error) {
            setOn(!on);
            router.refresh(); // the combined map on the fan home follows the change
          }
        })
      }
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center rounded-full border disabled:opacity-50 ${shape} ${on ? "border-loss/40 bg-loss/10 text-loss" : "border-line text-muted hover:border-loss hover:text-loss"}`}
    >
      {on ? "♥" : "♡"}
      {!compact && (on ? " My team" : " Add to my teams")}
    </button>
  );
}
