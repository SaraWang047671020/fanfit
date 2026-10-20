// Refreshes the Supabase session cookie on every matched request and keeps signed-out visitors out of
// account pages and the paid APIs (FanFit runs call Qloo and OpenAI web search).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/fanfit", "/sponsor", "/team", "/admin", "/ask", "/onboarding", "/api/fanfit", "/api/sponsor", "/api/ask"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    // Auth not configured (see .env.example): keep account pages and paid APIs closed, leave the rest alone.
    return isProtected ? new NextResponse("Sign-in is not configured on this server.", { status: 503 }) : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // getUser() validates the token with Supabase Auth and refreshes it when expired.
  const { data } = await supabase.auth.getUser();
  if (!data.user && isProtected) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Everything except static assets and the web app manifest.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
