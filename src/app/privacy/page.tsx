import type { Metadata } from "next";
import { LegalPage, Section } from "../LegalPage";

export const metadata: Metadata = { title: "FanFit · Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 19, 2026">
      <Section title="What FanFit collects">
        <ul>
          <li>Your email address, and your name if you sign in with Google (from your Google profile).</li>
          <li>Your account type (team or sponsor), the team you represent or the brand and sponsorship categories you enter.</li>
          <li>Sponsors a team account lists for its team.</li>
          <li>Standard request logs kept by our hosting providers (for example IP address and time of request).</li>
        </ul>
      </Section>
      <Section title="How it is used">
        <p>
          To sign you in, show you the side of FanFit that matches your account, and run the analyses you ask for. We do not sell
          your data or use it for advertising.
        </p>
      </Section>
      <Section title="Who sees it">
        <ul>
          <li>Your email, name and brand details are visible only to you.</li>
          <li>
            Signed-in users see the team directory, whether a team has an account on FanFit (not who holds it), and the sponsor
            lists teams enter.
          </li>
        </ul>
      </Section>
      <Section title="Service providers">
        <ul>
          <li>Supabase (sign-in and database, hosted in Tokyo, Japan).</li>
          <li>Vercel (website hosting).</li>
          <li>Google, if you choose to sign in with Google.</li>
          <li>
            Qloo and OpenAI receive team names, brand names, cities and age groups to produce the analyses. No personal data about
            you is sent to them.
          </li>
        </ul>
      </Section>
      <Section title="Cookies">
        <p>FanFit uses only the cookies needed to keep you signed in. There are no advertising or analytics trackers.</p>
      </Section>
      <Section title="Keeping and deleting your data">
        <p>
          We keep your account data until you ask us to delete it. To delete your account or get a copy of your data, email us at
          the address below.
        </p>
      </Section>
    </LegalPage>
  );
}
