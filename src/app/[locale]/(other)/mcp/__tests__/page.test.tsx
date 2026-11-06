/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));

const mockGetRealm = jest.fn();
jest.mock('@/lib/realm.server', () => ({ getRealm: () => mockGetRealm() }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/genericMode', () => ({ ...jest.requireActual('@/lib/genericMode'), isGenericMode: jest.fn().mockReturnValue(false) }));
jest.mock('@/lib/mcp/adminAccess', () => ({ mayUseGenericModeMcp: (access: { superadmin: boolean } | null) => access?.superadmin === true }));
jest.mock('@/lib/db/mcpTokens', () => ({ listUserMcpTokens: jest.fn().mockResolvedValue([]) }));
jest.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
jest.mock('@/i18n/routing', () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/mcp/CopyButton', () => ({ CopyButton: ({ value }: { value: string }) => value }));
jest.mock('@/components/mcp/ConnectPanel', () => ({ ConnectPanel: ({ serverUrl }: { serverUrl: string }) => serverUrl }));
jest.mock('@/components/mcp/McpTokenManager', () => ({ McpTokenManager: () => null }));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import McpPage from '../page';
import { getCurrentUser } from '@/lib/auth';
import { isGenericMode } from '@/lib/genericMode';

async function renderFor(realm: string) {
    mockGetRealm.mockResolvedValue(realm);
    const tree = await McpPage({ params: Promise.resolve({ locale: 'el' }) });
    return renderToStaticMarkup(tree);
}

describe('/mcp address', () => {
    it("shows the MCP address on the visitor's own realm domain", async () => {
        expect(await renderFor('cyprus')).toContain('https://opencouncil.cy/mcp');
    });

    it('shows the Greek address to a Greek visitor', async () => {
        expect(await renderFor('greece')).toContain('https://opencouncil.gr/mcp');
    });

    it('does not offer another realm the Greek address', async () => {
        expect(await renderFor('france')).not.toContain('https://opencouncil.gr/mcp');
    });
});

describe('/mcp in generic mode (OpenTranscripts)', () => {
    const mockUser = getCurrentUser as jest.Mock;
    const mockGenericMode = isGenericMode as jest.Mock;

    beforeEach(() => {
        mockGenericMode.mockReturnValue(true);
        mockGetRealm.mockResolvedValue('greece');
    });

    afterEach(() => {
        mockGenericMode.mockReturnValue(false);
        mockUser.mockResolvedValue(null);
    });

    it('is not found for a signed-out visitor', async () => {
        await expect(McpPage({ params: Promise.resolve({ locale: 'el' }) })).rejects.toThrow();
    });

    it('is not found for a user who is not a superadmin', async () => {
        mockUser.mockResolvedValue({ id: 'u1', isSuperAdmin: false });
        await expect(McpPage({ params: Promise.resolve({ locale: 'el' }) })).rejects.toThrow();
    });

    it('shows a superadmin the tokens only', async () => {
        mockUser.mockResolvedValue({ id: 'admin1', isSuperAdmin: true });
        const html = renderToStaticMarkup(await McpPage({ params: Promise.resolve({ locale: 'el' }) }));
        expect(html).toContain('tokens.title');
        expect(html).not.toContain('examples.title');
    });
});
