"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { labelDotClass } from "@/components/stock-labels";
import type { LabelColor } from "@/lib/labels";

interface ListCard {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  count: number;
}

export default function ListsPage() {
  const [lists, setLists] = useState<ListCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    fetch("/api/lists")
      .then((r) => {
        if (r.status === 401) {
          setAuthed(false);
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (json) setLists(json.lists ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createList() {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const { list } = (await res.json()) as { list: ListCard };
    setLists((prev) => (prev.some((l) => l.id === list.id) ? prev : [...prev, list]));
  }

  async function renameList(id: string) {
    const name = editName.trim();
    setEditing(null);
    if (!name) return;
    const prev = lists;
    setLists((cur) => cur.map((l) => (l.id === id ? { ...l, name } : l)));
    const res = await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (!res?.ok) setLists(prev);
  }

  async function deleteList(id: string, name: string) {
    if (!confirm(`Delete the "${name}" list? Stocks in it won't be deleted from other lists.`)) {
      return;
    }
    const prev = lists;
    setLists((cur) => cur.filter((l) => l.id !== id));
    const res = await fetch(`/api/lists/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setLists(prev);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Watchlists</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Curated lists of stocks with notes — a watchlist, a risky pile, a deep-dive queue.
            Add stocks from any stock page.
          </p>
        </div>

        {!authed ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">Sign in to create and view your lists.</p>
          </div>
        ) : (
          <>
            {/* New list */}
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createList();
                  }
                }}
                placeholder="New list name…"
                className="w-56 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <button
                onClick={createList}
                disabled={!newName.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Create list
              </button>
            </div>

            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lists.map((l) => (
                  <div
                    key={l.id}
                    className="group relative rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                  >
                    {editing === l.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => renameList(l.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameList(l.id);
                          else if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    ) : (
                      <Link href={`/lists/${l.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${labelDotClass(
                              l.color as LabelColor
                            )}`}
                          />
                          <span className="font-semibold text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
                            {l.name}
                          </span>
                          {l.isDefault && (
                            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              default
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {l.count} stock{l.count === 1 ? "" : "s"}
                        </p>
                      </Link>
                    )}

                    {/* Rename / delete — hidden for the protected default */}
                    {!l.isDefault && editing !== l.id && (
                      <div className="absolute right-3 top-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditing(l.id);
                            setEditName(l.name);
                          }}
                          title="Rename"
                          className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => deleteList(l.id, l.name)}
                          title="Delete list"
                          className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
