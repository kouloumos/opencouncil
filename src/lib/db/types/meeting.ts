import type { CouncilMeeting, Prisma } from '@prisma/client';
import { DECISION_KIND_SELECT } from '@/lib/tasks/pollDecisionsBackoff';
import { publicAdministrativeBodyRelation } from './administrativeBody';

/**
 * The fields of a meeting that live on its Transcript: the media and the
 * release state.
 */
export const meetingTranscriptSelect = {
    released: true,
    videoUrl: true,
    audioUrl: true,
    muxPlaybackId: true,
} satisfies Prisma.TranscriptSelect;

export type MeetingTranscriptFields = Prisma.TranscriptGetPayload<{ select: typeof meetingTranscriptSelect }>;

/** Include it as `transcript` to read a meeting's media and release state. */
export const meetingTranscriptRelation = { select: meetingTranscriptSelect } satisfies Prisma.TranscriptDefaultArgs;

/**
 * A meeting with the fields of its transcript put on the meeting itself. The
 * pages and the components read `meeting.released`, `meeting.videoUrl` and
 * the other fields there, as they did before the fields moved to Transcript.
 */
export type WithTranscriptFields<T extends { transcript: object }> = Omit<T, 'transcript'> & T['transcript'];

export function withTranscriptFields<T extends { transcript: object }>(meeting: T): WithTranscriptFields<T> {
    const { transcript, ...rest } = meeting;
    return { ...rest, ...transcript };
}

/**
 * The relations that a meeting write and the admin meeting read return with
 * the row (CouncilMeetingWithAdminBody): the public fields of its body, the
 * kind of the meeting that it continues, and its media and release state.
 */
export const meetingWithAdminBodyInclude = {
    administrativeBody: publicAdministrativeBodyRelation,
    continuationOf: DECISION_KIND_SELECT.continuationOf,
    transcript: meetingTranscriptRelation,
} satisfies Prisma.CouncilMeetingInclude;

/**
 * The columns that the meeting names (src/lib/meetingName.ts) read. Add
 * the city's timezone next to it where the caller has no timezone in scope.
 */
export const meetingNameSelect = {
    name: true,
    name_en: true,
    kind: true,
    sessionNumber: true,
    urgent: true,
    dateTime: true,
    administrativeBody: { select: { name: true, name_en: true } },
} satisfies Prisma.CouncilMeetingSelect;

/**
 * Version tag for cache keys built over the meeting-preview projection
 * (`meetingWithSubjectPreviewInclude` in src/lib/db/meetings.ts). Bump it in
 * the same edit that changes that include — persisted unstable_cache entries
 * keep serving the old shape under the old key otherwise. It lives here
 * because meetings.ts is a "use server" module and cannot export a constant.
 * The public meeting lists key on it too: v6 hides the links to other
 * meetings.
 */
export const MEETING_PREVIEW_CACHE_VERSION = 'v6-ot1';

/** What the header needs to step to a neighbouring meeting. */
export type AdjacentMeeting = Pick<CouncilMeeting, 'id' | 'name' | 'name_en' | 'kind' | 'urgent' | 'sessionNumber' | 'dateTime'> & {
    administrativeBody: { name: string; name_en: string } | null;
};

export type AdjacentMeetings = {
    /** The meeting held before this one, or null at the start. */
    previous: AdjacentMeeting | null;
    /** The meeting held after this one, or null at the end. */
    next: AdjacentMeeting | null;
};
