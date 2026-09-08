import "server-only";
import type { Realm } from '@prisma/client';
import { env } from '@/env.mjs';
import { getRealmBaseUrl, isRealmApexHost } from '@/lib/realm';

/**
 * Absolute base URL for a link to `realm`'s content, trailing slash stripped.
 *
 * One deployment serves every realm domain, so `NEXTAUTH_URL` is a single
 * build-time host: in production it is one realm's apex (opencouncil.gr), and
 * using it for another realm's content sends the reader somewhere the content
 * does not exist. City pages are tenant-isolated — the city layout scopes the
 * valid city set to the request realm — so such a link 404s rather than
 * redirecting.
 *
 * On a preview or local instance `NEXTAUTH_URL` is not a production apex, and
 * the reader is looking at *that* instance rather than production, so it wins
 * and links stay on the host under review. Caveat: a preview host resolves to
 * the greece realm, so a link to another realm's content opens there in Greek —
 * realm is a property of the domain, and a preview has only one. Append
 * `?realm=…` by hand when that matters.
 *
 * Pass no realm (or null) when the content belongs to no realm in particular;
 * the configured host is then used as is.
 */
export function realmBaseUrl(realm?: Realm | null): string {
    try {
        const configured = env.NEXTAUTH_URL.replace(/\/$/, '');
        if (!realm || !isRealmApexHost(new URL(configured).hostname)) return configured;
    } catch {
        // Unset or malformed NEXTAUTH_URL. With a realm its canonical domain
        // still works; without one there is nothing left to fall back to.
        if (!realm) throw new Error('NEXTAUTH_URL is unset or malformed, and no realm was given to fall back to');
    }
    return getRealmBaseUrl(realm!);
}
