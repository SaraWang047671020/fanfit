// Shown the moment a link is clicked, while the server builds the page (loading.tsx files use it). Shapes follow the
// app's pages: the top bar, a heading, then panels.
export default function Skeleton({ bar = true }: { bar?: boolean }) {
  return (
    <main className="mx-auto w-full max-w-6xl animate-pulse px-4 py-10 sm:px-6 sm:py-14" aria-busy="true" aria-label="Loading">
      {bar && <div className="h-12 rounded-2xl border border-line bg-panel" />}
      <div className="mt-8 h-3 w-32 rounded-full bg-line" />
      <div className="mt-3 h-9 w-2/3 rounded-xl bg-line" />
      <div className="mt-3 h-4 w-1/2 rounded-full bg-line/70" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-3xl border border-line bg-panel" />
        <div className="h-40 rounded-3xl border border-line bg-panel" />
      </div>
      <div className="mt-4 h-56 rounded-3xl border border-line bg-panel" />
    </main>
  );
}
