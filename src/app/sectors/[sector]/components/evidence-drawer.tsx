"use client";

interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  researchDocument: string | null;
  generatedAt: string | null;
}

export default function EvidenceDrawer({
  open,
  onClose,
  researchDocument,
  generatedAt,
}: EvidenceDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white transition-transform duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-900 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Research Evidence
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {researchDocument ? (
            <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {researchDocument}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">
              No research document available.
            </p>
          )}
        </div>

        {/* Footer */}
        {generatedAt && (
          <div className="border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-400">Generated {generatedAt}</p>
          </div>
        )}
      </div>
    </>
  );
}
