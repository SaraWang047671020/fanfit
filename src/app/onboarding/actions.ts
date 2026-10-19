"use server";

import { redirect } from "next/navigation";
import { category, type RawEntity } from "@/lib/fanfit";
import { get } from "@/lib/qloo";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { createClient } from "@/lib/supabase/server";

export interface BrandOption {
  id: string;
  name: string;
  category: string;
}

/** Qloo brand lookup for the sponsor sign-up form. Signed-in users only (the proxy does not cover Server Actions). */
export async function findBrands(query: string): Promise<BrandOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || query.trim().length < 2) return [];
  return get("/search", { query: query.trim(), types: "urn:entity:brand", take: 6 }, (raw) =>
    ((raw as { results?: RawEntity[] }).results ?? []).map((e) => ({ id: e.entity_id, name: e.name, category: category(e) })),
  );
}

export async function joinTeam(teamId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_team", { p_team: teamId });
  if (error) return { error: error.message };
  redirect("/fanfit");
}

const CATEGORY_KEYS = new Set<string>(SPONSOR_CATEGORIES.map((c) => c.key));

export async function createSponsor(name: string, qlooId: string | null, categories: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_sponsor", {
    p_name: name,
    p_qloo_id: qlooId ?? "",
    p_categories: categories.filter((c) => CATEGORY_KEYS.has(c)),
  });
  if (error) return { error: error.message };
  redirect("/sponsor");
}
