process.env.NEXTAUTH_URL = 'https://opentranscripts.example/';
jest.mock('next/headers', () => ({
    headers: jest.fn().mockResolvedValue(new Headers({ host: 'opentranscripts.example' })),
    cookies: jest.fn().mockResolvedValue({ get: () => undefined }),
}));
const mockIsGenericMode = jest.fn(() => true);
jest.mock('@/lib/genericMode', () => ({ isGenericMode: () => mockIsGenericMode() }));

import { getMetadataBaseFromRequest, getRealmBaseUrlFromRequest } from '@/lib/realm.server';

/**
 * The OpenTranscripts host is unknown to the realm code, which resolves it to
 * greece. Its canonical URLs, sitemap and share images must name its own host.
 */
describe('the base URL of a request', () => {
    it('is the NEXTAUTH_URL origin in generic mode', async () => {
        expect(await getRealmBaseUrlFromRequest()).toBe('https://opentranscripts.example');
        expect(await getMetadataBaseFromRequest()).toBe('https://opentranscripts.example');
    });

    it('is the realm domain in council mode', async () => {
        mockIsGenericMode.mockReturnValue(false);
        expect(await getRealmBaseUrlFromRequest()).toBe('https://opencouncil.gr');
    });
});
