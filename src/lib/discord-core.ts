/**
 * Discord alerting primitives: the webhook transport, the embed boilerplate and
 * the generic error alert.
 *
 * Split out of `discord.ts` because this half must stay reachable from the Edge
 * runtime. `onRequestError` in `instrumentation.ts` is compiled for edge as well
 * as node — that is how proxy failures reach the team channel — and `discord.ts`
 * imports the database to resolve a city's realm. Evaluating Prisma on edge
 * throws, which would break the error handler on exactly the path that must
 * work. Keep this module free of database and other node-only imports.
 */

import "server-only";
import { headers } from 'next/headers';
import { env } from '@/env.mjs';

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{
        name: string;
        value: string;
        inline?: boolean;
    }>;
    timestamp?: string;
    footer?: {
        text: string;
    };
}

interface DiscordWebhookPayload {
    content?: string;
    embeds?: DiscordEmbed[];
}

/**
 * Send a message to Discord via webhook
 */
async function sendDiscordMessage(payload: DiscordWebhookPayload): Promise<void> {
    // Skip if webhook URL is not configured
    if (!env.DISCORD_WEBHOOK_URL) {
        console.log('Discord webhook URL not configured, skipping admin alert');
        return;
    }

    try {
        const response = await fetch(env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error('Failed to send Discord admin alert:', response.statusText);
        }
    } catch (error) {
        console.error('Error sending Discord admin alert:', error);
    }
}

/**
 * Identifies which deployment produced an alert: the preview PR (parsed from
 * NEXTAUTH_URL), the build commit, the instance, and the host it arrived on.
 *
 * One deployment serves every realm domain, so `NEXTAUTH_URL` names the
 * deployment but never the realm: in production it reads `opencouncil.gr` even
 * for an alert raised on opencouncil.fr. `host` — the Host header of the
 * request that produced the alert — is what tells the realms apart.
 *
 * It is ADDED to the deployment identity, never substituted for it. A Host is
 * caller-supplied, and `NEXT_PUBLIC_BUILD_COMMIT_SHA` is unset on the
 * production build, so substituting would leave a production footer holding
 * nothing but a string an attacker can choose — a forged `Host: opencouncil.fr`
 * would read as "the French site is erroring". The `via` label says which half
 * is which.
 */
function buildIdentityFooter(host?: string): DiscordEmbed['footer'] {
    const instance = env.NEXTAUTH_URL;
    const pr = instance.match(/pr-(\d+)\./)?.[1];
    const commit = env.NEXT_PUBLIC_BUILD_COMMIT_SHA;
    // A hostname cannot exceed 253 characters; anything longer is not one.
    const requestHost = host?.slice(0, 253);

    const parts = [
        pr ? `pr-${pr}` : undefined,
        commit ? `commit ${commit.slice(0, 7)}` : undefined,
        instance,
        // Omitted when it adds nothing: on a realm apex the instance already
        // names the same host.
        requestHost && requestHost !== new URL(instance).host ? `via ${requestHost}` : undefined,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? { text: parts.join(' · ') } : undefined;
}

/**
 * Host of the request being served, or undefined outside a request scope —
 * `headers()` throws there, and task callbacks, cron runs and cache callbacks
 * all raise alerts. Never throws, so it is safe on an alerting path.
 */
async function currentRequestHost(): Promise<string | undefined> {
    try {
        return (await headers()).get('host') ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * Thin wrapper around sendDiscordMessage that adds the embed boilerplate.
 */
export async function sendAdminAlert({ host, ...embed }: {
    title: string;
    description: string;
    color: number;
    fields: DiscordEmbed['fields'];
    footer?: DiscordEmbed['footer'];
    host?: string;
}): Promise<void> {
    await sendDiscordMessage({
        embeds: [{
            ...embed,
            footer: embed.footer ?? buildIdentityFooter(host),
            timestamp: new Date().toISOString(),
        }],
    });
}

/** Discord embed field value limit. Truncates with an indicator when exceeded. */
export const DISCORD_FIELD_LIMIT = 1024;
export function truncateField(s: string, limit = DISCORD_FIELD_LIMIT): string {
    if (s.length <= limit) return s;
    const suffix = '\n… (truncated)';
    return s.substring(0, limit - suffix.length) + suffix;
}

/**
 * Generic error alert for unexpected failures anywhere in the app.
 * Context entries are rendered as inline fields for quick triage.
 *
 * `host` names the domain the failing request arrived on, which is the only
 * thing that tells the realms apart: one deployment answers for all of them, so
 * the footer would otherwise read opencouncil.gr for every realm's errors.
 * Pass it wherever the request is in hand but `headers()` is out of scope —
 * `onRequestError` is the case that matters, since it runs after the request
 * scope has gone.
 */
export async function sendErrorAdminAlert(data: {
    source: string;
    error: string;
    context?: Record<string, string | undefined>;
    host?: string;
}): Promise<void> {
    const contextFields = data.context
        ? Object.entries(data.context)
            .filter((entry): entry is [string, string] => entry[1] !== undefined)
            .map(([name, value]) => ({
                name,
                value: truncateField(value),
                inline: true,
            }))
        : [];

    await sendAdminAlert({
        title: `🚨 Error - ${data.source}`,
        description: truncateField(data.error),
        color: 0xff0000,
        fields: contextFields,
        host: data.host ?? await currentRequestHost(),
    });
}
