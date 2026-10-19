// Signed-in strip at the top of account pages: who you are, which org, sign out.
export default function AccountBar({ name, org, role }: { name: string; org: string; role: "team" | "sponsor" }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
      <span>
        {name} · <span className="text-text">{org}</span> ({role === "team" ? "team account" : "sponsor account"})
      </span>
      <form action="/auth/signout" method="post">
        <button className="rounded-full border border-line px-3 py-1 hover:border-accent hover:text-text">Sign out</button>
      </form>
    </div>
  );
}
