/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod',
        NEXTAUTH_URL: 'https://opencouncil.gr',
    },
}));

import {
    generateUnsubscribeToken,
    verifyUnsubscribeToken,
    buildUnsubscribeUrl,
} from '../tokens';

describe('generateUnsubscribeToken / verifyUnsubscribeToken', () => {
    it('round-trips a valid token back to the original userId and cityId', () => {
        const token = generateUnsubscribeToken('user-1', 'city-1');
        const data = verifyUnsubscribeToken(token);

        expect(data).not.toBeNull();
        expect(data!.userId).toBe('user-1');
        expect(data!.cityId).toBe('city-1');
        expect(data!.exp).toBeGreaterThan(Date.now());
    });

    it('produces tokens in the form payload.signature', () => {
        const token = generateUnsubscribeToken('u', 'c');
        expect(token.split('.')).toHaveLength(2);
    });

    it('returns null for a token with a tampered payload', () => {
        const token = generateUnsubscribeToken('user-1', 'city-1');
        const [, signature] = token.split('.');

        const forgedPayload = Buffer.from(
            JSON.stringify({ userId: 'not-user-1', cityId: 'city-1', exp: Date.now() + 1000 })
        ).toString('base64url');

        expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeNull();
    });

    it('returns null for a token with a tampered signature', () => {
        const token = generateUnsubscribeToken('user-1', 'city-1');
        const [payload] = token.split('.');
        expect(verifyUnsubscribeToken(`${payload}.bogus`)).toBeNull();
    });

    it('returns null for malformed tokens', () => {
        expect(verifyUnsubscribeToken('')).toBeNull();
        expect(verifyUnsubscribeToken('no-dot-here')).toBeNull();
        expect(verifyUnsubscribeToken('.only-signature')).toBeNull();
        expect(verifyUnsubscribeToken('only-payload.')).toBeNull();
    });

    it('returns null for an expired token', () => {
        const token = generateUnsubscribeToken('user-1', 'city-1');
        const realNow = Date.now;
        try {
            Date.now = () => realNow() + 31 * 24 * 60 * 60 * 1000; // +31 days
            expect(verifyUnsubscribeToken(token)).toBeNull();
        } finally {
            Date.now = realNow;
        }
    });
});

describe('buildUnsubscribeUrl', () => {
    it('defaults to the /el/ locale when none is provided', () => {
        const url = buildUnsubscribeUrl('user-1', 'city-1');
        expect(url.startsWith('https://opencouncil.gr/el/unsubscribe?token=')).toBe(true);
    });

    it('interpolates the provided locale into the path', () => {
        const url = buildUnsubscribeUrl('user-1', 'city-1', 'en');
        expect(url.startsWith('https://opencouncil.gr/en/unsubscribe?token=')).toBe(true);
    });

    it('produces a URL whose token round-trips through verify', () => {
        const url = buildUnsubscribeUrl('user-1', 'city-1');
        const token = decodeURIComponent(url.split('token=')[1]);

        const data = verifyUnsubscribeToken(token);
        expect(data).not.toBeNull();
        expect(data!.userId).toBe('user-1');
        expect(data!.cityId).toBe('city-1');
    });
});
