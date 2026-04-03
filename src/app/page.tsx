import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

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

            <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </nav>
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
