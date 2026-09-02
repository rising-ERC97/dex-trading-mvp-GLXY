# Realtime DEX Trading Platform

A full-stack, real-time crypto **DEX trading platform** built from scratch — real
matching engine, perpetual futures + spot, USDC-settled — running on **100% real,
live market data**. The only thing that isn't real money is the demo faucet balance
(testnet-style), exactly like a real exchange's testnet.

> Spot markets mirror **Upbit's real USDT order books** (191 markets); perps use
> **Hyperliquid's real markets** (30 markets). Prices, order-book depth (price
> **and** size), candles, trades, 24h stats and funding are all fetched live —
> never mocked, never hardcoded.

![DEX landing page](./landing.png)

---



## What's real


| Data                                              | Source                                 | Notes                                                    |
| ------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Spot price / order book / trades / candles        | **Upbit** USDT markets, live WS + REST | book is a 1:1 mirror of the venue (prices **and** sizes) |
| Perp price / order book / trades / funding        | **Hyperliquid** live WS + REST         | 30 markets, real funding rates                           |
| Coin universe + English names + tick/lot/leverage | real exchange metadata                 | 191 spot + 30 perp                                       |
| Wallet auth                                       | MetaMask / EIP-1193 + EIP-191 → JWT    | `viem`                                                   |
| Database                                          | real Postgres engine (PGlite)          | durable event-sourced projection                         |
| **Balances**                                      | **demo faucet (testnet-style)**        | the *only* non-real value                                |


The order book you see is provably the venue's: a user's bid rests inside the real
spread and only fills when the real market crosses it. A feed-staleness gate takes a
book **down** (rather than serving a frozen one as "live") when the source WS drops.

## Features

- **Matching engine** — price-time priority limit order book; `limit`/`market`,
`GTC`/`IOC`/`FOK`, `postOnly`/`reduceOnly`, self-trade prevention.
- **Perpetuals** — isolated margin, leverage, volume-weighted entry, **tiered
maintenance margin** (bigger positions liquidate with more buffer), hourly
funding (zero-sum, rounding-exact).
- **Manipulation-resistant mark price** — the perp mark is a **median of
multiple real venues** (Hyperliquid mid + OKX swap + Coinbase spot) smoothed
by an EMA, so no single source can move it; liquidations trigger on it.
- **Liquidation waterfall** — maintenance liquidation → insurance fund → **ADL**
(auto-deleverage profitable counterparties, haircut by deficit share) → house
clearing. No user is ever pushed negative; the house absorbs only the
irreducible remainder.
- **Money conservation** — proven by property tests: assets + fees + clearing
always equal net deposits, after *every* operation; bad debt is mathematically
confined to the house account.
- **Real-time UI** — professional dark trading interface: pro candlestick
chart with indicators (MA/EMA/BOLL/VOL/MACD/RSI/KDJ via klinecharts),
live order book + trade tape over WebSocket, order entry with leverage,
positions/orders/fills/balances, virtualized 221-market selector.
- **Ops admin console** — local read-only operator UI on `:5181` with
Overview (health / ready / pressure / activity counters), Feeds (per-market
live vs stale), Risk (fee + clearing accounts, liquidations, funding), and
Markets (search / filter / mark / funding). Backed by `GET /api/ops/summary`
plus existing health / metrics / markets endpoints.
- **Production hardening** — JWT auth, per-IP rate limiting, `@fastify/under-pressure`
load shedding, `prom-client` Prometheus metrics (`/api/metrics`), generated
OpenAPI docs (`/api/docs`), `@fastify/helmet` security headers, pino structured
logging, write-ahead fail-stop durability, graceful restore-on-restart.



## Architecture (TypeScript monorepo, pnpm workspaces)

```
packages/
  shared        types, zod schemas, fixed-point bigint math (everything is 1e8-scaled bigint — never float)
  engine        pure, deterministic matching engine + margin/liquidation/funding (no I/O)
  db            Drizzle ORM + PGlite; event projector + boot restore
  market-data   Upbit + Hyperliquid + OKX + Coinbase connectors (real data, multi-source oracle)
apps/
  api           Fastify 5 REST + WebSocket; wires market-data → engine → db
  web           Vite + React 19 platform (landing, markets, portfolio, docs, terminal)
  admin         Local ops console on :5181 (static ES-module UI + API proxy)
e2e             Playwright end-to-end tests against the real stack
```

- **~18,000 lines of TypeScript** (≈1:1 source-to-test ratio).
- **400+ tests**: unit, fast-check **property** tests (fund conservation, book
integrity, reference-matcher cross-check, liquidation solvency, ADL,
manipulation-resistant mark aggregation), real-PGlite integration, **live**
tests against the real Upbit / Hyperliquid / OKX / Coinbase APIs, and a
Playwright e2e suite driving the real stack.



## Run it

Requires **Node 22+** and internet (live market feeds).

```bash
npm install -g pnpm   # once, if you don't have pnpm yet
pnpm install
pnpm start
```

Open **[http://127.0.0.1:5180](http://127.0.0.1:5180)** or **[http://localhost:5180](http://localhost:5180)** (landing) and **[http://127.0.0.1:5181](http://127.0.0.1:5181)** or **[http://localhost:5181](http://localhost:5181)** (ops admin)

Web routes:

- `/` — landing
- `/markets` — market explorer
- `/portfolio` — account hub
- `/docs` — FAQ / product docs
- `/trade` or `/trade/:marketId` — trading terminal

Admin views (`http://127.0.0.1:5181` or `http://localhost:5181`):

- `#overview` — system status, readiness, order/trade counters, process metrics
- `#feeds` — per-market feed health (live / stale)
- `#risk` — fee account, clearing account, liquidations, funding
- `#markets` — searchable spot / perp universe with mark + funding

Startup order under `pnpm start`:

1. API on `:3001`
2. Web on `:5180` (waits until API accepts TCP)
3. Admin on `:5181` (waits until web accepts TCP)

- API docs: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)  
- Metrics: [http://localhost:3001/api/metrics](http://localhost:3001/api/metrics)  
- Ops summary: [http://localhost:3001/api/ops/summary](http://localhost:3001/api/ops/summary)  
- Ops admin: [http://127.0.0.1:5181](http://127.0.0.1:5181) or [http://localhost:5181](http://localhost:5181) (also via `pnpm dev:admin`)

Optional Postgres (instead of embedded PGlite):

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/dex pnpm dev:api
```

Default durable dir remains `DEX_DATA_DIR` / `.pglite-data` when `DATABASE_URL` is unset.

To run services separately (with normal logs): `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:admin`.  
For full logs under `pnpm start`: `DEX_VERBOSE=1 pnpm start`.

Test:

```bash
pnpm -r test                       # unit + integration + property
pnpm --filter @dex/market-data test:live   # live API tests (needs internet)
pnpm --filter @dex/e2e test        # Playwright (boots the real stack)
```



## Disclaimer

This project uses live market **data** but settles trades in **demo faucet
balances only** — there is no custody, no real settlement, and no financial
advice. Not affiliated with Hyperliquid or Upbit.

## License

MIT — see [LICENSE](LICENSE).