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

// ---------------------------------------------------------------- offers and claims (fan map)
const offer = { team_id: seattle.id, place_qloo_id: "test-place", place_name: "Test Cafe", title: "15% off with a match ticket", fit: 80, created_by: pa!.user_id };
const { data: o, error: oe } = await a.from("offers").insert(offer).select("id").single();
ok("team creates offer for own team", !oe && !!o, oe?.message);
ok("team cannot create offer for another team", !!(await a.from("offers").insert({ ...offer, team_id: other.id })).error);
ok("sponsor cannot create offers", !!(await b.from("offers").insert(offer)).error);
const { data: keyRow } = await a.from("offer_keys").select("redeem_key").eq("offer_id", o!.id).single();
ok("team reads its redemption key", !!keyRow?.redeem_key);
ok("sponsor cannot read redemption keys", ((await b.from("offer_keys").select("redeem_key")).data ?? []).length === 0);
ok("anon cannot read offers table", ((await anon.from("offers").select("id")).data ?? []).length === 0);
const { data: fan } = await anon.rpc("fan_offers", { p_team: seattle.id });
ok("anon sees the offer on the fan map", (fan ?? []).some((r: { offer_id: string }) => r.offer_id === o!.id));
ok("fan map rows carry no secrets", !JSON.stringify(fan).includes(keyRow!.redeem_key));
const { data: code, error: ce } = await anon.rpc("claim_offer", { p_offer: o!.id, p_age: "25_to_29" });
ok("anon claims a code", !ce && typeof code === "string" && code.length === 6, ce?.message ?? String(code));
ok("anon cannot read claims", ((await anon.from("claims").select("id")).data ?? []).length === 0);
ok("anon cannot redeem directly", !!(await anon.from("claims").update({ redeemed_at: new Date().toISOString() }).eq("code", code)).error ||
  ((await anon.from("claims").update({ redeemed_at: new Date().toISOString() }).eq("code", code).select()).data ?? []).length === 0);
ok("redeem with wrong key is denied", (await anon.rpc("redeem_claim", { p_offer: o!.id, p_key: "nope", p_code: code })).data === "denied");
ok("redeem with key works", (await anon.rpc("redeem_claim", { p_offer: o!.id, p_key: keyRow!.redeem_key, p_code: code.toLowerCase() })).data === "ok");
ok("a code redeems only once", (await anon.rpc("redeem_claim", { p_offer: o!.id, p_key: keyRow!.redeem_key, p_code: code })).data === "used");
ok("unknown code is invalid", (await anon.rpc("redeem_claim", { p_offer: o!.id, p_key: keyRow!.redeem_key, p_code: "ZZZZZZ" })).data === "invalid");
ok("team simulates claims", !(await a.rpc("simulate_claims", { p_offer: o!.id, p_count: 10 })).error);
ok("sponsor cannot simulate", !!(await b.rpc("simulate_claims", { p_offer: o!.id, p_count: 10 })).error);
const { data: cl } = await a.from("claims").select("simulated").eq("offer_id", o!.id);
ok("team reads its claims (1 real + 10 simulated)", cl?.length === 11 && cl.filter((c) => c.simulated).length === 10, `n=${cl?.length}`);
ok("simulated codes cannot be redeemed", (await anon.rpc("redeem_claim", { p_offer: o!.id, p_key: keyRow!.redeem_key, p_code: "SIM00001" })).data === "invalid");
ok("team clears simulated claims", !(await a.rpc("clear_simulated", { p_team: seattle.id })).error &&
  ((await a.from("claims").select("id").eq("offer_id", o!.id)).data ?? []).length === 1);
ok("team pauses its offer", !(await a.from("offers").update({ active: false }).eq("id", o!.id)).error);
ok("paused offer leaves the fan map", !((await anon.rpc("fan_offers", { p_team: seattle.id })).data ?? []).some((r: { offer_id: string }) => r.offer_id === o!.id));
ok("paused offer cannot be claimed", !!(await anon.rpc("claim_offer", { p_offer: o!.id })).error);
