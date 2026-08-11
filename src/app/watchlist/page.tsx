import { redirect } from "next/navigation";

// The watchlist has become one of many lists — send legacy links to the lists
// index, where the protected "Watchlist" list lives alongside the others.
export default function WatchlistRedirect() {
  redirect("/lists");
}
