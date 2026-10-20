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

/** Follow toggle. `signedInAs`: null = signed out (link to sign in), "none" = no account type yet (link to Account). */
export function FollowButton({ teamId, following, signedInAs = "fan" }: { teamId: string; following: boolean; signedInAs?: string | null }) {
  const [on, setOn] = useState(following);
  const [pending, start] = useTransition();
  if (signedInAs !== "fan")
    return signedInAs === null || signedInAs === "none" ? (
      <Link
        href={signedInAs === null ? `/login?next=/t/${teamId}` : "/fans/account"}
        className="rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:border-accent hover:text-text"
      >
        ☆ Follow
      </Link>
    ) : null;
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setFollow(teamId, !on);
          if (!r.error) setOn(!on);
        })
      }
      aria-pressed={on}
      className={`rounded-full border px-4 py-1.5 text-sm disabled:opacity-50 ${on ? "border-gain text-gain" : "border-line text-muted hover:border-accent hover:text-text"}`}
    >
      {on ? "★ Following" : "☆ Follow"}
    </button>
  );
}
