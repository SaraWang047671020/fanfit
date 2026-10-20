import { type ActivationRequest, buildActivation } from "@/lib/fanfit-activation";
import { AGES, type Age } from "@/lib/fanfit-score";
import { errorResponse } from "@/lib/http";
import { currentUser } from "@/lib/supabase/server";

// ~6 Qloo calls + 1–2 model calls (+ the team's sponsor search if it is not cached yet).
export const maxDuration = 120;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/fanfit/activation { team: {id,name,city}, partner: {id,name,kind,category}, driver, whyNow? }
export async function POST(req: Request) {
  if (process.env.LIVE_RUNS_DISABLED === "true")
    return Response.json({ error: "Live runs are disabled on this deployment." }, { status: 503 });
  const { profile } = await currentUser();
  if (!((profile?.role === "team" && profile.team_approved) || profile?.role === "sponsor"))
    return Response.json({ error: "Available to approved team accounts and sponsors." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    team?: Record<string, unknown>;
    partner?: Record<string, unknown>;
    driver?: unknown;
    whyNow?: unknown;
  };
  const kind = b.partner?.kind === "place" ? "place" : b.partner?.kind === "brand" ? "brand" : null;
  const input: ActivationRequest = {
    team: { id: str(b.team?.id, 64), name: str(b.team?.name, 80), city: str(b.team?.city, 80) },
    partner: { id: str(b.partner?.id, 64), name: str(b.partner?.name, 120), kind: kind ?? "brand", category: str(b.partner?.category, 80) },
    driver: AGES.includes(b.driver as Age) ? (b.driver as Age) : "25_to_29",
    whyNow: str(b.whyNow, 400),
  };
  if (!kind || !input.team.id || !input.team.name || !input.team.city || !input.partner.id || !input.partner.name)
    return Response.json({ error: "Missing team or partner." }, { status: 400 });

  try {
    return Response.json(await buildActivation(input));
  } catch (err) {
    return errorResponse(err);
  }
}
