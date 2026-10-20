// Shared demo accounts behind "Try as team / sponsor / fan". Created on first use with the secret key and given their
// role (Seattle Sounders FC, approved; Gatorade; a fan following Seattle), then signed in with a password that lives
// only in the server environment (DEMO_PASSWORD). Database rules keep demo accounts from damaging shared data.
import { get } from "./qloo";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type DemoKind = "team" | "sponsor" | "fan";

const DEMO_TEAM = "Seattle Sounders FC";
const DEMO_BRAND = "Gatorade";
export const DEMO: Record<DemoKind, { email: string; name: string; home: string }> = {
  team: { email: "demo-team@example.com", name: "Demo (Seattle Sounders FC)", home: "/fanfit" },
  sponsor: { email: "demo-sponsor@example.com", name: "Demo (Gatorade)", home: "/sponsor" },
  fan: { email: "demo-fan@example.com", name: "Demo fan", home: "/fans" },
};

async function userId(email: string) {
  const db = adminClient()!;
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users.find((u) => u.email === email);
    if (hit || !data || data.users.length < 200) return hit?.id ?? null;
  }
  return null;
}

/** Make sure the demo user exists with the current password and its role, then return its id. */
async function ensureDemoUser(kind: DemoKind, password: string) {
  const db = adminClient()!;
  const { email, name } = DEMO[kind];
  let id = await userId(email);
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    id = data.user.id;
  } else {
    await db.auth.admin.updateUserById(id, { password }); // the env password may have been rotated
  }

  const { data: team } = await db.from("teams").select("id").eq("name", DEMO_TEAM).single<{ id: string }>();
  if (!team) throw new Error(`Demo team ${DEMO_TEAM} is missing.`);
  const { data: profile } = await db.from("profiles").select("role, sponsor_id").eq("user_id", id).single<{ role: string | null; sponsor_id: string | null }>();

  if (kind === "team") {
    await db.from("profiles").update({ role: "team", team_id: team.id, sponsor_id: null, team_approved: true, is_demo: true, display_name: name }).eq("user_id", id);
  } else if (kind === "sponsor") {
    let sponsorId = profile?.role === "sponsor" ? profile.sponsor_id : null;
    if (!sponsorId) {
      const qlooId = await get("/search", { query: DEMO_BRAND, types: "urn:entity:brand", take: 5 }, (raw) =>
        ((raw as { results?: { entity_id: string; name: string }[] }).results ?? []).find((e) => e.name === DEMO_BRAND)?.entity_id ?? null,
      );
      const { data: s, error } = await db.from("sponsors").insert({ name: DEMO_BRAND, qloo_id: qlooId, categories: ["beverage"] }).select("id").single();
      if (error) throw error;
      sponsorId = s.id;
    }
    await db.from("profiles").update({ role: "sponsor", sponsor_id: sponsorId, team_id: null, is_demo: true, display_name: name }).eq("user_id", id);
  } else {
    await db.from("profiles").update({ role: "fan", team_id: null, sponsor_id: null, is_demo: true, display_name: name }).eq("user_id", id);
    await db.from("fan_follows").upsert({ user_id: id, team_id: team.id }, { onConflict: "user_id,team_id", ignoreDuplicates: true });
  }
  return id;
}

/** Sign the current browser in as a demo account (session cookies set). Returns where to go next. */
export async function signInAsDemo(kind: DemoKind) {
  const password = process.env.DEMO_PASSWORD;
  if (!password || !adminClient()) throw new Error("The demo is not configured on this server.");
  const supabase = await createClient();
  let { error } = await supabase.auth.signInWithPassword({ email: DEMO[kind].email, password });
  if (error) {
    await ensureDemoUser(kind, password);
    ({ error } = await supabase.auth.signInWithPassword({ email: DEMO[kind].email, password }));
    if (error) throw error;
  } else {
    // Existing account: re-assert its role in case someone's earlier run left it half set up.
    const { data } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("role, is_demo").eq("user_id", data.user!.id).single();
    if (p?.role !== kind || !p?.is_demo) await ensureDemoUser(kind, password);
  }
  return DEMO[kind].home;
}
