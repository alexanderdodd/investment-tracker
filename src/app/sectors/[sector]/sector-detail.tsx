"use client";

import { useEffect, useState } from "react";
import { type StockMetrics } from "@/lib/stock-metrics";
import { type SectorInsights, parseSectorInsights } from "@/lib/sector-insights";
import { type PricePoint, type ExtendedChanges } from "@/lib/sector-data";
import SectorHeader from "./components/sector-header";
import { SectorTabs, type TabId } from "./components/sector-tabs";
import TabOverview from "./components/tab-overview";
import TabLearn from "./components/tab-learn";
import TabPosition from "./components/tab-position";
import { TabHoldings } from "./components/tab-holdings";
import EvidenceDrawer from "./components/evidence-drawer";

interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

interface EmergingLeader {
  ticker: string;
  companyName: string;
  rationale: string;
  metricLabel: string;
  metricValue: string;
  rank: number;
}

export function SectorDetail({
  sector,
  ticker,
  slug,
}: {
  sector: string;
  ticker: string;
  slug: string;
}) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Data state
  const [sectorPrices, setSectorPrices] = useState<PricePoint[]>([]);
  const [benchmarkPrices, setBenchmarkPrices] = useState<PricePoint[]>([]);
  const [sectorChanges, setSectorChanges] = useState<ExtendedChanges | null>(null);
  const [benchmarkChanges, setBenchmarkChanges] = useState<ExtendedChanges | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [leaders, setLeaders] = useState<EmergingLeader[]>([]);
  const [leadersGeneratedAt, setLeadersGeneratedAt] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, StockMetrics>>({});
  const [insights, setInsights] = useState<SectorInsights | null>(null);
  const [userSummary, setUserSummary] = useState<string | null>(null);
  const [researchDocument, setResearchDocument] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all data
  useEffect(() => {
    Promise.all([
      fetch(`/api/sectors/${slug}/prices`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/sectors/${slug}/holdings`)
        .then((r) => r.json())
        .catch(() => ({ holdings: [] })),
      fetch(`/api/sectors/${slug}/analysis`)
        .then((r) => r.json())
        .catch(() => ({ analysis: null })),
      fetch(`/api/sectors/${slug}/emerging-leaders`)
        .then((r) => r.json())
        .catch(() => ({ leaders: [] })),
    ])
      .then(([priceData, holdingsData, analysisData, leadersData]) => {
        if (priceData?.sector) {
          setSectorPrices(priceData.sector.prices ?? []);
          setSectorChanges(priceData.sector.changes ?? null);
          setBenchmarkPrices(priceData.benchmark.prices ?? []);
          setBenchmarkChanges(priceData.benchmark.changes ?? null);
        }

        setHoldings(holdingsData?.holdings ?? []);

        if (analysisData?.analysis) {
          setUserSummary(analysisData.analysis.userSummary ?? null);
          setResearchDocument(analysisData.analysis.researchDocument ?? null);
          setGeneratedAt(analysisData.analysis.generatedAt ?? null);
          setInsights(parseSectorInsights(analysisData.analysis.structuredInsights));
        }

        if (leadersData?.leaders?.length) {
          setLeaders(leadersData.leaders);
          setLeadersGeneratedAt(leadersData.generatedAt ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Fetch metrics once we know tickers
  useEffect(() => {
    const holdingTickers = holdings.map((h) => h.symbol);
    const leaderTickers = leaders.map((l) => l.ticker);
    const allTickers = [...new Set([...holdingTickers, ...leaderTickers])];
    if (allTickers.length === 0) return;

    fetch(`/api/stocks/metrics?tickers=${allTickers.join(",")}`)
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {});
  }, [holdings, leaders]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-80 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectorHeader
        sector={sector}
        ticker={ticker}
        insights={insights}
        generatedAt={generatedAt}
      />

      <SectorTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onViewEvidence={() => setDrawerOpen(true)}
      />

      <div className="mt-4">
        {activeTab === "overview" && (
          <TabOverview
            sectorPrices={sectorPrices}
            benchmarkPrices={benchmarkPrices}
            sectorTicker={ticker}
            sectorChanges={sectorChanges!}
            benchmarkChanges={benchmarkChanges!}
            insights={insights}
            holdings={holdings}
          />
        )}

        {activeTab === "learn" && (
          <TabLearn
            insights={insights}
            userSummaryFallback={userSummary}
            holdings={holdings}
          />
        )}

        {activeTab === "position" && (
          <TabPosition insights={insights} />
        )}

        {activeTab === "holdings" && (
          <TabHoldings
            sector={sector}
            ticker={ticker}
            holdings={holdings.length > 0 ? holdings : null}
            leaders={leaders.length > 0 ? leaders : null}
            leadersGeneratedAt={leadersGeneratedAt}
            metrics={metrics}
          />
        )}
      </div>

      <EvidenceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        researchDocument={researchDocument}
        generatedAt={generatedAt}
      />
    </div>
  );
}
