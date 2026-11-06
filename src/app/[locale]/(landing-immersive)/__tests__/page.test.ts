const mockEnv: { NEXT_PUBLIC_APP_MODE: 'council' | 'generic' } = { NEXT_PUBLIC_APP_MODE: 'council' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));
jest.mock('next-intl/server', () => ({
    getLocale: jest.fn().mockResolvedValue('el'),
    getTranslations: jest.fn().mockResolvedValue((key: string) => `OpenCouncil ${key}`),
}));
jest.mock('@/lib/utils/hreflang', () => ({ withCanonicalUrl: (_path: string, metadata: object) => metadata }));
jest.mock('@/lib/og/locale', () => ({ buildOgImageUrl: () => '/api/og?pageType=landing' }));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn() }));
jest.mock('@/lib/db/subject', () => ({}));
jest.mock('@/lib/db/cities', () => ({}));
jest.mock('@/lib/db/meetings', () => ({}));
jest.mock('@/components/landing/v2/LandingV2', () => ({ LandingV2: jest.fn() }));
jest.mock('@/components/landing/GenericLandingPage', () => ({ GenericLandingPage: jest.fn() }));

import { generateMetadata } from '@/app/[locale]/(landing-immersive)/page';

const props = { params: Promise.resolve({ locale: 'el' }) };

describe('landing page metadata', () => {
    afterEach(() => {
        mockEnv.NEXT_PUBLIC_APP_MODE = 'council';
    });

    it('names OpenCouncil in council mode', async () => {
        const metadata = await generateMetadata(props);

        expect(metadata.title).toBe('OpenCouncil title');
        expect(metadata.openGraph).toMatchObject({ siteName: 'OpenCouncil' });
    });

    it('leaves the OpenTranscripts metadata of the root layout in place in generic mode', async () => {
        mockEnv.NEXT_PUBLIC_APP_MODE = 'generic';

        expect(await generateMetadata(props)).toEqual({});
    });
});
