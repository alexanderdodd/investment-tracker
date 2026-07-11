"use client";

import { useState } from "react";
import { displayTag } from "@/lib/meaning-tags";

interface ProfileData {
  talents: string | null;
  passions: string | null;
  spending: string | null;
  interestTags: string[];
}

type StepKey = "talents" | "passions" | "spending";

/**
 * Phil Town's Three Circles interview (Rule #1, "Meaning"): instead of a
 * cold form, each circle gets the book's forcing questions plus tappable
 * suggestions, so the answers surface from recognition rather than recall.
 */
const STEPS: {
  key: StepKey;
  circle: string;
  title: string;
  questions: string[];
  suggestions: string[];
  placeholder: string;
}[] = [
  {
    key: "talents",
    circle: "Circle 1 · Talent",
    title: "What are you good at?",
    questions: [
      "What do you do for work — and what did your jobs teach you that outsiders don't know?",
      "What do friends and colleagues come to you for help with?",
      "What did you study or train in, even if you don't use it daily?",
    ],
    suggestions: [
      "software & tech", "finance & accounting", "healthcare", "engineering",
      "construction & trades", "sales & marketing", "teaching", "law",
      "restaurants & hospitality", "retail", "logistics & supply chains",
      "real estate", "cars & mechanics", "farming & agriculture",
      "science & research", "design & media", "managing people", "running a business",
    ],
    placeholder: "Your own words — industries you've worked in, skills people pay you for…",
  },
  {
    key: "passions",
    circle: "Circle 2 · Passion",
    title: "What do you love?",
    questions: [
      "If money didn't matter, how would you spend your time?",
      "What do you read or watch first — which sites, channels, magazine sections?",
      "What can you talk about for hours at dinner?",
    ],
    suggestions: [
      "gaming", "coffee", "cooking & food", "fitness & sports", "travel",
      "fashion & style", "music", "movies & TV", "outdoors & hiking", "pets",
      "cars", "home improvement & DIY", "photography", "reading & learning",
      "gadgets & tech", "investing itself", "health & wellness", "family & kids",
    ],
    placeholder: "Your own words — hobbies, obsessions, what you'd do for free…",
  },
  {
    key: "spending",
    circle: "Circle 3 · Money",
    title: "Where does your money go?",
    questions: [
      "Open your last credit-card statement — what are the recurring names on it?",
      "Which brands do you buy again and again without comparing prices?",
      "What do you spend noticeably more on than your friends do?",
    ],
    suggestions: [
      "streaming services", "eating out & takeaway", "groceries & brands",
      "tech & gadgets", "pet supplies", "travel & hotels", "home improvement",
      "kids & family", "health & supplements", "software subscriptions",
      "clothing & shoes", "gym & sports gear", "beauty & personal care",
      "games & entertainment", "car & fuel", "books & courses",
    ],
    placeholder: "Your own words — the brands and categories your statement actually shows…",
  },
];

function composeAnswer(picked: string[], freeText: string): string {
  const parts: string[] = [];
  if (picked.length > 0) parts.push(picked.join(", "));
  if (freeText.trim()) parts.push(freeText.trim());
  return parts.join(". ");
}

/** Best-effort split of a previously saved answer back into chips + text */
function decompose(saved: string | null, suggestions: string[]): { picked: string[]; text: string } {
  if (!saved) return { picked: [], text: "" };
  const picked = suggestions.filter((s) => saved.toLowerCase().includes(s.toLowerCase()));
  let text = saved;
  for (const p of picked) {
    text = text.replace(new RegExp(`${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(, )?`, "i"), "");
  }
  text = text.replace(/^[,.\s]+|[,.\s]+$/g, "").replace(/^\.\s*/, "");
  return { picked, text };
}

export function MeaningProfileCard({ initial }: { initial: ProfileData | null }) {
  const [profile, setProfile] = useState<ProfileData | null>(initial);
  const [interviewing, setInterviewing] = useState(initial === null);
  const [step, setStep] = useState(0); // 0..2 questions, 3 = review
  const [picked, setPicked] = useState<Record<StepKey, string[]>>(() => ({
    talents: decompose(initial?.talents ?? null, STEPS[0].suggestions).picked,
    passions: decompose(initial?.passions ?? null, STEPS[1].suggestions).picked,
    spending: decompose(initial?.spending ?? null, STEPS[2].suggestions).picked,
  }));
  const [freeText, setFreeText] = useState<Record<StepKey, string>>(() => ({
    talents: decompose(initial?.talents ?? null, STEPS[0].suggestions).text,
    passions: decompose(initial?.passions ?? null, STEPS[1].suggestions).text,
    spending: decompose(initial?.spending ?? null, STEPS[2].suggestions).text,
  }));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const answers: Record<StepKey, string> = {
    talents: composeAnswer(picked.talents, freeText.talents),
    passions: composeAnswer(picked.passions, freeText.passions),
    spending: composeAnswer(picked.spending, freeText.spending),
  };

  const togglePick = (key: StepKey, s: string) =>
    setPicked((prev) => ({
      ...prev,
      [key]: prev[key].includes(s) ? prev[key].filter((x) => x !== s) : [...prev[key], s],
    }));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProfile({
        talents: data.profile.talents,
        passions: data.profile.passions,
        spending: data.profile.spending,
        interestTags: data.profile.interestTags ?? [],
      });
      setInterviewing(false);
      setStep(0);
      setNotice(
        data.tagsGenerated
          ? "Saved. Refresh to update your circle below."
          : "Saved — but deriving your interest tags failed. Save again to retry."
      );
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
            Rule #1&apos;s Three Circles: Talent, Passion, Money — the overlap is your hunting
            ground
          </p>
        </div>
        {!interviewing && (
          <button
            onClick={() => {
              setInterviewing(true);
              setStep(0);
            }}
            className="text-xs text-blue-500 hover:underline dark:text-blue-400"
          >
            {profile ? "Redo interview" : "Start"}
          </button>
        )}
      </div>

      {interviewing ? (
        <div className="space-y-4">
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-blue-500" : "bg-zinc-200 dark:bg-zinc-700"}`}
              />
            ))}
          </div>

          {step < 3 ? (
            (() => {
              const s = STEPS[step];
              return (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-blue-500 dark:text-blue-400">
                      {s.circle}
                    </p>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {s.title}
                    </h3>
                  </div>
                  <ul className="space-y-1">
                    {s.questions.map((q) => (
                      <li key={q} className="flex gap-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                        {q}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-1.5">
                    {s.suggestions.map((sug) => {
                      const active = picked[s.key].includes(sug);
                      return (
                        <button
                          key={sug}
                          onClick={() => togglePick(s.key, sug)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {active ? "✓ " : ""}{sug}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={freeText[s.key]}
                    onChange={(e) => setFreeText((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder={s.placeholder}
                    rows={2}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>
              );
            })()
          ) : (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Your three circles
              </h3>
              {STEPS.map((s) => (
                <div key={s.key}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-blue-500 dark:text-blue-400">
                    {s.circle}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {answers[s.key] || <span className="text-zinc-400">— skipped —</span>}
                  </p>
                </div>
              ))}
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Saving derives your interest tags and starts matching companies to your circle.
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => (step === 0 ? setInterviewing(profile === null) : setStep(step - 1))}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              disabled={step === 0 && profile === null}
            >
              {step === 0 ? (profile ? "Cancel" : "") : "← Back"}
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {step === 2 ? "Review →" : "Next →"}
              </button>
            ) : (
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save my circles"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {STEPS.map((s) => {
            const v = profile?.[s.key];
            return v ? (
              <p key={s.key} className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{s.title}</span> {v}
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
