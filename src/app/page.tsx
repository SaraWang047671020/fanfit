import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";

export default async function Home() {
  // Signed-in users go straight to their side of the product (Supabase not configured: just show the page).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { user, profile } = await currentUser();
    if (user)
      redirect(profile?.role === "team" ? "/fanfit" : profile?.role === "sponsor" ? "/sponsor" : profile?.role === "fan" ? "/fans" : "/onboarding");
  }
  return (
    <>
    <div className="sticky top-0 z-50 border-b border-line bg-panel/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <span className="text-sm font-bold">
          <span className="text-gain">Fan</span>Fit
        </span>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="hidden text-muted sm:inline">Judges: one-click demo →</span>
          {(
            [
              ["team", "Team"],
              ["sponsor", "Sponsor"],
              ["fan", "Fan"],
            ] as const
          ).map(([kind, label]) => (
            <form key={kind} action="/auth/demo" method="post">
              <input type="hidden" name="as" value={kind} />
              <button className="rounded-full bg-gain px-3 py-1.5 text-xs font-semibold text-white">{label} demo</button>
            </form>
          ))}
          <Link href="/login" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
            Sign in
          </Link>
        </div>
      </div>
    </div>
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">Sponsorships your fans already love.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        FanFit reads what a team&apos;s fans actually like — brands, music, places — from Qloo&apos;s taste data, and matches teams and
        sponsors on it. Every recommendation shows why, and every news signal links to its source.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Side
          title="For teams"
          points={[
            "Brands and local businesses your fans love, by age group",
            "Best fit in each sponsorship category, with current sponsors flagged",
            "A reason to call each one now, and a matchday activation idea",
          ]}
        />
        <Side
          title="For sponsors"
          points={[
            "Every NBA, MLS, WNBA and NWSL team ranked by how much its fans like your brand",
            "Why the fit is there: shared audiences, tastes and traits",
            "Whether your category is taken, and why now is a good time",
          ]}
        />
      </div>
      <section id="demo" className="mt-10 rounded-3xl border border-gain/40 bg-panel/90 p-6">
        <p className="font-semibold">Try the demo, no sign-up</p>
        <p className="mt-1 text-sm text-muted">
          Shared demo accounts: Seattle Sounders FC as the club, Gatorade as the brand, and a fan. Demo offers are labelled and
          some actions are switched off so the next visitor sees the same data.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(
            [
              ["team", "As a team · Seattle Sounders FC"],
              ["sponsor", "As a sponsor · Gatorade"],
              ["fan", "As a fan"],
            ] as const
          ).map(([kind, label]) => (
            <form key={kind} action="/auth/demo" method="post">
              <input type="hidden" name="as" value={kind} />
              <button className="rounded-full bg-gain px-5 py-2.5 text-sm font-semibold text-white">{label}</button>
            </form>
          ))}
        </div>
      </section>
      <Link href="/login" className="mt-6 inline-block rounded-full border border-accent px-8 py-3 text-sm font-semibold text-accent">
        Sign in or create an account
      </Link>
      <p className="mt-4 text-sm text-muted">
        A fan looking for deals from your team&apos;s partners?{" "}
        <Link href="/fans" className="text-accent">
          Go to FanFit for fans →
        </Link>
      </p>
      <p className="mt-16 text-xs text-muted">
        <Link href="/privacy" className="hover:text-text">Privacy policy</Link> · <Link href="/terms" className="hover:text-text">Terms of service</Link>
      </p>
    </main>
    </>
  );
}

function Side({ title, points }: { title: string; points: string[] }) {
  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="text-gain">→</span>
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
