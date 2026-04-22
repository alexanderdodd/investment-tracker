# Simulation Portfolio

## Overview

A paper-trading portfolio feature that lets users simulate buying stocks at real market prices, track P&L over time, compare performance against benchmarks, and monitor dividend income — without risking real money.

## Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multiple portfolios | Yes | Users can test different strategies: "Value Picks Q2 2026", "Dividend Income", etc. |
| Buy + sell | Buy only (v1) | Sell support designed for later — schema includes sell capability |
| Cash tracking | Virtual cash balance | User chooses starting amount when creating portfolio (e.g., $6K, $13K, $100K — no default) |
| Fee model | IBKR/Saxo realistic fees | Not commission-free — users should see real trading friction |
| Benchmarks | Purchase price, SPY, sector ETF | All three, shown side by side |
| Dividends | Track income | Yahoo provides historical div events per stock |
| Integration | Stock valuation page + industry screen | "Simulate Buy" button on both |

## Brokerage Fee Model

Two presets based on real broker pricing:

### IBKR Pro (default)
- **Fixed rate:** $0.005/share, min $1.00, max 1% of trade value
- **Example:** 10 shares of AAPL at $200 = $2,000 trade → $1.00 fee (min applies)
- **Example:** 100 shares of AAPL at $200 = $20,000 trade → $1.00 fee ($0.50 rounds up to min)
- **Example:** 1000 shares of penny stock at $2 = $2,000 trade → $5.00 fee

### Saxo Classic
- **Percentage rate:** 0.08% of trade value, min $1.00
- **Example:** 10 shares of AAPL at $200 = $2,000 trade → $1.60 fee
- **Example:** 100 shares at $200 = $20,000 trade → $16.00 fee

### Commission-free (optional)
- $0 per trade (Robinhood/Schwab model)

## Data Model

### SimulationPortfolio
```
id: uuid
userId: references user
name: string ("Value Picks Q2 2026")
description: string | null
startingCash: decimal (user-chosen, no default — e.g. 6000, 13000, 100000)
currentCash: decimal (computed: starting - sum of purchases)
feeModel: "ibkr_pro" | "saxo_classic" | "commission_free"
createdAt: timestamp
```

### SimulationTrade
```
id: uuid
portfolioId: references portfolio
ticker: string
companyName: string
tradeType: "buy" (later: "sell")
shares: decimal
pricePerShare: decimal (market price at time of trade)
totalCost: decimal (shares * price + fees)
fees: decimal (computed from fee model)
executedAt: timestamp
notes: string | null (why you bought — optional)
```

### SimulationDividend
```
id: uuid
portfolioId: references portfolio
ticker: string
exDate: date
paymentDate: date | null
amountPerShare: decimal
totalAmount: decimal (amountPerShare * shares held at ex-date)
recordedAt: timestamp
```

### Computed views (not stored, derived at query time)

**PortfolioPosition** (per ticker):
- shares held: sum of buys (- sells later)
- average cost basis: weighted average of purchase prices
- total invested: sum of totalCost
- current value: shares * live price
- unrealized P&L: current value - total invested
- unrealized P&L %: (current value - total invested) / total invested
- dividends received: sum of dividend payments
- total return: unrealized P&L + dividends

**PortfolioSummary**:
- total value: cash + sum of position current values
- total invested: starting cash - current cash
- total P&L: total value - starting cash
- total P&L %: total P&L / starting cash
- dividend income: sum of all dividends
- benchmark comparison: vs SPY and sector ETFs over same period

## Benchmark Comparison

For each position AND the portfolio overall, show:
1. **Absolute P&L** — how much you made/lost in dollars and %
2. **vs SPY** — if you'd put the same money into SPY at the same time, what would it be worth?
3. **vs Sector ETF** — same, but using the sector ETF (XLK for tech stocks, XLF for financials, etc.)

This answers: "Am I actually beating the market, or would an index fund have been better?"

### How benchmark comparison works
When a trade is executed, record:
- SPY price at execution time
- Sector ETF price at execution time

Then at any point: `benchmark_value = (trade_amount / benchmark_price_at_trade) * benchmark_current_price`

