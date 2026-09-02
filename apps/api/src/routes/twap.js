import { jsonSafe, zTwapRequest } from '@dex/shared';
export function registerTwapRoutes(app, svc, authenticate) {
    const { twap } = svc;
    // create a TWAP parent order (slices a large order over time)
    app.post('/api/twap', { preHandler: authenticate }, async (req) => {
        const p = zTwapRequest.parse(req.body);
        const job = await twap.create({
            userId: req.userId,
            marketId: p.marketId,
            side: p.side,
            totalQty: p.totalQty,
            durationMs: p.durationMs,
            slices: p.slices,
            type: p.type,
            ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}),
            reduceOnly: p.reduceOnly,
        }, Date.now());
        return jsonSafe(job);
    });
    // a user's TWAP parent orders (running + recently finished)
    app.get('/api/twap', { preHandler: authenticate }, (req) => {
        return jsonSafe(twap.listFor(req.userId));
    });
    // cancel a running TWAP's remaining slices (filled slices stand)
    app.delete('/api/twap/:id', { preHandler: authenticate }, async (req) => {
        const { id } = req.params;
        return jsonSafe(await twap.cancel(req.userId, id, Date.now()));
    });
}
