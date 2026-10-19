// Shared layout for the privacy policy and terms pages.
import Link from "next/link";

export const CONTACT_EMAIL = "sara931020@gmail.com";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← FanFit
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
      <div className="mt-8 space-y-8">{children}</div>
      <p className="mt-10 text-sm text-muted">
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent">{CONTACT_EMAIL}</a>
      </p>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-muted [&_a]:text-accent [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}
