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
```

No test framework is configured yet.

## Architecture

**Next.js 16 App Router** with TypeScript, Tailwind CSS 4, and `src/` directory. Path alias: `@/*` → `./src/*`.

### Auth (NextAuth.js v5 beta)
- `src/auth.ts` — Central config. Exports `handlers`, `auth`, `signIn`, `signOut`. Uses GitHub OAuth + DrizzleAdapter.
- `src/app/api/auth/[...nextauth]/route.ts` — Mounts auth route handlers.
- `src/middleware.ts` — Runs `auth()` on every request for session refresh (does not block unauthenticated users).
- Auth functions (`auth()`, `signIn()`, `signOut()`) are used directly in Server Components and Server Actions — no client-side auth provider needed.

### Database (Drizzle ORM + Neon Postgres)
- `src/db/index.ts` — Lazy-initialized singleton via `getDb()`. Uses `neon-http` driver (serverless-friendly).
- `src/db/schema.ts` — Drizzle schema. Currently contains NextAuth tables: `users`, `accounts`, `sessions`, `verificationTokens`.
- `drizzle.config.ts` — Drizzle Kit config. Loads `.env.local` via dotenv since Drizzle Kit doesn't auto-load it.
- New tables go in `src/db/schema.ts`. After changes, run `npm run db:push` (dev) or generate migrations for production.

### Environment
Required vars in `.env.local` (see `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.
