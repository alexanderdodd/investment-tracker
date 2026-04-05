import { notFound } from "next/navigation";
import Link from "next/link";
import { slugToSector, SECTOR_ETFS } from "@/lib/sectors";
import { SectorDetail } from "./sector-detail";

export default async function SectorPage({
  params,
}: {
  params: Promise<{ sector: string }>;
}) {
  const { sector: slug } = await params;
  const sector = slugToSector(slug);

  if (!sector) {
    notFound();
  }

  const ticker = SECTOR_ETFS[sector];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/sectors"
          className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; Back to Sector Overview
        </Link>
        <SectorDetail sector={sector} ticker={ticker} slug={slug} />
      </div>
    </div>
  );
}