## Dividend Tracking

### Discovery
Use Yahoo's chart endpoint with `events=div` to get historical dividend events:
```
GET /v8/finance/chart/{ticker}?period1={buy_date}&period2={now}&interval=1mo&events=div
```

### Logic
For each position in a portfolio:
1. Fetch dividend events since the purchase date
2. For each ex-date where the user held shares, record the dividend payment
3. `totalAmount = amountPerShare * sharesHeldAtExDate`

### Refresh
Run dividend check on portfolio view (lazy) or via cron (daily).

## UI Integration Points

### Stock Valuation Page
- "Simulate Buy" button in the header area
- Opens modal: select portfolio, enter shares, shows live price + fee estimate + total cost
- After purchase: small badge showing "In portfolio: {name}" on the stock page

### Industry Screen Results
- "Simulate Buy" action on each stock row in the screen results
- Same modal flow

### Portfolio Dashboard (new page: /portfolios)
- List of portfolios with summary stats (value, P&L, P&L%)
- Click into portfolio → positions table with live prices, P&L, dividends
- Benchmark comparison chart (portfolio value vs SPY vs sector over time)
- Trade history log

### Portfolio Detail Page (/portfolios/[id])
- Summary cards: total value, cash, invested, P&L, dividend income
- Positions table: ticker, shares, avg cost, current price, P&L, P&L%, dividends
- Benchmark comparison: line chart or table showing portfolio vs SPY vs sector ETF
- Recent trades list
- Recent dividends list

## Implementation Plan

### Phase 1 — Schema + API
- Add portfolio, trade, dividend tables to schema
- Push schema to DB
- Build CRUD API routes: create portfolio, execute trade, list positions

### Phase 2 — Portfolio Dashboard
- /portfolios page with portfolio cards
- /portfolios/[id] detail page with positions + P&L

### Phase 3 — Simulate Buy Integration
- "Simulate Buy" modal component
- Wire into stock valuation page
- Wire into industry screen results

### Phase 4 — Benchmark Comparison
- Record SPY + sector ETF price at trade time
- Compute benchmark returns
- Comparison display (table + chart)

### Phase 5 — Dividend Tracking
- Dividend fetch from Yahoo
- Dividend recording logic
- Display in portfolio detail

## API Routes

```
POST   /api/portfolios                    — create portfolio
GET    /api/portfolios                    — list user's portfolios
GET    /api/portfolios/[id]              — portfolio detail + positions + P&L
DELETE /api/portfolios/[id]              — delete portfolio
POST   /api/portfolios/[id]/trades       — execute simulated trade
GET    /api/portfolios/[id]/trades       — trade history
GET    /api/portfolios/[id]/dividends    — dividend history
POST   /api/portfolios/[id]/refresh-dividends — fetch latest dividends
GET    /api/portfolios/[id]/benchmarks   — benchmark comparison data
```

## Fee Calculation Functions

```typescript
function calculateIBKRFee(shares: number, pricePerShare: number): number {
  const perShareFee = shares * 0.005;
  const maxFee = shares * pricePerShare * 0.01; // 1% cap
  return Math.max(1.00, Math.min(perShareFee, maxFee));
}

function calculateSaxoFee(shares: number, pricePerShare: number): number {
  const tradeValue = shares * pricePerShare;
  return Math.max(1.00, tradeValue * 0.0008); // 0.08%, min $1
}

function calculateFee(model: FeeModel, shares: number, price: number): number {
  switch (model) {
    case "ibkr_pro": return calculateIBKRFee(shares, price);
    case "saxo_classic": return calculateSaxoFee(shares, price);
    case "commission_free": return 0;
  }
}
```

## Future Extensions (v2+)

- **Sell orders** — close positions, realize P&L
- **Limit orders** — set a target price, auto-execute when reached
- **Portfolio rebalancing** — suggest trades to reach target allocations
- **Tax lot tracking** — FIFO/LIFO cost basis for tax calculations
- **Alerts** — notify when a position hits a P&L threshold
- **Share portfolios** — public link to share your simulation with others
