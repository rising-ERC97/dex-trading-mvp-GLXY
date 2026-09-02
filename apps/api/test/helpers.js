import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toUnits } from '@dex/shared';
import { buildServices } from '../src/services.js';
import { buildApp } from '../src/server.js';
export const u = toUnits;
/**
 * Synthetic USDC-quoted test markets — deterministic ticks/lots so assertions
 * are exact. Distinct maker/taker fees (5/10 bps) verify the engine reads
 * per-market fees rather than a global constant.
 */
export const TEST_SPOT = {
    id: 'TBT-USDC',
    type: 'spot',
    base: 'TBT',
    quote: 'USDC',
    englishName: 'Testbit',
    tickSize: u('0.01'),
    lotSize: u('0.001'),
    minNotional: u('1'),
    makerFeeBps: 5,
    takerFeeBps: 10,
    maxLeverage: 1,
};
export const TEST_PERP = {
    id: 'TBT-PERP',
    type: 'perp',
    base: 'TBT',
    quote: 'USDC',
    englishName: 'Testbit Perp',
    tickSize: u(1),
    lotSize: u('0.001'),
    minNotional: u(10),
    makerFeeBps: 2,
    takerFeeBps: 5,
    maxLeverage: 20,
};
export async function makeApp(opts = {}) {
    const svc = await buildServices({
        universe: [TEST_SPOT, TEST_PERP],
        feeds: false,
        marketMaker: false,
        funding: false,
        jwtSecret: 'test-secret',
        log: () => { },
        ...opts,
    });
    const app = await buildApp(svc);
    return {
        svc,
        app,
        async stop() {
            await app.close();
            await svc.stop();
        },
    };
}
/** Full wallet-signature login flow against the real auth endpoints. */
export async function login(app) {
    const account = privateKeyToAccount(generatePrivateKey());
    const address = account.address.toLowerCase();
    const nonceRes = await app.inject({
        method: 'POST',
        url: '/api/auth/nonce',
        payload: { address },
    });
    if (nonceRes.statusCode !== 200)
        throw new Error(`nonce failed: ${nonceRes.body}`);
    const { nonce } = nonceRes.json();
    const signature = await account.signMessage({ message: nonce });
    const verifyRes = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { address, signature },
    });
    if (verifyRes.statusCode !== 200)
        throw new Error(`verify failed: ${verifyRes.body}`);
    const { token } = verifyRes.json();
    return { account, address, token };
}
export async function loginAndFund(app) {
    const user = await login(app);
    const res = await authed(app, user, 'POST', '/api/account/faucet');
    if (res.statusCode !== 200)
        throw new Error(`faucet failed: ${res.body}`);
    return user;
}
export async function authed(app, user, method, url, payload) {
    return app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${user.token}` },
        ...(payload !== undefined ? { payload: payload } : {}),
    });
}
export async function placeOrder(app, user, body) {
    return authed(app, user, 'POST', '/api/orders', body);
}
