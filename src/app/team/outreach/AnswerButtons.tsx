"use client";

import { useTransition } from "react";
import { answerInterest } from "../../interest-actions";

export default function AnswerButtons({ id, status }: { id: string; status: "new" | "interested" | "declined" }) {
  const [pending, start] = useTransition();
  const answer = (s: "interested" | "declined" | "new") => start(async () => void (await answerInterest(id, s)));
  if (status !== "new")
    return (
      <p className="flex items-center gap-3 text-sm">
        <span className={status === "interested" ? "font-semibold text-gain" : "text-muted"}>
          {status === "interested" ? "You said you're interested." : "You passed for now."}
        </span>
        <button disabled={pending} onClick={() => answer("new")} className="text-xs text-muted underline disabled:opacity-50">
          Undo
        </button>
      </p>
    );
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={pending} onClick={() => answer("interested")} className="rounded-full bg-gain px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        Interested
      </button>
      <button disabled={pending} onClick={() => answer("declined")} className="rounded-full border border-line px-4 py-1.5 text-sm text-muted disabled:opacity-50">
        Not now
      </button>
    </div>
  );
}
