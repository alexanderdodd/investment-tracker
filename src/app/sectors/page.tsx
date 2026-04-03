import { SectorGrid } from "./sector-grid";

export const metadata = {
  title: "Sector Overview | Investment Tracker",
  description: "Performance overview of key market sectors",
};

export default function SectorsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Sector Overview
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            30-day performance of key market sectors, tracked via sector ETFs.
          </p>
        </div>
        <SectorGrid />
      </div>
    </div>
  );
}
