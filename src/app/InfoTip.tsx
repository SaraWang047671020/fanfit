"use client";

// "ⓘ How is this calculated?": a small button next to a number or ranking that opens a short, plain explanation of
// what Qloo data it uses and what it does not mean. Tap to open and close; Esc or a tap elsewhere closes it.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export default function InfoTip({ title = "How this is calculated", children, align = "left" }: { title?: string; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const id = useId();

  // Keep the popover on screen: on a phone an icon mid-line would push a 20rem box past the edge.
  useLayoutEffect(() => {
    if (!open || !pop.current) return;
    const r = pop.current.getBoundingClientRect();
    const margin = 16;
    const over = r.right - (window.innerWidth - margin);
    const under = margin - r.left;
    setShift(over > 0 ? -over : under > 0 ? under : 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-block align-middle normal-case tracking-normal">
      <button
        type="button"
        onClick={() => {
          setShift(0);
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-controls={id}
        aria-label={title}
        title={title}
        className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold leading-none ${open ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-accent hover:text-accent"}`}
      >
        i
      </button>
      {open && (
        <span
          ref={pop}
          id={id}
          role="note"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className={`absolute top-7 z-[1200] block w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-panel p-4 text-left text-xs font-normal leading-relaxed text-text shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <span className="mb-1.5 block text-sm font-semibold">{title}</span>
          <span className="block space-y-1.5 text-muted">{children}</span>
        </span>
      )}
    </span>
  );
}
