# Iteration 3 — Changes

## Patch: Wire 5-state screen results into UI surfaces

### Files changed

| File | Change |
|------|--------|
| `src/app/api/industries/[slug]/route.ts` | Added `screenResults` to response from `industry_screen_result` table |
| `src/app/industries/[slug]/page.tsx` | New "Value Screen Results" section with state badges, signals, trap flags |
| `src/app/api/sectors/[sector]/industries/route.ts` | Added `screenCounts` per industry from `industry_screen_result` |
| `src/app/sectors/[sector]/components/tab-industries.tsx` | Replaced "Candidates" column with color-coded screen count badges (P/S/D/T) |
| `src/db/schema.ts` | Fixed JSONB default values to match TypeScript types |
| `src/lib/industry-screen.ts` | Fixed type cast for peer details access |

### UI elements added

**Industry detail page — Value Screen Results section:**
- State badges: Published (green), Screen Pass (blue), Needs Deep Work (amber), Trap Risk (red)
- Per-stock signals: cheapness count + pass/fail, quality score + pass/fail, artifact status, peer status
- Trap flags displayed in red for excluded stocks
- Composite score shown for ranking
- WATCHLIST_ONLY stocks hidden from this section (too numerous)

**Sector Industries tab — Screen column:**
- Color-coded inline badges: `2P` (published), `1S` (screen pass), `3D` (deep work), `1T` (trap risk)
- Replaces old "Candidates" column which only showed validated + possible counts
