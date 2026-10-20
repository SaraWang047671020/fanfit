"use client";

import { useState, useTransition } from "react";
import { cancelTeamRequest, decideRequest } from "./requests";

export function DecideButtons({ userId }: { userId: string }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideRequest(userId, approve);
      if ("error" in r && r.error) setError(r.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending} onClick={() => decide(true)} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-bg disabled:opacity-50">
        Approve
      </button>
      <button disabled={pending} onClick={() => decide(false)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-loss hover:text-loss disabled:opacity-50">
        Reject
      </button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </div>
  );
}

export function CancelRequest() {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => cancelTeamRequest())}
      className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-50"
    >
      {pending ? "Cancelling…" : "Cancel request and choose again"}
    </button>
  );
}
