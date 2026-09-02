/**
 * DEX API server entrypoint: real Upbit+Hyperliquid universe, live feeds,
 * liquidity bot, hourly funding, durable PGlite projection.
 */
import { buildServices } from './services.js';
import { buildApp } from './server.js';
const PORT = Number(process.env.DEX_PORT ?? 3001);
const HOST = process.env.DEX_HOST ?? '127.0.0.1';
const DATA_DIR = process.env.DEX_DATA_DIR ?? '.pglite-data';
async function main() {
    const quiet = process.env.DEX_QUIET === '1';
    const services = await buildServices({
        dataDir: DATA_DIR,
        databaseUrl: process.env.DATABASE_URL,
        universe: 'live',
        feeds: true,
        marketMaker: true,
        funding: true,
        twap: true,
        retention: true,
        // a projection failure means engine and durable store have diverged — exit
        // non-zero so the supervisor restarts and boot-restore re-establishes a
        // consistent engine from the last durable watermark
        onFatal: () => {
            setTimeout(() => process.exit(70), 50);
        },
        // generous enough for an active trader, hostile to scrapers/bots
        rateLimit: { max: 600, windowSec: 60, authMax: 30 },
        // Quiet by default under `pnpm start` (DEX_QUIET=1). Override with DEX_LOG_LEVEL.
        logger: quiet
            ? false
            : { level: process.env.DEX_LOG_LEVEL ?? 'info' },
        log: quiet ? () => undefined : undefined,
    });
    const app = await buildApp(services);
    await app.listen({ port: PORT, host: HOST });
    if (!quiet) {
        services.log(`listening on http://${HOST}:${PORT} (markets: ${services.engine.getMarkets().length})`);
    }
    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        if (!quiet)
            services.log(`${signal} — shutting down`);
        void app
            .close()
            .then(() => services.stop())
            .then(() => process.exit(0))
            .catch((e) => {
            console.error(e);
            process.exit(1);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch((e) => {
    console.error('[dex-api] fatal boot error:', e);
    process.exit(1);
});
