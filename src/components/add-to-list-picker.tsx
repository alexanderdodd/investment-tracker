"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { labelDotClass } from "@/components/stock-labels";
import type { LabelColor } from "@/lib/labels";

interface ListEntry {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  count: number;
  membership: { note: string | null; status: string } | null;
}

/**
 * "Add to list" dropdown for a stock. Loads the user's lists (with this ticker's
 * membership), lets you check/uncheck lists, attach a note when adding, and
 * create a new list inline. Replaces the old single Watch button.
 */
export function AddToListPicker({
  ticker,
  companyName,
  sector,
}: {
  ticker: string;
  companyName: string | null;
  sector: string | null;
}) {
  const [lists, setLists] = useState<ListEntry[]>([]);
  const [authed, setAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    fetch(`/api/lists?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setAuthed(true);
        setLists(json.lists ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [ticker]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 256;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
  }, [open]);

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

  const inCount = lists.filter((l) => l.membership).length;

  function setBusyFor(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggle(list: ListEntry) {
    if (busy.has(list.id)) return;
    setBusyFor(list.id, true);
    const adding = !list.membership;
    const trimmedNote = note.trim();

    // Optimistic membership flip.
    setLists((prev) =>
      prev.map((l) =>
        l.id === list.id
          ? {
              ...l,
              membership: adding ? { note: trimmedNote || null, status: "watching" } : null,
              count: Math.max(0, l.count + (adding ? 1 : -1)),
            }
          : l
      )
    );

    try {
      if (adding) {
        const res = await fetch(`/api/lists/${list.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, companyName, sector, note: trimmedNote || undefined }),
        });
        if (!res.ok) throw new Error("add failed");
      } else {
        const res = await fetch(`/api/lists/${list.id}/items/${encodeURIComponent(ticker)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("remove failed");
      }
    } catch {
      // Revert on failure.
      setLists((prev) =>
        prev.map((l) =>
          l.id === list.id
            ? {
                ...l,
                membership: adding ? null : { note: null, status: "watching" },
                count: Math.max(0, l.count + (adding ? -1 : 1)),
              }
            : l
        )
      );
    } finally {
      setBusyFor(list.id, false);
    }
  }

  async function createList() {
    const name = creating.trim();
    if (!name) return;
    setCreating("");
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const { list } = (await res.json()) as { list: ListEntry };
      const entry: ListEntry = { ...list, membership: null };
      setLists((prev) => (prev.some((l) => l.id === entry.id) ? prev : [...prev, entry]));
      // Immediately add the stock to the new list.
      await toggle(entry);
    } catch {
      /* ignore */
    }
  }

  // Signed-out users don't see the control at all (matches labels behaviour).
  if (loaded && !authed) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
          inCount > 0
            ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
            : "border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
        }`}
        title="Add to a list"
      >
        {inCount > 0 ? "★" : "☆"}
        {inCount > 0 ? `In ${inCount} list${inCount === 1 ? "" : "s"}` : "Add to list"}
        <span className="text-[10px] opacity-60">▾</span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 256 }}
            className="z-50 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="max-h-56 overflow-y-auto">
              {lists.map((l) => {
                const on = !!l.membership;
                return (
                  <button
                    key={l.id}
                    onClick={() => toggle(l)}
                    disabled={busy.has(l.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${labelDotClass(l.color as LabelColor)}`}
                    />
                    <span className="flex-1 truncate">{l.name}</span>
                    {l.isDefault && (
                      <span className="text-[9px] uppercase tracking-wide text-zinc-400">
                        default
                      </span>
                    )}
                    {on && <span className="text-emerald-500">✓</span>}
                  </button>
                );
              })}
              {lists.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  No lists yet — create one below.
                </p>
              )}
            </div>

            <div className="mt-1.5 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
              <label className="px-2 text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Note (added when you check a list)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Why are you tracking this?"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  value={creating}
                  onChange={(e) => setCreating(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createList();
                    }
                  }}
                  placeholder="New list…"
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                <button
                  onClick={createList}
                  disabled={!creating.trim()}
                  className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
