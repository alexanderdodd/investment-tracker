import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { StockSearchBox } from "@/components/stock-search-box";
import { MeaningProfileCard } from "@/components/meaning-profile-card";
import { getProfile, topCircleCompanies } from "@/lib/meaning-match";
import { displayTag } from "@/lib/meaning-tags";
import { beatenDownQualifiers } from "@/lib/biggest-losers";

/** Signed decimal fraction → e.g. "-38%" (rounded, always signed) */
function fmtDelta(v: number | null): string {
  if (v === null) return "—";
  const pct = Math.round(v * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const [profile, circle, losers] = userId
    ? await Promise.all([
        getProfile(userId),
        topCircleCompanies(userId, 8),
        beatenDownQualifiers(12),
      ])
    : [null, [], []];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-col items-center gap-8 p-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Investment Tracker
        </h1>

        {session?.user ? (
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-3">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt="Avatar"
                  className="h-10 w-10 rounded-full"
                />
              )}
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {session.user.name ?? session.user.email}
              </p>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Sign out
                </button>
              </form>
            </div>

            <div className="w-full sm:w-[34rem]">
              <StockSearchBox />
            </div>

            <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/search"
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-6 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <span className="text-2xl">🔍</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Search Stocks
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Look up any ticker or company
                  </p>
                </div>
              </Link>
              <Link
                href="/sectors"
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-6 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Sector Overview
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Market sector performance
                  </p>
                </div>
              </Link>
              <Link
                href="/watchlist"
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-6 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <span className="text-2xl">⭐</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    My Watchlist
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Stocks you&apos;re tracking
                  </p>
                </div>
              </Link>
              <Link
                href="/portfolios"
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-6 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <span className="text-2xl">💼</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Portfolios
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Paper-trade simulations
                  </p>
                </div>
              </Link>
            </nav>

            {/* Rule #1 "Meaning" profile */}
            <div className="w-full sm:w-[34rem]">
              <MeaningProfileCard
                initial={
                  profile
                    ? {
                        talents: profile.talents,
                        passions: profile.passions,
                        spending: profile.spending,
                        interestTags: profile.interestTags ?? [],
                      }
                    : null
                }
              />
            </div>

            {/* Companies in your circle */}
            {circle.length > 0 && (
              <div className="w-full sm:w-[34rem] rounded-2xl border border-zinc-200 bg-white p-6 text-left dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Companies in your circle
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Big Five qualifiers matching your interests
                    </p>
                  </div>
                  <Link
                    href="/screener?sort=relevance&minScore=3"
                    className="text-xs text-blue-500 hover:underline dark:text-blue-400"
                  >
                    See all →
                  </Link>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {circle.map((c) => (
                    <li key={c.ticker} className="py-2.5 first:pt-0 last:pb-0">
                      <Link href={`/stocks/${c.ticker}/valuation`} className="group block">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
                            {c.ticker}
                            <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                              {c.companyName}
                            </span>
                          </p>
                          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {c.score}/5
                          </span>
                        </div>
                        {c.oneLiner && (
                          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {c.oneLiner}
                          </p>
                        )}
                        {c.matchedTags.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {c.matchedTags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-blue-500/10 px-1.5 py-px text-[10px] font-medium text-blue-600 dark:text-blue-400"
                              >
                                {displayTag(t)}
                              </span>
                            ))}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Beaten-down quality — Big Five qualifiers furthest below their 52-week high */}
            {losers.length > 0 && (
              <div className="w-full sm:w-[34rem] rounded-2xl border border-zinc-200 bg-white p-6 text-left dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Beaten-down quality
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Big Five qualifiers furthest below their 52-week high
                    </p>
                  </div>
                  <Link
                    href="/screener?sort=off52high&minScore=3&minMcap=2000000000"
                    className="text-xs text-blue-500 hover:underline dark:text-blue-400"
                  >
                    See all →
                  </Link>
                </div>
                <div className="mb-1.5 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  <span>Company</span>
                  <span className="w-12 text-right">50d</span>
                  <span className="w-12 text-right">200d</span>
                  <span className="w-14 text-right">Off high</span>
                  <span className="w-8 text-right">Big 5</span>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {losers.map((s) => (
                    <li key={s.ticker} className="py-2 first:pt-0 last:pb-0">
                      <Link
                        href={`/stocks/${s.ticker}/valuation`}
                        className="group grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3"
                      >
                        <span className="min-w-0">
                          <span className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
                            {s.ticker}
                          </span>
                          {s.companyName && (
                            <span className="ml-2 truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                              {s.companyName}
                            </span>
                          )}
                        </span>
                        <span className="w-12 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                          {fmtDelta(s.pctVs50dAvg)}
                        </span>
                        <span className="w-12 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                          {fmtDelta(s.pctVs200dAvg)}
                        </span>
                        <span className="w-14 text-right text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                          {fmtDelta(s.pctFrom52wHigh)}
                        </span>
                        <span className="w-8 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {s.score}/5
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Track your investments in one place.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("github");
              }}
            >
              <button
                type="submit"
                className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Sign in with GitHub
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
