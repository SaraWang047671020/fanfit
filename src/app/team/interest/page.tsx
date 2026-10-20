import { redirect } from "next/navigation";

// Brand notes moved into Outreach (Received).
export default function TeamInterestPage() {
  redirect("/team/outreach?tab=received");
}
