// Daily ping from Vercel Cron (vercel.json). Touches the database so Supabase's free plan does not pause the project
// after a week without activity (it must stay up through judging). Returns nothing sensitive.
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = adminClient();
  if (!db) return Response.json({ ok: false, db: "not configured" }, { status: 503 });
  const { error } = await db.from("teams").select("id").limit(1);
  return Response.json({ ok: !error }, { status: error ? 503 : 200 });
}
