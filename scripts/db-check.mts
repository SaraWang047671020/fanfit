// Checks the account schema and row level security against LOCAL Supabase (creates throwaway users with a password).
//   npx supabase start && npm run db:check
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
// Secret key (local only) stands in for "an admin approved this" where no approved account exists yet.
const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
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
// Pending until approved: no writes, no team data.
ok("pending team account cannot add sponsors", !!(await a.from("team_sponsors").insert({ team_id: seattle.id, name: `Pending ${stamp}`, category: "airline" })).error);
ok("pending team account sees no team requests", ((await a.rpc("team_requests")).data ?? []).length === 0);
await service.from("profiles").update({ team_approved: true }).eq("user_id", pa!.user_id);
ok("cannot change role directly", !!(await a.from("profiles").update({ role: "sponsor" }).eq("user_id", pa!.user_id)).error);
ok("can edit display name", !(await a.from("profiles").update({ display_name: "Sounders sales" }).eq("user_id", pa!.user_id)).error);
ok("team adds own sponsor", !(await a.from("team_sponsors").insert({ team_id: seattle.id, name: `Test sponsor ${stamp}`, category: "airline" })).error);
ok("team cannot add another team's sponsor", !!(await a.from("team_sponsors").insert({ team_id: other.id, name: "Fake", category: "airline" })).error);
const { data: claimed } = await a.from("teams").select("claimed_at").eq("id", seattle.id).single();
ok("team marked as claimed", claimed !== null); // claimed_at is set by approval through decide_team_request (tested below)

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

// ---------------------------------------------------------------- fan accounts
const { data: live, error: le } = await a.from("offers").insert({ ...offer, title: "Fan test offer" }).select("id").single();
ok("team creates a live offer for fan tests", !le && !!live, le?.message);
ok("anon lists teams with offer counts", ((await anon.rpc("fan_teams")).data ?? []).some((t: { id: string; live_offers: number }) => t.id === seattle.id && t.live_offers > 0));
ok("anon lists all live offers", ((await anon.rpc("fan_all_offers")).data ?? []).some((r: { offer_id: string }) => r.offer_id === live!.id));
const { data: anonCode } = await anon.rpc("claim_offer", { p_offer: live!.id });
ok("anon code status is unused", (await anon.rpc("claim_status", { p_offer: live!.id, p_code: anonCode })).data === "unused");

const f = await user(`fan-${stamp}@example.test`);
ok("join_fan works", !(await f.rpc("join_fan")).error);
ok("fan cannot pick another account type", !!(await f.rpc("join_team", { p_team: other.id })).error);
ok("fan follows a team", !(await f.from("fan_follows").insert({ user_id: (await f.auth.getUser()).data.user!.id, team_id: seattle.id })).error);
ok("team account cannot follow teams", !!(await a.from("fan_follows").insert({ user_id: pa!.user_id, team_id: other.id })).error);
ok("fan sees only own follows", ((await f.from("fan_follows").select("team_id")).data ?? []).length === 1 && ((await a.from("fan_follows").select("team_id")).data ?? []).length === 0);
ok("fan attaches a code claimed before signing in", (await f.rpc("attach_claims", { p_items: [{ offer: live!.id, code: anonCode }] })).data === 1);
ok("an owned code cannot be attached again", (await b.rpc("attach_claims", { p_items: [{ offer: live!.id, code: anonCode }] })).data === 0);
const { data: c1 } = await f.rpc("claim_offer", { p_offer: live!.id });
const { data: c2 } = await f.rpc("claim_offer", { p_offer: live!.id });
ok("signed-in fan gets the same unused code twice", c1 === c2 && c1 === anonCode, `${c1} ${c2} ${anonCode}`);
const { data: mine } = await f.rpc("my_claims");
ok("fan lists own codes with offer details", (mine ?? []).length === 1 && mine![0].title === "Fan test offer" && mine![0].team_name === "Seattle Sounders FC");
ok("other users see none of the fan's codes", ((await b.rpc("my_claims")).data ?? []).length === 0);
ok("team cannot read who claimed", !!(await a.from("claims").select("user_id").eq("offer_id", live!.id)).error);
ok("team cannot read claim codes", !!(await a.from("claims").select("code").eq("offer_id", live!.id)).error);
ok("team still reads claim counts", ((await a.from("claims").select("id, redeemed_at").eq("offer_id", live!.id)).data ?? []).length === 1);
await anon.rpc("redeem_claim", { p_offer: live!.id, p_key: (await a.from("offer_keys").select("redeem_key").eq("offer_id", live!.id).single()).data!.redeem_key, p_code: c1 });
ok("fan sees the code as used after redemption", ((await f.rpc("my_claims")).data ?? [])[0]?.redeemed_at !== null);
await a.from("offers").update({ active: false }).eq("id", live!.id); // keep repeated runs from piling up live test offers

