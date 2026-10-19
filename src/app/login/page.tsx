import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { currentUser } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "FanFit · Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : null);
  const { user } = await currentUser();
  if (user) redirect(target);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit</p>
      <h1 className="mt-2 text-3xl font-bold">Sign in</h1>
      <p className="mt-3 text-muted">Teams find sponsors their fans already love; sponsors find the teams whose fans love them.</p>
      {error && <p className="mt-4 text-sm text-loss">Sign-in failed. Try again, or use the other method.</p>}
      <div className="mt-8">
        <LoginForm next={target} />
      </div>
    </main>
  );
}
