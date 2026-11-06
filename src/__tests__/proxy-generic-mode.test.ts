jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opentranscripts.example' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

const mockIsGenericMode = jest.fn();
jest.mock('@/lib/genericMode', () => ({
    ...jest.requireActual('@/lib/genericMode'),
    isGenericMode: () => mockIsGenericMode(),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

const get = (path: string) => proxy(new NextRequest(`https://opentranscripts.example${path}`));

describe('proxy in generic mode', () => {
    beforeEach(() => mockIsGenericMode.mockReturnValue(true));

    it('renders the 404 page for an OpenCouncil page', async () => {
        const res = await get('/about');

        expect(new URL(res!.headers.get('x-middleware-rewrite')!).pathname).toBe('/el/not-found/in/generic/mode');
    });

    it.each(['/api/search', '/api/cities', '/llms.txt', '/manifest.webmanifest'])('answers 404 for %s', async (path) => {
        const res = await get(path);

        expect(res!.status).toBe(404);
    });

    it('lets the MCP server through to its route, which answers superadmins only', async () => {
        expect(await get('/api/mcp')).toBeUndefined();
    });

    it('lets the task server callback through to its route', async () => {
        expect(await get('/api/cities/ws1/meetings/t1/taskStatuses/task1')).toBeUndefined();
    });

    it('lets a workspace page through to the app', async () => {
        const res = await get('/workspaces/ws1');

        expect(res?.headers.get('x-middleware-rewrite') ?? '').not.toContain('not-found');
        expect(res?.status).not.toBe(404);
    });
});

describe('proxy in council mode', () => {
    beforeEach(() => mockIsGenericMode.mockReturnValue(false));

    it.each(['/api/search', '/api/mcp', '/llms.txt', '/manifest.webmanifest'])('leaves %s to its route', async (path) => {
        expect(await get(path)).toBeUndefined();
    });

    it('serves an OpenCouncil page', async () => {
        const res = await get('/about');

        expect(res?.headers.get('x-middleware-rewrite') ?? '').not.toContain('not-found');
        expect(res?.status).not.toBe(404);
    });
});
