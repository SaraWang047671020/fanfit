// Landing point for the email link and Google sign-in: trades the one-time code for a session cookie,
// then sends new accounts to onboarding and everyone else to where they were going.
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createClient();
  const { data, error } = code ? await supabase.auth.exchangeCodeForSession(code) : { data: null, error: true };
  if (error || !data?.user) return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, url.origin));

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", data.user.id).single();
  // New accounts pick a type at onboarding, except fans coming from a fan page: those pages offer "continue as a fan".
  const fanPage = next.startsWith("/fans") || next.startsWith("/t/");
  return NextResponse.redirect(new URL(profile?.role || fanPage ? next : "/onboarding", url.origin));
}
