# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Push schema changes to Neon (no migration files)
npm run db:generate  # Generate migration files from schema diff
npm run db:migrate   # Run pending migrations
npm run db:studio    # Open Drizzle Studio (DB browser)
npm run generate-reports  # Generate AI sector reports (stores in DB)
npm run generate-analysis              # Run full sector research pipeline (all sectors)
npm run generate-analysis -- --sector Utilities  # Single sector research
npm run distill-summaries              # Re-distill user summaries from existing research (cheap)
npm run distill-summaries -- --sector Utilities   # Single sector distill
npm run distill-insights               # Re-distill structured insights (cheap)
npm run distill-insights -- --sector Utilities
npm run value-stock -- --ticker KO     # Deep stock valuation report
npm run seed-gics                      # Seed GICS taxonomy tables (sectors, industry groups, industries, stocks)
npm run generate-industry-analytics              # Compute industry analytics from stock metrics
npm run generate-industry-analytics -- --sector Technology
npm run generate-candidates                      # Generate value candidates from analytics + valuations
npm run generate-candidates -- --sector Technology
npm run validate-industries            # Run 25-rule validation suite for industry feature
```

No test framework is configured yet. Use `npm run validate-industries` for industry feature integrity checks.

## Architecture

**Next.js 16 App Router** with TypeScript, Tailwind CSS 4, and `src/` directory. Path alias: `@/*` → `./src/*`.

### Auth (NextAuth.js v5 beta)
- `src/auth.ts` — Central config. Exports `handlers`, `auth`, `signIn`, `signOut`. Uses GitHub OAuth + DrizzleAdapter.
- `src/app/api/auth/[...nextauth]/route.ts` — Mounts auth route handlers.
- `src/middleware.ts` — Runs `auth()` on every request for session refresh (does not block unauthenticated users).
- Auth functions (`auth()`, `signIn()`, `signOut()`) are used directly in Server Components and Server Actions — no client-side auth provider needed.

### Database (Drizzle ORM + Neon Postgres)
- `src/db/index.ts` — Lazy-initialized singleton via `getDb()`. Uses `neon-http` driver (serverless-friendly).
- `src/db/schema.ts` — Drizzle schema. Tables: NextAuth (`users`, `accounts`, `sessions`, `verificationTokens`), GICS taxonomy (`gics_sector`, `gics_industry_group`, `gics_industry`, `gics_sub_industry`, `stock_classification`), analytics (`industry_analytics`, `value_candidate`), sector data (`sector_report`, `sector_analysis`, `sector_emerging_leader`, `sector_value_stock`), stocks (`stock_valuation`, `watchlist_item`).
- `drizzle.config.ts` — Drizzle Kit config. Loads `.env.local` via dotenv since Drizzle Kit doesn't auto-load it.
- New tables go in `src/db/schema.ts`. After changes, run `npm run db:push` (dev) or generate migrations for production.

### GICS Industry Taxonomy
- `src/lib/gics-taxonomy.ts` — Deterministic GICS taxonomy (11 sectors, 25 industry groups, 76 industries). Single source of truth. LLMs must NOT modify these.
- `scripts/seed-gics.ts` — Seeds taxonomy + 40 benchmark stock classifications.
- Industry analytics and value candidates are generated deterministically from Yahoo Finance metrics + stock valuation artifacts. No LLM-generated taxonomy fields.

### Routes
- `/sectors` — Sector grid overview
- `/sectors/[sector]` — Sector detail (tabs: Overview, Industries, Learn, Position, Holdings)
- `/industries/[slug]` — Industry detail with analytics, candidates, and stock metrics
- `/stocks/[ticker]/valuation` — Stock valuation with industry breadcrumb
- `/watchlist` — User's watched stocks

### Environment
Required vars in `.env.local` (see `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `OPENROUTER_API_KEY`.
