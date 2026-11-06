import { hiddenPageRewritePath, isGenericModePath } from '@/lib/genericModePaths';

describe('isGenericModePath', () => {
    it.each([
        '/',
        '/en',
        '/sign-in',
        '/en/sign-in',
        '/workspaces',
        '/workspaces/ws1',
        '/workspaces/ws1/transcripts/t1',
        '/workspaces/ws1/admin/tasks',
        '/profile',
        '/mcp',
        '/en/mcp',
        '/mcp/mcp_abc123',
        '/admin',
        '/admin/workspaces',
        '/admin/users',
        '/admin/cache',
        '/api/auth/session',
        '/api/auth/callback/resend',
        '/api/workspaces',
        '/api/workspaces/ws1/transcripts/t1/export/docx',
        '/api/upload/start',
        '/api/upload/complete',
        '/api/profile',
        '/api/health',
        '/api/dev/quick-login',
        '/api/mcp',
        '/api/mcp/mcp_abc123',
        '/api/admin/users',
        '/api/admin/cache/stats',
        '/api/revalidate',
        '/api/cities/ws1/meetings/t1/taskStatuses/task1',
    ])('keeps %s', (path) => {
        expect(isGenericModePath(path)).toBe(true);
    });

    it.each([
        // OpenCouncil pages, including ones the old fork already showed.
        '/about',
        '/privacy',
        '/terms',
        '/mcp/other',
        '/notifications',
        '/petition',
        '/search',
        '/explain',
        '/offline',
        '/profile/highlights',
        '/athens',
        '/athens/meeting1/transcript',
        '/en/about',
        '/admin/cities',
        '/admin/tasks',
        '/admin/machines',
        '/qr/t-shirt',
        // OpenCouncil API routes and files.
        '/api',
        '/api/mcp/other',
        '/api/search',
        '/api/cities',
        '/api/cities/athens/meetings',
        '/api/cities/ws1/meetings/t1/transcript',
        '/api/upload',
        '/api/cron/poll-decisions',
        '/api/admin/entities',
        '/llms.txt',
        '/manifest.webmanifest',
        '/sw.js',
    ])('hides %s', (path) => {
        expect(isGenericModePath(path)).toBe(false);
    });
});

describe('hiddenPageRewritePath', () => {
    it('keeps the locale of the request', () => {
        expect(hiddenPageRewritePath('/en/about')).toBe('/en/not-found/in/generic/mode');
    });

    it('uses the default locale for an unprefixed path', () => {
        expect(hiddenPageRewritePath('/about')).toBe('/el/not-found/in/generic/mode');
    });
});
