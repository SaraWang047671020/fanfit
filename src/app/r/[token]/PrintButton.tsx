"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:border-accent">
      Save as PDF
    </button>
  );
}
