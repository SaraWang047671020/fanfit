// Top navigation for team and sponsor pages: product tabs for the account's side, who is signed in, and sign out.
// Demo accounts also get a switcher to try the other sides.
import { currentUser } from "@/lib/supabase/server";
import DemoSwitch from "./DemoSwitch";
import NavTabs from "./NavTabs";

export default async function AccountBar({ name, org, role }: { name: string; org: string; role: "team" | "sponsor" }) {
  const { supabase, profile } = await currentUser();
  const approved = role === "team" && !!profile?.team_approved;
  const waiting = approved ? ((await supabase.rpc("team_requests")).data?.length ?? 0) : 0;
  const tabs =
    role === "team"
      ? approved
        ? [
            { href: "/fanfit", label: "Find sponsors" },
            { href: "/ask", label: "✦ Ask FanFit" },
            { href: "/team/sponsors", label: "Our sponsors" },
            { href: "/team/offers", label: "Fan offers" },
            { href: "/team/members", label: waiting ? `Members (${waiting})` : "Members" },
          ]
        : []
      : [
          { href: "/sponsor", label: "Team ranking" },
          { href: "/ask", label: "✦ Ask FanFit" },
        ];
  return (
    <nav className="sticky top-3 z-40 rounded-2xl border border-line bg-panel/95 px-4 py-2.5 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-bold">
            <span className="text-gain">Fan</span>Fit
          </span>
          <NavTabs tabs={tabs} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {profile?.is_demo && <DemoSwitch current={role} />}
          <span className="hidden md:inline">
            {name} · <span className="font-semibold text-text">{org}</span>
          </span>
          <form action="/auth/signout" method="post">
            <button className="rounded-full border border-line px-3 py-1 hover:border-accent hover:text-text">Sign out</button>
          </form>
        </div>
      </div>
    </nav>
  );
}
