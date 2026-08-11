import Link from "next/link";
import { StockSearchBox } from "./stock-search-box";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link
          href="/"
          title="Home"
          className="flex shrink-0 items-center gap-2 rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
          </svg>
          <span className="hidden text-sm font-semibold sm:inline">
            Investment Tracker
          </span>
        </Link>

        <Link
          href="/lists"
          title="My Watchlists"
          className="flex shrink-0 items-center gap-1.5 rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />
          </svg>
          <span className="hidden text-sm font-medium sm:inline">Watchlists</span>
        </Link>

        <Link
          href="/screener"
          title="Big Five Screener"
          className="flex shrink-0 items-center gap-1.5 rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          <span className="hidden text-sm font-medium sm:inline">Screener</span>
        </Link>

        <div className="ml-auto w-full max-w-xs sm:max-w-sm">
          <StockSearchBox compact />
        </div>
      </div>
    </header>
  );
}
