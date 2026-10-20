// What a team account sees until it is approved: team pages stay closed (they edit public data and spend quota).
import AccountBar from "../AccountBar";
import { CancelRequest } from "./RequestButtons";

export default function Pending({ name, team }: { name: string; team: string }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={name} org={team} role="team" />
      {/* Same width as every workspace page (the top bar must not jump); the text keeps a readable line length. */}
      <div className="max-w-3xl">
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.14em] text-warn">Waiting for approval</p>
        <h1 className="mt-2 text-3xl font-bold">Your request to join {team} is pending</h1>
        <p className="mt-3 text-muted">
          Team accounts can edit the club&apos;s sponsor list and fan map offers, so someone has to confirm you work for {team}: a teammate
          who is already on FanFit, or the FanFit team. You will get full access as soon as one of them approves you.
        </p>
        <p className="mt-3 text-sm text-muted">
          Meanwhile, the{" "}
          <a href="/fans" className="text-accent">
            fan side
          </a>{" "}
          works as usual. Picked the wrong team?
        </p>
        <div className="mt-6">
          <CancelRequest />
        </div>
      </div>
    </main>
  );
}
