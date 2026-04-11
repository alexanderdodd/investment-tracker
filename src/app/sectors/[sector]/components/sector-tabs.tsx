"use client";

export type TabId = "overview" | "learn" | "position" | "holdings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "learn", label: "Learn" },
  { id: "position", label: "Position" },
  { id: "holdings", label: "Holdings" },
];

export function SectorTabs({
  activeTab,
  onTabChange,
  onViewEvidence,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onViewEvidence: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <button
        onClick={onViewEvidence}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        View evidence
      </button>
    </div>
  );
}
