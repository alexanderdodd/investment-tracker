/**
 * The controlled tag vocabulary for the "Meaning" layer — Rule #1's circle
 * of competence, made queryable. Single source of truth for the extraction
 * prompt, the profile-tagging prompt, the NL-query prompt, normalization,
 * and UI chips. Tags are namespaced ("domain:coffee") so relevance can be
 * weighted by group and names can't collide across groups.
 */

export const MEANING_TAGS = {
  /** What the company makes or sells */
  domain: [
    "software", "cloud-infrastructure", "cybersecurity", "semiconductors",
    "consumer-electronics", "hardware-equipment", "fintech-payments", "banking",
    "insurance", "asset-management", "real-estate", "homebuilding-construction",
    "industrial-machinery", "aerospace-defense", "automotive", "electric-vehicles",
    "transportation-logistics", "airlines", "oil-gas", "renewable-energy",
    "utilities", "mining-metals", "chemicals", "agriculture", "food-beverage",
    "coffee", "restaurants", "packaged-foods", "alcohol", "tobacco",
    "retail", "e-commerce", "apparel-fashion", "luxury-goods",
    "beauty-personal-care", "household-products", "pets", "toys-games",
    "video-games", "gambling-casinos", "sports-fitness", "outdoor-recreation",
    "travel-hospitality", "media-entertainment", "streaming", "music",
    "publishing-education", "advertising-marketing", "telecom",
    "healthcare-services", "pharmaceuticals", "biotech", "medical-devices",
    "staffing-hr", "professional-services", "waste-environmental",
  ],
  /** Who pays them */
  customer: ["b2c", "b2b", "b2g", "smb-customers", "enterprise-customers"],
  /** How the money is made */
  model: [
    "subscription", "marketplace", "franchise", "advertising-supported",
    "licensing-royalties", "manufacturing", "distribution-wholesale",
    "direct-to-consumer", "platform-network", "services",
    "rental-leasing", "data-provider", "brand-portfolio", "commodity-producer",
  ],
  /** Secular themes and passions */
  theme: [
    "artificial-intelligence", "automation-robotics", "digitization",
    "health-wellness", "aging-population", "sustainability-climate",
    "electrification", "space", "defense-security", "creator-economy",
    "personalization", "convenience", "value-for-money", "premium-experience",
    "small-business-enablement", "infrastructure", "onshoring",
    "emerging-markets", "family-kids", "remote-flexible-work",
  ],
} as const;

export type TagGroup = keyof typeof MEANING_TAGS;

export const TAG_WEIGHTS: Record<TagGroup, number> = {
  domain: 3,
  theme: 2,
  model: 1,
  customer: 1,
};

/** All valid namespaced tags ("domain:coffee", "theme:space", …) */
export const ALL_TAGS: Set<string> = new Set(
  (Object.entries(MEANING_TAGS) as [TagGroup, readonly string[]][]).flatMap(
    ([group, tags]) => tags.map((t) => `${group}:${t}`)
  )
);

/** Bare tag name → namespaced form, for resolving un-namespaced LLM output */
const BARE_TO_NAMESPACED = new Map<string, string>();
for (const tag of ALL_TAGS) {
  BARE_TO_NAMESPACED.set(tag.split(":")[1], tag);
}

/** Common LLM paraphrases → canonical tags */
const ALIASES: Record<string, string> = {
  ai: "theme:artificial-intelligence",
  "machine-learning": "theme:artificial-intelligence",
  saas: "model:subscription",
  gaming: "domain:video-games",
  games: "domain:video-games",
  "restaurants-cafes": "domain:restaurants",
  cafes: "domain:restaurants",
  "fast-food": "domain:restaurants",
  pharma: "domain:pharmaceuticals",
  drugs: "domain:pharmaceuticals",
  "pet-food": "domain:pets",
  "pet-care": "domain:pets",
  grocery: "domain:retail",
  supermarkets: "domain:retail",
  fashion: "domain:apparel-fashion",
  clothing: "domain:apparel-fashion",
  luxury: "domain:luxury-goods",
  chips: "domain:semiconductors",
  energy: "domain:oil-gas",
  solar: "domain:renewable-energy",
  wind: "domain:renewable-energy",
  fintech: "domain:fintech-payments",
  payments: "domain:fintech-payments",
  robotics: "theme:automation-robotics",
  climate: "theme:sustainability-climate",
  esg: "theme:sustainability-climate",
  wellness: "theme:health-wellness",
  fitness: "domain:sports-fitness",
  defense: "domain:aerospace-defense",
  consumers: "customer:b2c",
  businesses: "customer:b2b",
  government: "customer:b2g",
  ads: "model:advertising-supported",
  advertising: "model:advertising-supported",
  royalties: "model:licensing-royalties",
  dtc: "model:direct-to-consumer",
};

function kebab(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s:-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Normalize raw LLM tags: canonical namespaced tags in `tags`, everything
 * unresolvable in `extra` (stored but not matched).
 */
export function normalizeTags(raw: string[]): { tags: string[]; extra: string[] } {
  const tags = new Set<string>();
  const extra = new Set<string>();
  for (const r of raw) {
    const k = kebab(String(r));
    if (!k) continue;
    if (ALL_TAGS.has(k)) {
      tags.add(k);
    } else if (ALIASES[k]) {
      tags.add(ALIASES[k]);
    } else if (BARE_TO_NAMESPACED.has(k)) {
      tags.add(BARE_TO_NAMESPACED.get(k)!);
    } else if (k.includes(":") && BARE_TO_NAMESPACED.has(k.split(":")[1])) {
      // right tag, wrong namespace
      tags.add(BARE_TO_NAMESPACED.get(k.split(":")[1])!);
    } else {
      extra.add(k.replace(/^[a-z]+:/, ""));
    }
  }
  return { tags: Array.from(tags), extra: Array.from(extra) };
}

/** The vocabulary rendered for prompts */
export function vocabularyPromptBlock(): string {
  return (Object.entries(MEANING_TAGS) as [TagGroup, readonly string[]][])
    .map(([group, tags]) => `${group}: ${tags.map((t) => `${group}:${t}`).join(", ")}`)
    .join("\n");
}

/** "domain:video-games" → "video games" for UI chips */
export function displayTag(tag: string): string {
  return tag.replace(/^[a-z]+:/, "").replace(/-/g, " ");
}

/** Namespace of a tag, for weighting */
export function tagGroup(tag: string): TagGroup | null {
  const g = tag.split(":")[0] as TagGroup;
  return g in MEANING_TAGS ? g : null;
}