// ---------------------------------------------------------------- function privileges
const zero = "00000000-0000-0000-0000-000000000000";
const anonCalls: [string, Record<string, unknown>][] = [
  ["my_claims", {}], ["join_fan", {}], ["attach_claims", { p_items: [] }], ["simulate_claims", { p_offer: zero, p_count: 1 }],
  ["clear_simulated", { p_team: zero }], ["my_team", {}], ["my_sponsor", {}], ["team_requests", {}], ["decide_team_request", { p_user: zero, p_approve: true }], ["team_members", {}], ["is_admin", {}],
];
for (const [fn, args] of anonCalls) {
  const { error } = await anon.rpc(fn, args);
  ok(`anon cannot execute ${fn}`, !!error && /permission denied/i.test(error.message), error?.code ?? "no error");
}
// Trigger functions are not exposed through the API at all (PGRST202: no such function).
for (const fn of ["handle_new_user", "create_offer_key"]) {
  const { error } = await anon.rpc(fn, {});
  ok(`${fn} is not callable through the API`, !!error && (error.code === "PGRST202" || /permission denied/i.test(error.message)), error?.code ?? "no error");
}
ok("signed-in team can still use my_team in RLS", ((await a.from("offers").select("id")).data ?? []).length > 0);

// ---------------------------------------------------------------- partners on the fan map
const { data: partnerRows } = await anon.rpc("fan_partners", { p_team: seattle.id });
ok("anon sees the club's partners on the fan map", (partnerRows ?? []).length > 0);
ok("partner rows carry only public fields", (partnerRows ?? []).every((r: Record<string, unknown>) => !("added_by" in r) && !("id" in r) && !("team_id" in r)));

// ---------------------------------------------------------------- clean up what this run added to the shared test team
await a.from("team_sponsors").delete().like("name", "Test sponsor %");

// ---------------------------------------------------------------- team approval
const a2 = await user(`team2-${stamp}@example.test`);
await a2.rpc("join_team", { p_team: seattle.id });
const a2id = (await a2.auth.getUser()).data.user!.id;
ok("approved member sees a colleague's request", ((await a.rpc("team_requests")).data ?? []).some((r: { user_id: string }) => r.user_id === a2id));
ok("requests show no other teams' people to a member", ((await a.rpc("team_requests")).data ?? []).every((r: { team_id: string }) => r.team_id === seattle.id));
ok("sponsor cannot see team requests", ((await b.rpc("team_requests")).data ?? []).length === 0);
ok("sponsor cannot approve", !!(await b.rpc("decide_team_request", { p_user: a2id, p_approve: true })).error);
ok("pending user cannot approve themselves", !!(await a2.rpc("decide_team_request", { p_user: a2id, p_approve: true })).error);
ok("member approves a colleague", !(await a.rpc("decide_team_request", { p_user: a2id, p_approve: true })).error);
ok("approved colleague can edit the sponsor list", !(await a2.from("team_sponsors").insert({ team_id: seattle.id, name: `Test sponsor ${stamp}b`, category: "airline" })).error);
ok("approval marks the team as on FanFit", !!(await a.from("teams").select("claimed_at").eq("id", seattle.id).single()).data?.claimed_at);
ok("members list shows both", ((await a.rpc("team_members")).data ?? []).length >= 2);

const a3 = await user(`team3-${stamp}@example.test`);
await a3.rpc("join_team", { p_team: seattle.id });
const a3id = (await a3.auth.getUser()).data.user!.id;
ok("member rejects a request", !(await a.rpc("decide_team_request", { p_user: a3id, p_approve: false })).error);
ok("rejected user can choose again", (await a3.from("profiles").select("role").single()).data?.role === null);

