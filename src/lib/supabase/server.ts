// Supabase client for Server Components, Server Actions and Route Handlers, acting as the signed-in user
// (row level security applies). The session lives in cookies; src/proxy.ts refreshes it on each navigation.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the proxy has already refreshed the session for this request.
        }
      },
    },
  });
}

export type Profile = {
  user_id: string;
  display_name: string | null;
  role: "team" | "sponsor" | "fan" | null;
  team_id: string | null;
  sponsor_id: string | null;
  team_approved: boolean; // team accounts: approved by an admin or a teammate (pending until then)
  is_admin: boolean;
  is_demo: boolean; // shared demo account ("Try the demo"), with some actions switched off
};

/**
 * The signed-in user and their profile, or nulls when signed out. Cached per request: the page and the top bar both
 * ask, and each ask is a round trip to Supabase Auth and Postgres.
 */
export const currentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", data.user.id).single<Profile>();
  return { supabase, user: data.user, profile };
});
