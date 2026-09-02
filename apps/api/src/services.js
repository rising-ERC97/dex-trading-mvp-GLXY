import { Exchange } from '@dex/engine';
import { Projector, createDb, createRepos } from '@dex/db';
import { CandleService, HyperliquidRest, PriceCache, UpbitRest, buildPerpMarkets, buildSpotMarkets, spotMarketIdForUpbitCode, } from '@dex/market-data';
import { AuthService } from './auth.js';
import { Pipeline } from './pipeline.js';
import { WsHub } from './wsHub.js';
import { startFeeds } from './feeds.js';
import { startBookMirror } from './bookMirror.js';
import { startFunding } from './funding.js';
import { TwapScheduler, startTwap } from './twap.js';
import { startRetention } from './retention.js';
const TICKER_CHUNK = 100;
export async function fetchTickersChunked(upbit, codes) {
    const out = [];
    for (let i = 0; i < codes.length; i += TICKER_CHUNK) {
        out.push(...(await upbit.fetchTickers(codes.slice(i, i + TICKER_CHUNK))));
    }
    return out;
}
/**
 * Boot order matters: persisted market configs are merged with the freshly
 * fetched real universe (fresh wins), the engine is constructed with the full
 * market list, and only then is the durable projection restored into it.
 */
export async function buildServices(opts) {
    const log = opts.log ?? ((m) => console.log(`[dex-api] ${m}`));
    const db = await createDb({
        dataDir: opts.dataDir,
        databaseUrl: opts.databaseUrl ?? process.env.DATABASE_URL,
    });
    const repos = createRepos(db.db);
    const projector = new Projector(db.db);
    const upbit = new UpbitRest();
    const hl = new HyperliquidRest();
    const byId = new Map();
    for (const m of await repos.markets.list())
        byId.set(m.id, m);
    let spotTickers = [];
    if (opts.universe === 'live') {
        const raw = await upbit.fetchMarkets();
        // a DEX settles in USDC — mirror Upbit's real USDT stablecoin books
        const usdtCodes = raw
            .filter((m) => m.market.startsWith('USDT-') && m.market !== 'USDT-USDT')
            .map((m) => m.market);
        const usdtTickers = await fetchTickersChunked(upbit, usdtCodes); // keyed by USDT-<base>
        const spot = buildSpotMarkets(raw, usdtTickers);
        const [meta, mids] = await Promise.all([hl.meta(), hl.allMids()]);
        const perp = buildPerpMarkets(meta, mids, opts.perpTopN ?? 30);
        for (const m of [...spot, ...perp])
            byId.set(m.id, m);
        // relabel USDT-<base> → <base>-USDC for the engine/price-cache namespace
        spotTickers = usdtTickers.map((t) => ({ ...t, marketId: spotMarketIdForUpbitCode(t.marketId) }));
        log(`live universe: ${spot.length} USDC spot + ${perp.length} perp markets`);
    }
    else {
        for (const m of opts.universe)
            byId.set(m.id, m);
    }
    const markets = [...byId.values()];
    await repos.markets.upsertAll(markets);
    // ADL on in production: bad debt is socialized onto profitable counterparties
    // (auto-deleverage) before the house clearing account absorbs any remainder
    const engine = new Exchange({ markets, adl: true });
    const restored = await repos.loadRestoreState();
    engine.restoreState(restored);
    if (restored.lastSeq > 0) {
        log(`restored state @seq=${restored.lastSeq}: ${restored.openOrders.length} open orders, ${restored.positions.length} positions`);
    }
    const auth = new AuthService(opts.jwtSecret ?? process.env.DEX_JWT_SECRET ?? 'dex-dev-secret', repos.nonces);
    const hub = new WsHub(engine, (t) => auth.verifyToken(t));
    const pipeline = new Pipeline(projector, hub, {
        onPoison: (err) => {
            log(`FATAL: durable projection failed — pipeline halted to avoid engine/DB divergence: ${String(err)}`);
            opts.onFatal?.(err);
        },
    });
    const priceCache = new PriceCache();
    const candles = new CandleService(upbit, hl);
    priceCache.on('ticker', (t) => hub.publishTicker(t));
    // seed spot tickers fetched at boot so /api/markets has prices immediately
    for (const t of spotTickers)
        priceCache.setTicker(t);
    const stoppables = [];
    // periodic auth nonce GC (issueNonce also sweeps opportunistically)
    const nonceSweep = setInterval(() => {
        void auth.sweepExpired().catch(() => undefined);
    }, 60_000);
    nonceSweep.unref?.();
    stoppables.push({
        stop() {
            clearInterval(nonceSweep);
        },
    });
    const services = {
        db,
        repos,
        projector,
        engine,
        auth,
        hub,
        pipeline,
        priceCache,
        candles,
        twap: undefined, // assigned just below (needs `services`)
        upbit,
        hl,
        rateLimit: opts.rateLimit ?? false,
        trustProxy: opts.trustProxy ?? false,
        logger: opts.logger ?? false,
        log,
        async stop() {
            for (const s of stoppables)
                s.stop();
            hub.close();
            await pipeline.drain();
            await db.close();
        },
    };
    services.twap = new TwapScheduler(services);
    const runningTwaps = await repos.twapJobs.loadRunning();
    if (runningTwaps.length > 0) {
        services.twap.restore(runningTwaps);
        log(`restored ${runningTwaps.length} running TWAP schedule(s)`);
    }
    if (opts.feeds)
        stoppables.push(startFeeds(services));
    if (opts.marketMaker)
        stoppables.push(startBookMirror(services));
    if (opts.funding)
        stoppables.push(startFunding(services));
    if (opts.twap)
        stoppables.push(startTwap(services, services.twap));
    if (opts.retention)
        stoppables.push(startRetention(services));
    return services;
}
