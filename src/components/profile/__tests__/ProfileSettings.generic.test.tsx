import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ProfileSettings, type ProfileAccount } from '../ProfileSettings';

let mockSearch = '';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
        createElement('a', { href, className }, children),
    usePathname: () => '/profile',
}));
jest.mock('@/components/profile/AccountSection', () => ({ AccountSection: () => null }));
jest.mock('@/components/profile/CommunicationPreferences', () => ({ CommunicationPreferences: () => null }));
jest.mock('@/components/profile/NotificationPreferencesSection', () => ({ NotificationPreferencesSection: () => null }));
jest.mock('@/components/profile/UserInfoForm', () => ({ UserInfoForm: () => null }));
jest.mock('@/lib/genericMode', () => ({ isGenericMode: () => true }));

const user: ProfileAccount = {
    name: 'Μαρία Παπαδοπούλου',
    email: 'maria@example.com',
    phone: null,
    phoneVerifiedAt: null,
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    allowProductUpdates: true,
    allowPetitionUpdates: false,
    allowFeedbackCalls: true,
};

beforeEach(() => {
    mockSearch = '';
});

/** OpenTranscripts has no notifications and does not contact its users. */
describe('ProfileSettings in generic mode', () => {
    it('offers the personal details and the account, and no other tab', () => {
        render(<ProfileSettings user={user} persons={[]} highlightsAllowed={false} />);

        expect(screen.getByRole('link', { name: 'tabPersonal' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'tabAccount' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'tabNotifications' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'tabCommunication' })).not.toBeInTheDocument();
    });

    it('opens the personal details for a link to a hidden tab', () => {
        mockSearch = 'tab=notifications';
        render(<ProfileSettings user={user} persons={[]} highlightsAllowed={false} />);

        expect(screen.getByRole('heading', { name: 'tabPersonal' })).toBeInTheDocument();
    });
});
