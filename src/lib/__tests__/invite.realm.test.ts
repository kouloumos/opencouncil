/**
 * The realm half of the invite link, which needs a production-apex
 * NEXTAUTH_URL to be observable at all — `invite.test.ts` deliberately mocks a
 * non-apex host, where `realmBaseUrl` keeps the configured value.
 */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { verificationToken: { create: jest.fn(), deleteMany: jest.fn() } },
}));
jest.mock('@/lib/email/resend', () => ({ sendEmail: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('@react-email/render', () => ({ render: jest.fn().mockResolvedValue('<html/>') }));
jest.mock('@/lib/email/templates/user-invite', () => ({ UserInviteEmail: jest.fn(() => null) }));

const mockGetCityRealm = jest.fn<Promise<'greece' | 'france' | null>, [string]>();
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: (cityId: string) => mockGetCityRealm(cityId) }));

import { generateSignInLink } from '../auth/invite';

const reqFrom = (host: string) =>
    new Request('https://opencouncil.gr/api/admin/users', { headers: { 'x-forwarded-host': host } });

beforeEach(() => {
    mockGetCityRealm.mockReset();
    mockGetCityRealm.mockResolvedValue('france');
});

describe('generateSignInLink', () => {
    it("uses the invited city's realm, not the host the admin invited from", async () => {
        const { signInUrl } = await generateSignInLink('a@b.c', {
            request: reqFrom('opencouncil.gr'),
            cityIds: ['rennes'],
        });
        expect(mockGetCityRealm).toHaveBeenCalledWith('rennes');
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.fr');
    });

    it('skips entries that administer no city', async () => {
        await generateSignInLink('a@b.c', { cityIds: [null, undefined, 'rennes'] });
        expect(mockGetCityRealm).toHaveBeenCalledWith('rennes');
    });

    it("falls back to the admin's host when the invitee administers no city", async () => {
        const { signInUrl } = await generateSignInLink('a@b.c', { request: reqFrom('opencouncil.cy') });
        expect(mockGetCityRealm).not.toHaveBeenCalled();
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.cy');
    });

    it('refuses a host that is not one of ours', async () => {
        const { signInUrl } = await generateSignInLink('a@b.c', { request: reqFrom('evil.example.com') });
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.gr');
    });

    it('keeps the configured host with neither a city nor a request', async () => {
        const { signInUrl } = await generateSignInLink('a@b.c');
        expect(new URL(signInUrl).origin).toBe('https://opencouncil.gr');
    });
});
