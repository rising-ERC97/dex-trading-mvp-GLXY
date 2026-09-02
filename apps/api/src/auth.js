import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { verifyMessage } from 'viem';
const NONCE_TTL_MS = 5 * 60_000;
const TOKEN_TTL = '24h';
/**
 * Wallet-signature auth: the client signs the issued nonce string (EIP-191
 * personal_sign via viem) and exchanges it for a JWT. Nonces are single-use,
 * expire after 5 minutes, and are durable in `auth_nonces` via repos.nonces.
 */
export class AuthService {
    #nonces;
    #secret;
    #now;
    constructor(jwtSecret, noncesRepo, now = () => Date.now()) {
        this.#secret = new TextEncoder().encode(jwtSecret);
        this.#nonces = noncesRepo;
        this.#now = now;
    }
    async issueNonce(address) {
        const nonce = `dex-login:${randomUUID()}`;
        const now = this.#now();
        await this.#nonces.issue(address, nonce, NONCE_TTL_MS, now);
        // opportunistic GC — spray of distinct addresses cannot grow forever
        await this.#nonces.sweepExpired(now);
        return nonce;
    }
    /** Verifies the signature over the latest issued nonce; consumes the nonce. */
    async verifySignature(address, signature) {
        const key = address.toLowerCase();
        const nonce = await this.#nonces.takeLatest(key, this.#now());
        if (!nonce)
            return false;
        try {
            return await verifyMessage({
                address: key,
                message: nonce,
                signature,
            });
        }
        catch {
            return false;
        }
    }
    async issueToken(address) {
        return new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(address.toLowerCase())
            .setIssuedAt()
            .setExpirationTime(TOKEN_TTL)
            .sign(this.#secret);
    }
    /** Returns the authenticated address, or null for any invalid/expired token. */
    async verifyToken(token) {
        try {
            const { payload } = await jwtVerify(token, this.#secret);
            return typeof payload.sub === 'string' && /^0x[0-9a-f]{40}$/.test(payload.sub)
                ? payload.sub
                : null;
        }
        catch {
            return null;
        }
    }
    /** Periodic GC hook (also called from issueNonce). */
    async sweepExpired() {
        return this.#nonces.sweepExpired(this.#now());
    }
}
