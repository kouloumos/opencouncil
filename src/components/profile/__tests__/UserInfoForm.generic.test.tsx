import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@prisma/client';
import { UserInfoForm } from '../UserInfoForm';

jest.mock('next-intl', () => ({
    useLocale: () => 'el',
    useTranslations: () => {
        const t = (key: string) => key;
        t.rich = (key: string) => key;
        return t;
    },
}));
jest.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock('@/lib/actions/personConsent', () => ({ setVoicePrintConsent: jest.fn() }));
jest.mock('@/lib/actions/phoneVerification', () => ({ requestPhoneCode: jest.fn(), confirmPhoneCode: jest.fn() }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('@/lib/genericMode', () => ({ isGenericMode: () => true }));

const user = {
    id: 'user-1',
    name: 'Α. Β.',
    email: 'a@b.test',
    phone: '+306943472297',
    phoneVerifiedAt: null,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
} as unknown as User;

beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

/** OpenTranscripts sends nothing to a phone, and its users write to no OpenCouncil address. */
describe('UserInfoForm in generic mode', () => {
    it('shows no phone field and no OpenCouncil contact', () => {
        render(createElement(UserInfoForm, { user, isOnboarded: true }));

        expect(screen.queryByText('phone')).not.toBeInTheDocument();
        expect(screen.queryByText('emailChangeTooltip')).not.toBeInTheDocument();
    });

    it('keeps the stored number: the save sends no phone at all', async () => {
        render(createElement(UserInfoForm, { user, isOnboarded: true }));

        fireEvent.click(screen.getByText('savePersonalInfo'));

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({ name: 'Α. Β.', onboarded: true });
        expect(body).not.toHaveProperty('phone');
    });
});
