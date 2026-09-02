import { DexError, zAuthNonceRequest, zAuthVerifyRequest } from '@dex/shared';
/** Stricter per-route rate limit for the auth endpoints (when limiting is on). */
export function registerAuthRoutes(app, svc, authMax) {
    const { auth, repos } = svc;
    const config = {
        rateLimit: authMax !== undefined ? { max: authMax, timeWindow: 60_000 } : false,
    };
    app.post('/api/auth/nonce', { config }, async (req) => {
        const { address } = zAuthNonceRequest.parse(req.body);
        return { nonce: await auth.issueNonce(address) };
    });
    app.post('/api/auth/verify', { config }, async (req) => {
        const { address, signature } = zAuthVerifyRequest.parse(req.body);
        const ok = await auth.verifySignature(address, signature);
        if (!ok)
            throw new DexError('NOT_AUTHORIZED', 'signature verification failed');
        await repos.users.getOrCreate(address, Date.now());
        return { token: await auth.issueToken(address) };
    });
}
