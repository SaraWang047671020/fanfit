"use client";

// Guided tour (coach marks): dims the page, lights up one element at a time and explains it. Each page has its own
// short tour. Demo accounts get it once per page automatically; a floating button replays it.
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect } from "react";

type Step = { el: string; title: string; body: string };

const TOURS: Record<string, Step[]> = {
  "team-finder": [
    {
      el: "nav",
      title: "Your club's workspace",
      body: "Find sponsors, ask the agent, keep your sponsor list, run fan-map offers and approve teammates. This demo is Seattle Sounders FC.",
    },
    {
      el: "run",
      title: "The sponsor-finder agent",
      body: "It reads who the fans are, asks Qloo what each age group loves, checks the news for a reason to call now, and sets aside anyone who clashes with a current sponsor. A saved run is already loaded; a fresh one takes about 3 minutes.",
    },
    {
      el: "results-tabs",
      title: "One analysis, five views",
      body: "Who to call, the best brand in each sponsorship category, the fan mix (adjustable), current sponsors, and every step the agent took.",
    },
    {
      el: "who-to-call",
      title: "Who to call, and why",
      body: "Ranked by fan fit and timing. Each card shows which age group loves it most, the news behind “why now” with sources, and buttons for an activation idea, a fan-map deal, or “Prepare pitch”: a one-page report to send the brand.",
    },
    {
      el: "nav-/ask",
      title: "Ask FanFit",
      body: "Give the agent a goal in plain words, like “Which banks fit our fans?”. It picks its own Qloo tools and shows every step.",
    },
    {
      el: "nav-/team/offers",
      title: "Close the loop",
      body: "Deals you publish appear on the fan map. Here you see claims and redemptions, and whether the fans you predicted are the ones who came.",
    },
  ],
  sponsor: [
    { el: "nav", title: "Your brand's workspace", body: "This demo is Gatorade looking for teams to sponsor." },
    {
      el: "ranking",
      title: "Every team, ranked for your brand",
      body: "NBA, MLS, WNBA and NWSL teams ranked by how much more their fans like Gatorade than a typical big brand, from Qloo's taste data.",
    },
    {
      el: "audience",
      title: "Aim at your audience",
      body: "Pick an age group, gender or interest (say, women 25–29 into fitness) and Qloo re-scores every team for those fans. Arrows show who moved.",
    },
    { el: "filters", title: "Narrow it down", body: "Filter by league, and hide teams that already have a sponsor in your category." },
    {
      el: "team-row",
      title: "Open a team",
      body: "See their fans next to your customers, what both love, whether your category is free, and a matchday activation idea.",
    },
    { el: "nav-/ask", title: "Ask FanFit", body: "Or give the agent a goal, like “Find three NBA teams whose category is still open”." },
  ],
  "sponsor-team": [
    {
      el: "interest",
      title: "Reach out",
      body: "Send the team a note. It lands in their FanFit inbox with your fit score attached; their answer shows up under Outreach.",
    },
    {
      el: "fit",
      title: "How strong the fit is",
      body: "How far above the typical big brand these fans rate yours, and where this team ranks among all teams for you.",
    },
    {
      el: "detail-tabs",
      title: "Why the fit is there",
      body: "Audience overlap by age and gender, the tastes both audiences share, then sponsors, timing and an activation idea.",
    },
  ],
  ask: [
    {
      el: "ask-input",
      title: "Give the agent a goal",
      body: "Ask in plain words. The agent plans, calls FanFit's Qloo tools and answers with picks it can back up.",
    },
    {
      el: "ask-examples",
      title: "Or start from an example",
      body: "Every step appears in the trace on the left. The agent can only name teams, brands and places a tool returned.",
    },
  ],
  fans: [
    {
      el: "taste",
      title: "Your taste",
      body: "Add brands, artists, movies or shows you love. Qloo then orders your teams' deals for you and says why.",
    },
    {
      el: "my-map",
      title: "All your teams on one map",
      body: "Deals and official partners of every team you follow. Filter by team, sort by distance, and claim a code to show at the counter.",
    },
    { el: "heart", title: "Add your teams", body: "Tap the heart on any team you support; its deals and partners join your map." },
    { el: "fan-nav-codes", title: "Your coupons", body: "Codes you claimed are kept here, with a QR code for the counter." },
  ],
  "team-offers": [
    { el: "offer-tabs", title: "Real and demo results", body: "Demo shows offers the businesses never agreed to and simulated claims, kept apart from real ones." },
    { el: "offer-results", title: "Claims and redemptions", body: "How many fans claimed a code and how many used it, by age group." },
    {
      el: "offer-predicted",
      title: "Did the predicted fans come?",
      body: "For each business, the age group FanFit predicted next to who actually claimed. This is how real redemptions test the recommendations.",
    },
    { el: "offer-list", title: "Your live offers", body: "Pause an offer, share the fan-map link, or give the business its redeem link." },
  ],
};

const seenKey = (id: string) => `fanfit-tour:${id}`;

export default function Tour({ id, auto = false, aboveNav = false }: { id: keyof typeof TOURS; auto?: boolean; aboveNav?: boolean }) {
  function start() {
    const steps = TOURS[id]
      .map((s) => ({ s, node: document.querySelector(`[data-tour="${s.el}"]`) }))
      .filter((x): x is { s: Step; node: Element } => !!x.node);
    if (!steps.length) return;
    const d = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next →",
      prevBtnText: "←",
      doneBtnText: "Got it",
      popoverClass: "fanfit-tour",
      stagePadding: 6,
      stageRadius: 14,
      smoothScroll: false, // smooth scrolling left the highlight and popover at stale positions
      // Look each element up when its step shows: lists re-render (Who to call reorders after the exclusivity check).
      steps: steps.map(({ s }) => ({
        element: () => document.querySelector(`[data-tour="${s.el}"]`)!,
        popover: { title: s.title, description: s.body, side: "bottom", align: "start" },
      })),
      onDestroyed: () => {
        try {
          localStorage.setItem(seenKey(id), "1");
        } catch {}
      },
    });
    d.drive();
  }

  // Auto-start once per page for demo accounts, after the page's content (often streamed in) is there.
  useEffect(() => {
    if (!auto) return;
    try {
      if (localStorage.getItem(seenKey(id))) return;
    } catch {
      return;
    }
    const t0 = Date.now();
    const timer = setInterval(() => {
      const all = TOURS[id].every((s) => document.querySelector(`[data-tour="${s.el}"]`));
      if (all || Date.now() - t0 > 8000) {
        clearInterval(timer);
        start();
      }
    }, 400);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page (the cleanup stops a double start)
  }, []);

  return (
    <button
      onClick={start}
      className={`fixed right-4 z-[1100] rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-accent shadow-lg hover:border-accent ${aboveNav ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-4"}`}
    >
      ? Guided tour
    </button>
  );
}
