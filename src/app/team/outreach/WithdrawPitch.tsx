"use client";

import { useTransition } from "react";
import { withdrawPitch } from "../../interest-actions";

export default function WithdrawPitch({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => void (await withdrawPitch(id)))} className="mt-2 text-xs text-muted underline hover:text-loss disabled:opacity-50">
      Withdraw
    </button>
  );
}
