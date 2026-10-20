// Daily limits on the actions that spend Qloo quota and OpenAI web searches. Results served from the saved runs or the
// Qloo cache are not counted. Without the secret key (local runs without it) limits are off.
import { adminClient } from "./supabase/admin";

export type UsageKind = "run" | "activation" | "team_check" | "agent";

// Per account per day, and across the whole site per day (the Qloo key allows 10,000 calls a month; a fresh run ~200).
const PER_USER: Record<UsageKind, number> = { run: 3, activation: 10, team_check: 10, agent: 15 };
const SITE: Record<UsageKind, number> = { run: 20, activation: 100, team_check: 100, agent: 150 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Error message when the limit is reached, else null. Records the use when allowed. */
export async function takeUsage(userId: string, kind: UsageKind): Promise<string | null> {
  const db = adminClient();
  if (!db) return null;
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [mine, all] = await Promise.all([
    db.from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).gte("created_at", since),
    db.from("usage_events").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since),
  ]);
  if ((mine.count ?? 0) >= PER_USER[kind])
    return `Daily limit reached for this account (${PER_USER[kind]} per day). Saved results are still available; try again tomorrow.`;
  if ((all.count ?? 0) >= SITE[kind]) return "FanFit has reached today's limit for new analyses. Saved results are still available; try again tomorrow.";
  await db.from("usage_events").insert({ user_id: userId, kind });
  return null;
}
