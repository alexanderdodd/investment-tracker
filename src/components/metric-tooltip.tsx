"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

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
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 128, window.innerWidth - 272)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClickOutside(e: MouseEvent) {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
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
      {open &&
        createPortal(
          <div
            className="fixed z-[100] w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <p className="mb-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {label}
            </p>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
