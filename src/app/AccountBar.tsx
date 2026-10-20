// Top navigation for team and sponsor pages: product tabs for the account's side, and the account menu (who is
// signed in, demo side switching, sign out).
import { currentUser } from "@/lib/supabase/server";
import Link from "next/link";
import AccountMenu from "./AccountMenu";
import NavTabs from "./NavTabs";
import Tour from "./Tour";

export default async function AccountBar({
  name,
  org,
  role,
  tour,
}: {
  name: string;
  org: string;
  role: "team" | "sponsor";
  tour?: React.ComponentProps<typeof Tour>["id"]; // this page's guided tour (auto-plays once per browser, then on request)
}) {
  const { supabase, profile } = await currentUser();
  const approved = role === "team" && !!profile?.team_approved;
  const [requests, notes] = approved
    ? await Promise.all([supabase.rpc("team_requests"), supabase.rpc("team_interest")])
    : role === "sponsor"
      ? [null, await supabase.rpc("brand_inbox")]
      : [null, null];
  const waiting = requests?.data?.length ?? 0;
  const newNotes = ((notes?.data ?? []) as { status: string }[]).filter((n) => n.status === "new").length;
  const tabs =
    role === "team"
      ? approved
        ? [
            { href: "/fanfit", label: "Find sponsors" },
            { href: "/ask", label: "Ask" },
            { href: "/team/sponsors", label: "Our sponsors" },
            { href: "/team/offers", label: "Fan offers" },
            { href: "/team/outreach", label: "Outreach", badge: newNotes },
            { href: "/team/members", label: "Members", badge: waiting },
          ]
        : []
      : [
          { href: "/sponsor", label: "Team ranking" },
          { href: "/ask", label: "Ask FanFit" },
          { href: "/sponsor/outreach", label: "Outreach", badge: newNotes },
        ];
  return (
    <>
      <nav data-tour="nav" className="sticky top-3 z-40 rounded-2xl border border-line bg-panel/95 px-3 py-2 shadow-sm backdrop-blur sm:px-4">
        {/* One line from sm up; on phones the tabs get their own full-width row that scrolls sideways. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap">
          <Link href="/" className="shrink-0 text-sm font-bold" title="About FanFit">
            <span className="text-gain">Fan</span>Fit
          </Link>
          <div className="order-last -mx-1 w-full min-w-0 sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
            <NavTabs tabs={tabs} />
          </div>
          <div className="ml-auto sm:ml-0">
            <AccountMenu name={name} org={org} role={role} demo={!!profile?.is_demo} />
          </div>
        </div>
      </nav>
      {/* Outside the nav: its backdrop blur would make the fixed button position against the bar. */}
      {tour && <Tour id={tour} auto />}
    </>
  );
}
