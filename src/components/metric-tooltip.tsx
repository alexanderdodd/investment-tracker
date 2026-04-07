"use client";

import { useState, useRef, useEffect } from "react";

export function MetricTooltip({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
      >
        {children}
        <svg
          className="h-3 w-3 flex-shrink-0 text-zinc-400"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0zM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 0 1 2 0v3a1 1 0 1 1-2 0V8z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <p className="mb-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {label}
          </p>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}
