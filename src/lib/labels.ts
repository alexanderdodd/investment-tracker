// User-defined stock labels: shared palette + types used by the label API and
// UI. Colour is stored as a palette key (e.g. "sky"); the Tailwind class
// strings for each key live in the UI (label-picker) so the scanner keeps them.

/** Colours offered when creating a label, in the order they auto-cycle. */
export const LABEL_COLORS = [
  "sky",
  "emerald",
  "rose",
  "amber",
  "violet",
  "lime",
  "orange",
  "teal",
  "cyan",
  "fuchsia",
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number] | "zinc";

/** All valid stored colour keys (palette + the neutral fallback). */
const VALID_COLORS = new Set<string>([...LABEL_COLORS, "zinc"]);

export function isLabelColor(c: unknown): c is LabelColor {
  return typeof c === "string" && VALID_COLORS.has(c);
}

/** Pick the next palette colour given the colours already in use, so a fresh
 *  label rarely collides with an existing one. Falls back to cycling. */
export function nextLabelColor(usedColors: string[]): LabelColor {
  const used = new Set(usedColors);
  const free = LABEL_COLORS.find((c) => !used.has(c));
  return free ?? LABEL_COLORS[usedColors.length % LABEL_COLORS.length];
}

export interface StockLabel {
  id: string;
  name: string;
  color: LabelColor;
}

/** GET /api/labels payload: the user's labels plus a ticker→labelIds map. */
export interface LabelsResponse {
  labels: StockLabel[];
  assignments: Record<string, string[]>;
}
