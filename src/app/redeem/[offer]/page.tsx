import type { Metadata } from "next";
import RedeemForm from "./RedeemForm";

export const metadata: Metadata = { title: "FanFit · Redeem a code", robots: { index: false } };

/** Staff page behind each business's redemption link (/redeem/<offer>?k=<key>). The key is checked when redeeming. */
export default async function RedeemPage({ params, searchParams }: PageProps<"/redeem/[offer]">) {
  const { offer } = await params;
  const { k } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit · staff</p>
      <h1 className="mt-2 text-3xl font-bold">Redeem a fan code</h1>
      <p className="mt-3 text-sm text-muted">Type the 6-character code the fan shows you. Each code works once.</p>
      <div className="mt-8">
        {typeof k === "string" && k ? (
          <RedeemForm offer={offer} redeemKey={k} />
        ) : (
          <p className="text-sm text-loss">This link is missing its key. Ask the team for the full redemption link.</p>
        )}
      </div>
    </main>
  );
}
