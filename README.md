# FanFit

Match sports teams and sponsors on what fans actually love, using [Qloo](https://qloo.com) taste data.

- **Teams** (`/fanfit`): brands and local businesses their fans love by age group, best fit per sponsorship category,
  current sponsors and a reason to call each brand now (web search), and matchday activation ideas.
- **Sponsors** (`/sponsor`): every NBA, MLS, WNBA and NWSL team ranked by how much its fans like the brand, and a page per
  team explaining the fit (audiences, shared tastes and traits), whether the category is taken, and why now.

Every brand, artist and place comes from Qloo; the model (OpenAI) only searches the news, classifies and writes.

## Stack

Next.js 16 (App Router; `src/proxy.ts` is the old middleware), Supabase (auth + Postgres + row level security), Qloo
Insights API, OpenAI Responses API with web search. Deploys to Vercel.

## Local setup

```bash
npm install
cp .env.example .env.local          # fill in QLOO_API_KEY and OPENAI_API_KEY
npx supabase start                  # needs Docker; prints the local URL and publishable key for .env.local
npx supabase db reset               # applies supabase/migrations and seeds the 79 teams
npm run dev
```

Sign-in emails go to the local Mailpit inbox at http://127.0.0.1:54324.

| Script | What it does |
| --- | --- |
| `npm run db:check` | 16 row-level-security checks against local Supabase (creates throwaway users) |
| `npm run fanfit -- "Austin FC" "Austin, TX"` | Runs the team pipeline in the terminal |

## Data

- `supabase/migrations/` — accounts schema: teams, sponsors, profiles, team_sponsors, onboarding functions, RLS.
- `supabase/seed.sql` — team directory with each team's Qloo ID and its 40-brand baseline (`fit_mean`, `fit_sd`),
  which the sponsor ranking uses to compare teams fairly.

## Environment

See `.env.example`. `LIVE_RUNS_DISABLED=true` turns off every route that spends Qloo/OpenAI calls.
