// Checks the account schema and row level security against LOCAL Supabase (creates throwaway users with a password).
//   npx supabase start && npm run db:check
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const ok = (label: string, cond: boolean, extra = "") => console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
async function user(email: string) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.auth.signUp({ email, password: "local-test-only-1" });
  if (error) throw error;
  return c;
}
const stamp = Date.now();
const anon = createClient(url, key, { auth: { persistSession: false } });
ok("anon cannot read teams", ((await anon.from("teams").select("id")).data ?? []).length === 0);

const a = await user(`team-${stamp}@example.test`);
const { data: pa } = await a.from("profiles").select("*").single();
ok("new user gets empty profile", pa?.role === null && !!pa?.display_name, `name=${pa?.display_name}`);
const { data: teams } = await a.from("teams").select("id, name");
ok("signed-in user reads team directory", (teams?.length ?? 0) === 79, `n=${teams?.length}`);
const seattle = teams!.find((t) => t.name === "Seattle Sounders FC")!, other = teams!.find((t) => t.name === "Austin FC")!;
ok("join_team works", !(await a.rpc("join_team", { p_team: seattle.id })).error);
ok("cannot choose account type twice", !!(await a.rpc("join_team", { p_team: other.id })).error);
ok("cannot change role directly", !!(await a.from("profiles").update({ role: "sponsor" }).eq("user_id", pa!.user_id)).error);
ok("can edit display name", !(await a.from("profiles").update({ display_name: "Sounders sales" }).eq("user_id", pa!.user_id)).error);
ok("team adds own sponsor", !(await a.from("team_sponsors").insert({ team_id: seattle.id, name: `Test sponsor ${stamp}`, category: "airline" })).error);
ok("team cannot add another team's sponsor", !!(await a.from("team_sponsors").insert({ team_id: other.id, name: "Fake", category: "airline" })).error);
const { data: claimed } = await a.from("teams").select("claimed_at").eq("id", seattle.id).single();
ok("team marked as claimed", !!claimed?.claimed_at);

const b = await user(`brand-${stamp}@example.test`);
const { data: sid, error: se } = await b.rpc("create_sponsor", { p_name: "Tillamook", p_qloo_id: "x", p_categories: ["beverage"] });
ok("create_sponsor works", !se && !!sid, se?.message);
ok("sponsor reads own row", ((await b.from("sponsors").select("id")).data ?? []).length === 1);
ok("team cannot read sponsor rows", ((await a.from("sponsors").select("id")).data ?? []).length === 0);
ok("sponsor reads team sponsor lists", ((await b.from("team_sponsors").select("name").eq("team_id", seattle.id)).data ?? []).length >= 1);
ok("sponsor cannot edit team sponsor lists", ((await b.from("team_sponsors").delete().eq("team_id", seattle.id).select()).data ?? []).length === 0);
ok("sponsor cannot read other profiles", ((await b.from("profiles").select("user_id")).data ?? []).length === 1);
