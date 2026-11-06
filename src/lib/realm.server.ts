// Server-only by convention: uses next/headers, so it can only run in a request
// scope (server components / route handlers / generateMetadata). Keep it out of
// client bundles and out of unstable_cache callbacks.
import { cookies, headers } from 'next/headers';
import { Realm } from '@prisma/client';
import { REALM_OVERRIDE_COOKIE, effectiveRealm, getRealmBaseUrl, metadataBaseForHost } from './realm';
import { isGenericMode } from './genericMode';

/**
 * Resolves the current request's realm from its Host header, honoring the
 * `oc-realm` override cookie on non-production hosts (the `?realm=` escape
 * hatch for previews/localhost — see `realmOverride` in `realm.ts`).
 *
 * Server-only: reads `headers()`, so it cannot be called inside `unstable_cache`
 * (`createCache`). Resolve realm at the call site (server component / route
 * handler / `generateMetadata`) and pass it into cached functions as an explicit
 * argument folded into the cache key.
 *
 * The `.fr`-host rewrite in `proxy.ts` preserves the original Host header, so this
 * returns `france` for `.fr` requests even though the path was rewritten to `/fr`.
 */
export async function getRealm(): Promise<Realm> {
    const host = (await headers()).get('host');
    const overrideCookie = (await cookies()).get(REALM_OVERRIDE_COOKIE)?.value;
    return effectiveRealm(host, overrideCookie);
}

/**
 * OpenTranscripts has no realms: it serves the one domain NEXTAUTH_URL names.
 * Its host is unknown to the realm code, which would resolve it to greece
 * and name opencouncil.gr.
 *
 * Reads process.env rather than @/env.mjs, which the jest transform cannot
 * parse: every test that reaches this module would have to mock it. env.mjs
 * still validates NEXTAUTH_URL at startup.
 */
function genericModeBaseUrl(): string | null {
    return isGenericMode() ? new URL(process.env.NEXTAUTH_URL!).origin : null;
}

/** Canonical absolute base URL for the current request's realm. */
export async function getRealmBaseUrlFromRequest(): Promise<string> {
    return genericModeBaseUrl() ?? getRealmBaseUrl(await getRealm());
}

/** `metadataBaseForHost` for the current request (see it for the rule). */
export async function getMetadataBaseFromRequest(): Promise<string> {
    const genericBase = genericModeBaseUrl();
    if (genericBase) return genericBase;
    const host = (await headers()).get('host');
    return metadataBaseForHost(host, await getRealm());
}
