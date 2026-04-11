import { StockValuationView } from "./valuation-view";

export default async function StockValuationPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <StockValuationView ticker={ticker.toUpperCase()} />
      </div>
    </div>
  );
}
