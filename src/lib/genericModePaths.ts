import { routing } from '@/i18n/routing';
import { GENERIC_MODE_ADMIN_PAGES } from '@/lib/genericMode';
import { LOCALE_PREFIX_RE } from '@/lib/seo-redirects';

/**
 * The paths that exist in generic mode (OpenTranscripts). The proxy answers
 * 404 for every other page, API route and listed static file, so an
 * OpenCouncil feature that a later upstream merge adds stays hidden until
 * someone adds its path here.
 */
const GENERIC_MODE_PATHS: RegExp[] = [
    // Pages, after the locale prefix is removed.
    /^\/$/,
    /^\/sign-in$/,
    /^\/workspaces(\/.*)?$/,
    /^\/profile$/,
    // The dashboard sends a superadmin on to the first of them.
    /^\/admin$/,
    ...GENERIC_MODE_ADMIN_PAGES.map((page) => new RegExp(`^${page}$`)),

    // API routes.
    /^\/api\/auth\//,
    /^\/api\/workspaces(\/.*)?$/,
    /^\/api\/upload\/(start|complete)$/,
    /^\/api\/profile$/,
    /^\/api\/health$/,
    /^\/api\/dev\//,
    /^\/api\/admin\/(users|cache)(\/.*)?$/,
    /^\/api\/revalidate$/,
    // The task server reports progress and results here.
    /^\/api\/cities\/[^/]+\/meetings\/[^/]+\/taskStatuses\/[^/]+$/,
];

export function isGenericModePath(pathname: string): boolean {
    const path = pathname.replace(LOCALE_PREFIX_RE, '/');
    return GENERIC_MODE_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Where the proxy rewrites a hidden page, so that it renders the app's 404
 * page with the 404 status. Only the [...rest] catch-all route matches a path
 * this deep, and it calls notFound() without reading the database.
 */
export function hiddenPageRewritePath(pathname: string): string {
    const locale = LOCALE_PREFIX_RE.exec(pathname)?.[1] ?? routing.defaultLocale;
    return `/${locale}/not-found/in/generic/mode`;
}
