// POST /auth/demo (form field "as": team | sponsor | fan): sign in to a shared demo account and go to its workspace.
import { NextResponse, type NextRequest } from "next/server";
import { type DemoKind, signInAsDemo } from "@/lib/demo-accounts";

const KINDS: DemoKind[] = ["team", "sponsor", "fan"];

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const kind = form.get("as");
  if (typeof kind !== "string" || !KINDS.includes(kind as DemoKind)) return NextResponse.json({ error: "Unknown demo." }, { status: 400 });
  try {
    const home = await signInAsDemo(kind as DemoKind);
    return NextResponse.redirect(new URL(home, request.nextUrl.origin), { status: 303 });
  } catch (err) {
    console.error("demo sign-in failed", err);
    return NextResponse.redirect(new URL("/login?error=demo", request.nextUrl.origin), { status: 303 });
  }
}
