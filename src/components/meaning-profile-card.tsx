"use client";

import { useState } from "react";
import { displayTag } from "@/lib/meaning-tags";

interface ProfileData {
  talents: string | null;
  passions: string | null;
  spending: string | null;
  interestTags: string[];
}

const QUESTIONS: { key: keyof Omit<ProfileData, "interestTags">; label: string; placeholder: string }[] = [
  { key: "talents", label: "What are you good at?", placeholder: "e.g. software engineering, financial modelling, running a small business…" },
  { key: "passions", label: "What do you love?", placeholder: "e.g. specialty coffee, gaming, cycling, cooking…" },
  { key: "spending", label: "Where does your money go?", placeholder: "e.g. pets, streaming subscriptions, travel, home improvement…" },
];

/**
 * Rule #1 "Meaning" profile: three free-text answers, one LLM call on save
 * derives the interest tags that drive relevance ranking and the homepage
 * circle section.
 */
export function MeaningProfileCard({ initial }: { initial: ProfileData | null }) {
  const [profile, setProfile] = useState<ProfileData | null>(initial);
  const [editing, setEditing] = useState(initial === null);
  const [draft, setDraft] = useState({
    talents: initial?.talents ?? "",
    passions: initial?.passions ?? "",
    spending: initial?.spending ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProfile({
        talents: data.profile.talents,
        passions: data.profile.passions,
        spending: data.profile.spending,
        interestTags: data.profile.interestTags ?? [],
      });
      setEditing(false);
      if (!data.tagsGenerated) {
        setNotice("Saved — but deriving your interest tags failed. Edit and save again to retry.");
      } else {
        setNotice("Saved. Refresh to update your circle below.");
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-left dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            🎯 My investing circle
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Rule #1&apos;s &ldquo;Meaning&rdquo;: invest in what you understand — talents,
            passions, and where your money already goes
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-500 hover:underline dark:text-blue-400"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {QUESTIONS.map((q) => (
            <div key={q.key}>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {q.label}
              </label>
              <textarea
                value={draft[q.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [q.key]: e.target.value }))}
                placeholder={q.placeholder}
                rows={2}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
            {profile && (
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {QUESTIONS.map((q) => {
            const v = profile?.[q.key];
            return v ? (
              <p key={q.key} className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{q.label}</span>{" "}
                {v}
              </p>
            ) : null;
          })}
          {(profile?.interestTags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile!.interestTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                  {displayTag(t)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {notice && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{notice}</p>}
    </div>
  );
}
