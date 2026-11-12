/** @jest-environment node */
jest.mock('next-auth', () => ({ __esModule: true, default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }) }));
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/auth.config', () => ({ __esModule: true, default: {}, authProviders: () => [] }));
jest.mock('@/lib/db/consultationComments', () => ({ pendingCommentQuote: jest.fn() }));
jest.mock('@/lib/auth/sessionMirror', () => ({ usesSecureCookies: () => false }));
const mockSendUserSignedUpAdminAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/discord', () => ({ sendUserSignedUpAdminAlert: () => mockSendUserSignedUpAdminAlert() }));
const mockIsGenericMode = jest.fn<boolean, []>();
jest.mock('@/lib/genericMode', () => ({ isGenericMode: () => mockIsGenericMode() }));
import { authOptions } from '@/auth';

type CreateUser = (message: { user: unknown }) => Promise<void>;
const createUser = authOptions.events.createUser as unknown as CreateUser;
const user = { id: 'u1', email: 'anna@example.com' };

beforeEach(() => mockSendUserSignedUpAdminAlert.mockClear());

it('alerts the admins of a new account in OpenTranscripts', async () => {
    mockIsGenericMode.mockReturnValue(true);
    await createUser({ user });
    expect(mockSendUserSignedUpAdminAlert).toHaveBeenCalledTimes(1);
});

it('sends no signup alert in OpenCouncil, where the onboarding alert covers a new reader', async () => {
    mockIsGenericMode.mockReturnValue(false);
    await createUser({ user });
    expect(mockSendUserSignedUpAdminAlert).not.toHaveBeenCalled();
});

it('does not hold the sign-in when the alert fails', async () => {
    mockIsGenericMode.mockReturnValue(true);
    mockSendUserSignedUpAdminAlert.mockRejectedValueOnce(new Error('discord down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createUser({ user })).resolves.toBeUndefined();
});
