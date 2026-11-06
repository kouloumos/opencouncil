import { publicEnv } from '@/lib/publicEnv';

/**
 * Whether the app runs as OpenTranscripts (NEXT_PUBLIC_APP_MODE=generic): a
 * transcription service with workspaces, without the OpenCouncil product. Safe
 * in client components, the proxy and server code alike.
 */
export function isGenericMode(): boolean {
    return publicEnv.NEXT_PUBLIC_APP_MODE === 'generic';
}

/** The product name that the app shows to its users. */
export function appName(): 'OpenTranscripts' | 'OpenCouncil' {
    return isGenericMode() ? 'OpenTranscripts' : 'OpenCouncil';
}
