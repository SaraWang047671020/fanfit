import { ChartColumn, Handshake, Heart, Info, MapPin, Radar, Send, ShieldCheck, Sparkles, Target, Ticket, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { FitDiagram, Photo, PitchLines } from "./Art";

export const metadata: Metadata = {
  title: "FanFit · Sponsorships your fans already love",
  description: "FanFit matches sports teams and brands on what fans actually like, with Qloo taste data, and proves it with deals fans redeem.",
};

const HOME: Record<string, string> = { team: "/fanfit", sponsor: "/sponsor", fan: "/fans" };

/** The cover: what FanFit is, for whom, and how it works. Signed-in visitors get a way back to their workspace. */
export default async function Home() {
  const { user, profile } = process.env.NEXT_PUBLIC_SUPABASE_URL ? await currentUser() : { user: null, profile: null };
  const workspace = user ? (profile?.role ? HOME[profile.role] : "/onboarding") : null;

  return (
    <div className="flex-1">
      <TopBar workspace={workspace} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <Photo src="/images/stadium.jpg" tint="bg-gradient-to-r from-ink via-ink/85 to-ink/40" opacity={0.55} priority />
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-team/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-brand/40 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-sun" aria-hidden /> Powered by Qloo taste data
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-6xl">
              Sponsorships your fans <span className="text-sun">already love</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              FanFit finds the brands and local businesses a club&apos;s fans really like, helps both sides pitch each other with the evidence,
              and proves it with deals fans redeem.
            </p>
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Try it now, no sign-up</p>
              <DemoButtons dark />
            </div>
            {workspace && (
              <Link href={workspace} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sun hover:underline">
                Go to your workspace →
              </Link>
            )}
          </div>
          <div className="rounded-3xl bg-white/95 p-5 text-text shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Real example from the demo</p>
            <p className="mt-1 text-sm font-semibold">Seattle Sounders FC × Gatorade</p>
            <div className="mt-3">
              <FitDiagram />
            </div>
          </div>
        </div>
      </section>

      {/* Facts */}
      <section className="border-b border-line bg-panel">
        <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
          {[
            ["79", "NBA, MLS, WNBA and NWSL teams scored for any brand"],
            ["6", "fan age groups per club, weighted by its real fan mix"],
            ["3", "sides on one platform: teams, brands and fans"],
            ["1 click", "from a recommendation to a pitch report"],
          ].map(([n, label]) => (
            <div key={n}>
              <dt className="text-3xl font-bold text-ink">{n}</dt>
              <dd className="mt-1 text-sm text-muted">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Problem */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">The problem</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-bold sm:text-4xl">Sponsorship is bought on reach. Nobody checks whether the fans care.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-panel p-6">
            <p className="font-semibold text-muted">Today</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>· Clubs pitch whoever has a budget; brands buy the biggest audience they can afford.</li>
              <li>· Audience research costs agency money that mid-size clubs and local businesses don&apos;t have.</li>
              <li>· After the deal, no one learns whether the fans responded.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-gain/40 bg-gain/5 p-6">
            <p className="font-semibold text-gain">With FanFit</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>· Both sides see how much <em>these</em> fans like <em>this</em> brand, from Qloo&apos;s taste data.</li>
              <li>· Every club gets the evidence, ready to send as a one-page report.</li>
              <li>· Deals on the fan map show which fans actually came.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Sides */}
      <section id="sides" className="bg-panel-2/60 py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">One platform, three sides</p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Built for everyone in the deal</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <SideCard
              kind="team"
              photo="/images/pitch.jpg"
              icon={<Trophy className="h-5 w-5" aria-hidden />}
              title="For teams"
              demo="Try the team demo"
              lead="Find the sponsors your fans already love."
              points={[
                "An agent ranks brands and local businesses each age group of fans loves",
                "A sourced reason to call now, with current sponsors checked",
                "One-click pitch reports to send brands",
                "Deals on your fan map, and who really came",
              ]}
            />
            <SideCard
              kind="sponsor"
              photo="/images/arena.jpg"
              icon={<Handshake className="h-5 w-5" aria-hidden />}
              title="For brands"
              demo="Try the brand demo"
              lead="Find the teams whose fans already love you."
              points={[
                "All 79 teams ranked for your brand",
                "Re-rank for your audience: age, gender, interests",
                "Why the fit is there: shared fans, tastes and traits",
                "Tell a club you're interested, with the report attached",
              ]}
            />
            <SideCard
              kind="fan"
              photo="/images/crowd.jpg"
              icon={<Heart className="h-5 w-5" aria-hidden />}
              title="For fans"
              demo="Try the fan demo"
              lead="Deals from your team's partners, picked for you."
              points={[
                "Heart your teams and see all their partners on one map",
                "Pick your tastes; deals are ordered for you, with the reason",
                "Claim a code and show it at the counter",
                "Your tastes stay private",
              ]}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">How it works</p>
        <h2 className="mt-2 text-3xl font-bold sm:text-4xl">From taste data to deals fans redeem</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-5">
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white shadow-md">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 text-xs font-bold text-muted">Step {i + 1}</p>
              <p className="mt-1 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why Qloo: the data FanFit asks for, and what it changes */}
      <section id="qloo" className="relative overflow-hidden bg-ink py-16 text-white">
        <PitchLines className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.05]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sun">Why Qloo</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-bold sm:text-4xl">Every recommendation starts with a Qloo call</h2>
          <p className="mt-3 max-w-3xl text-white/70">
            FanFit doesn&apos;t guess who fans are. It asks Qloo&apos;s taste graph eight kinds of questions, and every team, brand and place
            on screen came back from one of them.
          </p>

          <h3 className="mt-10 text-sm font-bold uppercase tracking-[0.12em] text-white/60">The Qloo data FanFit uses</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QLOO_DATA.map(({ Icon, title, text, used }) => (
              <div key={title} className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5">
                <Icon className="h-5 w-5 text-sun" aria-hidden />
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 flex-1 text-sm text-white/70">{text}</p>
                <p className="mt-4 text-xs font-semibold text-gain">→ {used}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-14 text-sm font-bold uppercase tracking-[0.12em] text-white/60">What changes with Qloo</h3>
          <div className="mt-4 overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[1.1fr_1fr_1.6fr] gap-4 bg-white/5 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white/50 md:grid">
              <span>The question</span>
              <span>Without Qloo</span>
              <span className="text-sun">With Qloo, in the demo</span>
            </div>
            <ul className="divide-y divide-white/10">
              {QLOO_CHANGES.map(({ q, before, after }) => (
                <li key={q} className="grid gap-2 px-6 py-5 md:grid-cols-[1.1fr_1fr_1.6fr] md:gap-4">
                  <p className="font-semibold">{q}</p>
                  <p className="text-sm text-white/50">
                    <span className="mr-1 font-semibold text-white/40 md:hidden">Without:</span>
                    {before}
                  </p>
                  <p className="text-sm text-white/90">
                    <span className="mr-1 font-semibold text-sun md:hidden">With Qloo:</span>
                    {after}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-xs text-white/50">
            Examples are from the live demo (Seattle Sounders FC, Gatorade, a Seattle fan). Qloo gives aggregate taste insight, so no personal
            data is collected to understand an audience. Fit measures shared taste, not sales.
          </p>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {TRUST.map(({ Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-3xl border border-line bg-panel p-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gain" aria-hidden />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto mb-16 w-full max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-team to-brand p-8 text-white sm:p-12">
          <PitchLines className="pointer-events-none absolute inset-0 h-full w-full text-white/10" />
          <div className="relative">
            <h2 className="text-3xl font-bold">See it with real data</h2>
            <p className="mt-2 max-w-2xl text-white/85">
              Shared demo accounts: Seattle Sounders FC as the club, Gatorade as the brand, and a fan. Every page has a guided tour.
            </p>
            <DemoButtons dark />
            <p className="mt-5 text-sm text-white/80">
              Have an account?{" "}
              <Link href={workspace ?? "/login"} className="font-semibold text-white underline">
                {workspace ? "Go to your workspace" : "Sign in"}
              </Link>
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <span>
            <span className="font-bold text-text">
              <span className="text-gain">Fan</span>Fit
            </span>{" "}
            · Built for the Qloo Agentic Hackathon · Taste data by Qloo
          </span>
          <span className="flex gap-4">
            <Link href="/fans" className="hover:text-text">
              For fans
            </Link>
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
            <a href="https://github.com/SaraWang047671020/fanfit" className="hover:text-text">
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

const STEPS = [
  { Icon: Radar, title: "Read the fans", text: "Qloo shows what a club's fans like across brands, music, places and more, by age group and city." },
  { Icon: ChartColumn, title: "Rank partners", text: "FanFit scores every brand and business against what these fans usually like, and checks exclusivity." },
  { Icon: Send, title: "Pitch with evidence", text: "A one-page report explains the fit; teams and brands send it to each other." },
  { Icon: Ticket, title: "Launch a deal", text: "Partners' offers go on the club's fan map; fans claim a code at the counter." },
  { Icon: Target, title: "Learn what worked", text: "Redemptions by age group are set against FanFit's prediction." },
];

// What FanFit asks Qloo (Insights API), and where each answer shows up.
const QLOO_DATA = [
  { Icon: Users, title: "Who the fans are", text: "Age and gender mix of a club's fans (Qloo demographics for the team).", used: "Fan mix, weights every ranking" },
  { Icon: Radar, title: "Brands fans love, by age", text: "Brands ranked for the team + city as signals, once for each of six age groups.", used: "Who to call" },
  { Icon: MapPin, title: "Places near the club", text: "Local businesses these fans like, limited to the club's city, with address and map position.", used: "Local businesses, fan map" },
  { Icon: ChartColumn, title: "Best brand per category", text: "Brands filtered by Qloo industry tags: bank, beer, insurance, airline and more.", used: "By category" },
  { Icon: Trophy, title: "How each team's fans score a brand", text: "One brand against all 79 teams, compared with how the same fans score 40 big brands.", used: "Team ranking for brands" },
  { Icon: Target, title: "A target audience", text: "Age, gender and interest signals (e.g. women 25–29 into fitness) re-score every team.", used: "Target audience" },
  { Icon: Handshake, title: "Tastes both sides share", text: "Artists, brands and places that fans of the team and the brand both like.", used: "Pitch report, activation ideas" },
  { Icon: Heart, title: "A fan's own taste", text: "The brands, artists, films and shows a fan picks rank that fan's local deals.", used: "“For you” deals" },
];

// Without vs with Qloo. The "with" side quotes the live demo.
const QLOO_CHANGES = [
  {
    q: "Which brands should a club call?",
    before: "Whoever has a sports budget, from a contact list or a hunch.",
    after: "A ranked list of brands Seattle Sounders FC fans like more than usual, each with the age group it's strongest with and a sourced reason to call now.",
  },
  {
    q: "What goes in the pitch?",
    before: "Attendance, impressions and TV reach: the same deck for every brand.",
    after: "Why these fans fit this brand: Sounders × Gatorade share the most fans at 25–29, and both audiences love Kygo, Nike Training Club and the Space Needle.",
  },
  {
    q: "Which teams should a brand sponsor?",
    before: "The biggest markets and TV ratings.",
    after: "All 79 teams ranked by how much their fans like Gatorade. For women 25–29 into fitness, NJ/NY Gotham FC climbs 63 places to No. 2.",
  },
  {
    q: "Which local businesses fit the fans?",
    before: "Not researched: too costly for a single café or shop.",
    after: "Seattle places these fans like, with a map position, ready to become a deal on the club's fan map.",
  },
  {
    q: "Which deal does a fan see first?",
    before: "The same coupon list for everyone.",
    after: "Deals ordered by the fan's own taste: REI comes first “because you like Patagonia”.",
  },
  {
    q: "How long does the research take?",
    before: "An agency study, if the club can afford one.",
    after: "About 3 minutes and some 200 Qloo calls per club, saved so the next look is instant.",
  },
];

const TRUST = [
  { Icon: ShieldCheck, title: "Agents that can't make things up", text: "Every team, brand and place an agent names was returned by a Qloo call; answers that don't are sent back." },
  { Icon: Info, title: "Every score explained", text: "An ⓘ next to each number says what Qloo data it uses and what it doesn't mean." },
  { Icon: MapPin, title: "Measured in the real world", text: "Deals fans claim and redeem show whether the predicted fans came." },
];

function TopBar({ workspace }: { workspace: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/95 text-white backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-bold">
          <span className="text-gain">Fan</span>Fit
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/75 md:flex" aria-label="Sections">
          <a href="#sides" className="hover:text-white">
            Who it&apos;s for
          </a>
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <a href="#qloo" className="hover:text-white">
            Why Qloo
          </a>
        </nav>
        <div className="flex items-center gap-2 text-sm">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full bg-sun px-4 py-1.5 font-semibold text-ink">Judges: try the demo ▾</summary>
            <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-panel p-2 text-text shadow-lg">
              <DemoButtons stacked />
            </div>
          </details>
          <Link href={workspace ?? "/login"} className="hidden rounded-full border border-white/25 px-4 py-1.5 font-semibold sm:inline-block">
            {workspace ? "Workspace" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}

const DEMOS = [
  { kind: "team", label: "As a team", who: "Seattle Sounders FC", tone: "bg-team", Icon: Trophy },
  { kind: "sponsor", label: "As a brand", who: "Gatorade", tone: "bg-brand", Icon: Handshake },
  { kind: "fan", label: "As a fan", who: "Seattle fan", tone: "bg-fan", Icon: Heart },
] as const;

function DemoButtons({ dark = false, stacked = false }: { dark?: boolean; stacked?: boolean }) {
  return (
    <div className={stacked ? "space-y-1" : "mt-3 flex flex-wrap gap-3"}>
      {DEMOS.map(({ kind, label, who, tone, Icon }) => (
        <form key={kind} action="/auth/demo" method="post">
          <input type="hidden" name="as" value={kind} />
          <button
            className={
              stacked
                ? "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2"
                : `flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-left font-semibold text-white shadow-md hover:brightness-110 ${tone} ${dark ? "ring-1 ring-white/20" : ""}`
            }
          >
            <span className={stacked ? `flex h-7 w-7 items-center justify-center rounded-full text-white ${tone}` : ""}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-sm">{label}</span>
              <span className={`block text-xs font-normal ${stacked ? "text-muted" : "text-white/80"}`}>{who}</span>
            </span>
          </button>
        </form>
      ))}
    </div>
  );
}

function SideCard({
  kind,
  icon,
  title,
  demo,
  lead,
  points,
  photo,
}: {
  photo?: string;
  kind: "team" | "sponsor" | "fan";
  icon: React.ReactNode;
  title: string;
  demo: string;
  lead: string;
  points: string[];
}) {
  const tone = kind === "team" ? "bg-team" : kind === "sponsor" ? "bg-brand" : "bg-fan";
  const text = kind === "team" ? "text-team" : kind === "sponsor" ? "text-brand" : "text-fan";
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-line bg-panel shadow-sm">
      <div className={`relative h-28 ${tone}`}>
        {photo ? <Photo src={photo} tint={`${tone} opacity-60`} opacity={1} /> : <PitchLines className="absolute inset-0 h-full w-full text-white/20" />}
        <span className={`absolute -bottom-6 left-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md ${text}`}>{icon}</span>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-9">
        <p className={`text-xs font-bold uppercase tracking-[0.12em] ${text}`}>{title}</p>
        <p className="mt-1 text-lg font-semibold">{lead}</p>
        <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className={text}>✓</span>
              {p}
            </li>
          ))}
        </ul>
        <form action="/auth/demo" method="post" className="mt-6">
          <input type="hidden" name="as" value={kind} />
          <button className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 ${tone}`}>{demo} →</button>
        </form>
      </div>
    </article>
  );
}
