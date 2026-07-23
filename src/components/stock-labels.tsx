"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LabelColor, StockLabel } from "@/lib/labels";

// Palette key → Tailwind classes. Full literal strings so the scanner keeps
// them (never interpolate colour into a class name).
const PILL: Record<LabelColor, string> = {
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  lime: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  cyan: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  zinc: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
};

const DOT: Record<LabelColor, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  lime: "bg-lime-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  fuchsia: "bg-fuchsia-500",
  zinc: "bg-zinc-400",
};

export function labelPillClass(color: LabelColor): string {
  return PILL[color] ?? PILL.zinc;
}

interface Props {
  ticker: string;
  /** All of the user's labels (for the picker menu). */
  labels: StockLabel[];
  /** Label ids currently applied to this ticker. */
  assignedIds: string[];
  onToggle: (labelId: string, assign: boolean) => void;
  /** Create a brand-new label and apply it to this ticker. */
  onCreateAndAssign: (name: string) => void;
}

export function StockLabels({ ticker, labels, assignedIds, onToggle, onCreateAndAssign }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const assigned = new Set(assignedIds);
  const byId = new Map(labels.map((l) => [l.id, l]));
  const applied = assignedIds.map((id) => byId.get(id)).filter(Boolean) as StockLabel[];

  const q = query.trim().toLowerCase();
  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q));
  const exactExists = labels.some((l) => l.name.toLowerCase() === q);

  // Position the fixed popover under the trigger. useLayoutEffect so it's placed
  // before paint (no flash from an initial (0,0) render).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 224;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
  }, [open]);

  // Close on outside click, Escape, or any scroll/resize (fixed pos would drift).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !popRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function create() {
    const name = query.trim();
    if (!name || exactExists) return;
    onCreateAndAssign(name);
    setQuery("");
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {applied.map((l) => (
        <button
          key={l.id}
          onClick={() => onToggle(l.id, false)}
          title={`Remove “${l.name}”`}
          className={`group inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ${labelPillClass(
            l.color
          )}`}
        >
          {l.name}
          <span className="opacity-40 group-hover:opacity-100">×</span>
        </button>
      ))}

      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Add label"
        aria-label={`Add label to ${ticker}`}
        className={`inline-flex h-4 items-center rounded-full border border-dashed px-1.5 text-[10px] font-medium transition-colors ${
          applied.length === 0
            ? "border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            : "border-transparent text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
        }`}
      >
        {applied.length === 0 ? "＋ label" : "＋"}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
            className="z-50 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  create();
                }
              }}
              placeholder="Find or create a label…"
              className="mb-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <div className="max-h-56 overflow-y-auto">
              {filtered.map((l) => {
                const on = assigned.has(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => onToggle(l.id, !on)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[l.color] ?? DOT.zinc}`} />
                    <span className="flex-1 truncate">{l.name}</span>
                    {on && <span className="text-emerald-500">✓</span>}
                  </button>
                );
              })}
              {q && !exactExists && (
                <button
                  onClick={create}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                >
                  <span className="text-sm leading-none">＋</span>
                  <span className="flex-1 truncate">
                    Create “{query.trim()}”
                  </span>
                </button>
              )}
              {filtered.length === 0 && !q && (
                <p className="px-2 py-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Type to create your first label.
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
