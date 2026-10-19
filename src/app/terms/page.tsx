import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "../LegalPage";

export const metadata: Metadata = { title: "FanFit · Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 19, 2026">
      <Section title="The service">
        <p>
          FanFit is an early-stage tool that suggests sponsorship matches between sports teams and brands using Qloo taste data and
          web search. It is provided as is, may change or stop, and comes with no guarantee of availability or accuracy.
        </p>
      </Section>
      <Section title="Check before you act">
        <p>
          Fit scores, sponsor lists and news summaries can be incomplete or wrong. Verify them before contacting anyone or making a
          business decision. FanFit does not give legal, financial or investment advice.
        </p>
      </Section>
      <Section title="Your account">
        <ul>
          <li>Sign up only for a team or brand you work for, and keep the details you enter accurate.</li>
          <li>Do not share your account, scrape the service, or use it to overload Qloo, OpenAI or our servers.</li>
          <li>We may suspend accounts that break these terms.</li>
        </ul>
      </Section>
      <Section title="Liability">
        <p>To the extent the law allows, FanFit is not liable for decisions made using its results or for indirect losses.</p>
      </Section>
      <Section title="Privacy">
        <p>
          How we handle your data is described in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