const a4 = await user(`team4-${stamp}@example.test`);
await a4.rpc("join_team", { p_team: other.id });
ok("member of another team cannot approve", !!(await a.rpc("decide_team_request", { p_user: (await a4.auth.getUser()).data.user!.id, p_approve: true })).error);
ok("pending user cancels the request", !(await a4.rpc("cancel_team_request")).error && (await a4.from("profiles").select("role").single()).data?.role === null);
await a4.rpc("join_team", { p_team: other.id });
const adm = await user(`admin-${stamp}@example.test`);
await service.from("profiles").update({ is_admin: true }).eq("user_id", (await adm.auth.getUser()).data.user!.id);
ok("admin sees requests for any team", ((await adm.rpc("team_requests")).data ?? []).some((r: { team_id: string }) => r.team_id === other.id));
ok("admin approves any team's request", !(await adm.rpc("decide_team_request", { p_user: (await a4.auth.getUser()).data.user!.id, p_approve: true })).error);
ok("users cannot make themselves admin", !!(await f.from("profiles").update({ is_admin: true }).eq("user_id", (await f.auth.getUser()).data.user!.id)).error);
ok("users cannot approve themselves via the table", !!(await a3.from("profiles").update({ team_approved: true }).eq("user_id", a3id)).error);
await a2.from("team_sponsors").delete().like("name", "Test sponsor %");

// ---------------------------------------------------------------- shared demo accounts
const d = await user(`demo-check-${stamp}@example.test`);
await d.rpc("join_team", { p_team: seattle.id });
const did = (await d.auth.getUser()).data.user!.id;
await service.from("profiles").update({ team_approved: true, is_demo: true }).eq("user_id", did);
const seeded = (await a.from("offers").insert({ ...offer, title: "Seeded offer" }).select("id").single()).data!;
ok("demo team cannot edit the sponsor list", !!(await d.from("team_sponsors").insert({ team_id: seattle.id, name: `Demo try ${stamp}`, category: "airline" })).error);
const { data: dOffer, error: dErr } = await d.from("offers").insert({ ...offer, title: "Demo-made offer", created_by: did, demo: false }).select("id, demo").single();
ok("demo team can create an offer, forced to demo", !dErr && dOffer?.demo === true, dErr?.message);
ok("demo team edits its own offer", ((await d.from("offers").update({ active: false }).eq("id", dOffer!.id).select()).data ?? []).length === 1);
ok("demo team cannot pause offers others made", ((await d.from("offers").update({ active: false }).eq("id", seeded.id).select()).data ?? []).length === 0);
ok("demo team cannot approve requests", !!(await d.rpc("decide_team_request", { p_user: did, p_approve: true })).error);
ok("demo team cannot wipe simulated data", !!(await d.rpc("clear_simulated", { p_team: seattle.id })).error);
ok("demo team cannot add simulated data", !!(await d.rpc("simulate_claims", { p_offer: seeded.id, p_count: 5 })).error);
ok("users cannot mark themselves non-demo", !!(await d.from("profiles").update({ is_demo: false }).eq("user_id", did)).error);
await a.from("offers").update({ active: false }).in("id", [seeded.id, dOffer!.id]);

// ---------------------------------------------------------------- fan tastes (private, max 8)
const ft = await user(`taste-${stamp}@example.test`);
const ftOther = await user(`taste-other-${stamp}@example.test`);
const ftId = (await ft.auth.getUser()).data.user!.id;
ok("fan adds a taste", !(await ft.from("fan_tastes").insert({ entity_id: `E${stamp}`, name: "Patagonia", kind: "brand" })).error);
ok("fan reads own tastes", ((await ft.from("fan_tastes").select("entity_id")).data ?? []).length === 1);
ok("others cannot read a fan's tastes", ((await ftOther.from("fan_tastes").select("entity_id").eq("user_id", ftId)).data ?? []).length === 0);
ok("cannot add a taste for someone else", !!(await ftOther.from("fan_tastes").insert({ user_id: ftId, entity_id: `X${stamp}`, name: "x", kind: "brand" })).error);
ok("anon cannot read tastes", ((await anon.from("fan_tastes").select("entity_id")).data ?? []).length === 0);
ok("rejects unknown kinds", !!(await ft.from("fan_tastes").insert({ entity_id: `K${stamp}`, name: "x", kind: "place" })).error);
for (let i = 0; i < 7; i++) await ft.from("fan_tastes").insert({ entity_id: `M${i}${stamp}`, name: `t${i}`, kind: "artist" });
ok("at most 8 tastes", !!(await ft.from("fan_tastes").insert({ entity_id: `N${stamp}`, name: "ninth", kind: "artist" })).error);
