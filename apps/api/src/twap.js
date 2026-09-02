/**
 * TWAP (time-weighted average price) parent orders. A TWAP slices a large order
 * into N equal child orders submitted at even intervals across a duration, so
 * the average fill price tracks the time-weighted market instead of moving it
 * all at once. Children are REAL orders through the same engine/pipeline path as
 * any other order — the scheduler only decides when each slice fires.
 *
 * Parent schedules are durable in `twap_jobs` and restored on boot; child fills
 * remain normal orders/trades via the pipeline.
 */
import { DexError, mulDiv, roundToLot, roundToTick, } from '@dex/shared';
const TICK_MS = 1_000;
/** finished/cancelled jobs linger this long so a client can read final state */
const RETAIN_MS = 10 * 60_000;
function view(j) {
    return {
        id: j.id,
        marketId: j.marketId,
        side: j.side,
        totalQty: j.totalQty,
        filledQty: j.filledQty,
        sliceQty: j.sliceQty,
        slicesDone: j.slicesDone,
        slicesTotal: j.slicesTotal,
        type: j.type,
        limitPrice: j.limitPrice,
        intervalMs: j.intervalMs,
        nextRunTs: j.status === 'running' ? j.nextRunTs : 0,
        status: j.status,
        createdTs: j.createdTs,
    };
}
export class TwapScheduler {
    #svc;
    #jobs = new Map();
    #seq = 0;
    #ticking = false;
    constructor(svc) {
        this.#svc = svc;
    }
    /** Restore durable running jobs after boot (ids reserved so new jobs don't collide). */
    restore(jobs) {
        let maxSeq = 0;
        for (const job of jobs) {
            this.#jobs.set(job.id, { ...job });
            const m = /^twap(\d+)$/.exec(job.id);
            if (m)
                maxSeq = Math.max(maxSeq, Number(m[1]));
        }
        this.#seq = Math.max(this.#seq, maxSeq);
    }
    async #persist(job) {
        await this.#svc.repos.twapJobs.upsert({
            id: job.id,
            userId: job.userId,
            marketId: job.marketId,
            side: job.side,
            type: job.type,
            limitPrice: job.limitPrice,
            reduceOnly: job.reduceOnly,
            totalQty: job.totalQty,
            sliceQty: job.sliceQty,
            filledQty: job.filledQty,
            slicesTotal: job.slicesTotal,
            slicesDone: job.slicesDone,
            intervalMs: job.intervalMs,
            nextRunTs: job.nextRunTs,
            createdTs: job.createdTs,
            endedTs: job.endedTs,
            status: job.status,
        });
    }
    async create(input, now) {
        const m = this.#svc.engine.getMarket(input.marketId);
        if (!m)
            throw new DexError('MARKET_NOT_FOUND', `unknown market ${input.marketId}`);
        if (input.reduceOnly && m.type !== 'perp') {
            throw new DexError('INVALID_ORDER', 'reduceOnly is only valid on perp markets');
        }
        // equal slices rounded to the lot; the final slice carries any remainder so
        // the children sum to exactly totalQty
        const sliceQty = roundToLot(input.totalQty / BigInt(input.slices), m.lotSize);
        if (sliceQty <= 0n) {
            throw new DexError('INVALID_ORDER', 'slice qty below lot size — fewer slices or more qty');
        }
        if (input.type === 'limit') {
            const p = input.limitPrice;
            if (p === undefined || p <= 0n || p % m.tickSize !== 0n) {
                throw new DexError('TICK_SIZE', 'limit price not a positive tick multiple');
            }
        }
        const id = `twap${++this.#seq}`;
        const job = {
            id,
            userId: input.userId,
            marketId: input.marketId,
            side: input.side,
            type: input.type,
            limitPrice: input.limitPrice ?? null,
            reduceOnly: input.reduceOnly,
            totalQty: input.totalQty,
            sliceQty,
            filledQty: 0n,
            slicesTotal: input.slices,
            slicesDone: 0,
            intervalMs: Math.floor(input.durationMs / input.slices),
            nextRunTs: now, // first slice fires on the next tick
            createdTs: now,
            endedTs: 0,
            status: 'running',
        };
        this.#jobs.set(id, job);
        await this.#persist(job);
        return view(job);
    }
    listFor(userId) {
        return [...this.#jobs.values()]
            .filter((j) => j.userId === userId)
            .sort((a, b) => b.createdTs - a.createdTs)
            .map(view);
    }
    async cancel(userId, id, now) {
        const job = this.#jobs.get(id);
        if (!job || job.userId !== userId)
            throw new DexError('ORDER_NOT_FOUND', `unknown twap ${id}`);
        if (job.status === 'running') {
            job.status = 'cancelled';
            job.endedTs = now;
            await this.#persist(job);
        }
        return view(job);
    }
    /** Fire every slice whose time has come, then evict long-finished jobs. */
    async tick(now) {
        // re-entrancy guard: the wall-clock ticker can fire again before a slow
        // slice's async submit resolves; without this, two ticks could double-fire
        if (this.#ticking)
            return;
        this.#ticking = true;
        try {
            for (const job of this.#jobs.values()) {
                if (job.status === 'running' && now >= job.nextRunTs) {
                    await this.#runSlice(job, now);
                }
            }
            for (const [id, job] of this.#jobs) {
                if (job.status !== 'running' && job.endedTs > 0 && now - job.endedTs > RETAIN_MS) {
                    this.#jobs.delete(id);
                    await this.#svc.repos.twapJobs.delete(id).catch(() => undefined);
                }
            }
        }
        finally {
            this.#ticking = false;
        }
    }
    async #runSlice(job, now) {
        const remainingSlices = job.slicesTotal - job.slicesDone;
        // the last slice carries the remainder so the children sum to totalQty
        const qty = remainingSlices === 1
            ? job.totalQty - job.sliceQty * BigInt(job.slicesTotal - 1)
            : job.sliceQty;
        // RESERVE this slice's slot BEFORE awaiting the pipeline: advance the
        // counter + next-run time up front so an overlapping tick (the prior async
        // submit hasn't resolved yet) can never re-select and double-fire this slice.
        job.slicesDone += 1;
        if (job.slicesDone >= job.slicesTotal) {
            job.status = 'done';
            job.endedTs = now;
        }
        else {
            job.nextRunTs = now + job.intervalMs;
        }
        await this.#persist(job);
        if (qty > 0n) {
            try {
                const request = this.#childRequest(job, qty);
                const events = await this.#svc.pipeline.run(() => {
                    const evts = this.#svc.engine.submitOrder(job.userId, request, now);
                    return [evts, evts];
                });
                for (const e of events) {
                    if (e.kind === 'trade' && (e.trade.takerUserId === job.userId || e.trade.makerUserId === job.userId)) {
                        job.filledQty += e.trade.qty;
                    }
                }
                await this.#persist(job);
            }
            catch (e) {
                this.#svc.log(`twap ${job.id} slice failed: ${String(e)}`);
                // best-effort: a failed slice still advances the schedule (already reserved)
            }
        }
    }
    /** Build the child OrderRequest for this slice (market gets a ±5% bound). */
    #childRequest(job, qty) {
        const base = {
            marketId: job.marketId,
            side: job.side,
            type: job.type,
            qty,
            tif: job.type === 'limit' ? 'GTC' : 'IOC',
            reduceOnly: job.reduceOnly,
        };
        if (job.type === 'limit') {
            base.price = job.limitPrice;
            return base;
        }
        base.price = this.#marketBound(job);
        return base;
    }
    /** Worst-price bound for a market child: best opposite price ±5%, tick-aligned. */
    #marketBound(job) {
        const { engine, priceCache } = this.#svc;
        const m = engine.getMarket(job.marketId);
        const book = engine.getOrderbook(job.marketId, 1);
        const best = job.side === 'buy' ? book.asks[0]?.price : book.bids[0]?.price;
        const ref = best ?? priceCache.get(job.marketId)?.price;
        if (ref === undefined || ref <= 0n) {
            throw new DexError('INVALID_ORDER', 'no reference price for TWAP market slice');
        }
        return job.side === 'buy'
            ? roundToTick(mulDiv(ref, 105n, 100n), m.tickSize, 'floor')
            : roundToTick(mulDiv(ref, 95n, 100n), m.tickSize, 'ceil');
    }
}
export function startTwap(svc, scheduler) {
    let stopped = false;
    const timer = setInterval(() => {
        if (stopped)
            return;
        void scheduler.tick(Date.now());
    }, TICK_MS);
    timer.unref?.();
    return {
        stop() {
            stopped = true;
            clearInterval(timer);
        },
    };
}
