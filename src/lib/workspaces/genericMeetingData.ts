import type { SpeakerTag, Transcript as TranscriptRow, Workspace } from '@prisma/client';
import type { MeetingData } from '@/lib/getMeetingData';
import type { Transcript } from '@/lib/db/transcript';
import type { MeetingTaskStatus } from '@/lib/db/tasks';
import { TASK_CONFIG, type MeetingTaskType } from '@/lib/tasks/types';

/** A workspace has no timezone of its own. */
const WORKSPACE_TIMEZONE = 'Europe/Athens';

/**
 * The meeting page components read a transcript as MeetingData. A transcript
 * that is not a council meeting has no city, body, people or subjects, so
 * this fills those parts with a workspace stand-in and empty lists.
 */
export function genericMeetingData({ workspace, transcriptRow, transcript, speakerTags }: {
    workspace: Pick<Workspace, 'id' | 'name' | 'createdAt' | 'updatedAt'>;
    transcriptRow: TranscriptRow;
    transcript: Transcript;
    speakerTags: SpeakerTag[];
}): MeetingData {
    const taskStatus = {} as MeetingTaskStatus;
    for (const taskType of Object.keys(TASK_CONFIG) as MeetingTaskType[]) {
        taskStatus[taskType] = false;
    }
    taskStatus.transcribe = transcript.length > 0;
    // A generic transcript has no review step, so its text is never held back.
    taskStatus.humanReview = true;

    return {
        meeting: {
            id: transcriptRow.id,
            cityId: transcriptRow.workspaceId,
            name: transcriptRow.name,
            name_en: transcriptRow.name,
            dateTime: transcriptRow.createdAt,
            createdAt: transcriptRow.createdAt,
            updatedAt: transcriptRow.updatedAt,
            youtubeUrl: null,
            agendaUrl: null,
            calendarEventId: null,
            scheduleStatus: 'scheduled',
            scheduleStatusReason: null,
            kind: null,
            urgent: false,
            sessionNumber: null,
            format: null,
            closedToPublic: false,
            place: null,
            postponedFromId: null,
            postponedFromDate: null,
            hiddenByPostponement: false,
            continuationOfId: null,
            continuationOf: null,
            administrativeBodyId: null,
            administrativeBody: null,
            released: transcriptRow.released,
            videoUrl: transcriptRow.videoUrl,
            audioUrl: transcriptRow.audioUrl,
            muxPlaybackId: transcriptRow.muxPlaybackId,
        },
        transcript,
        city: {
            id: workspace.id,
            name: workspace.name,
            name_en: workspace.name,
            name_municipality: workspace.name,
            name_municipality_en: workspace.name,
            logoImage: null,
            timezone: WORKSPACE_TIMEZONE,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            status: 'pending',
            authorityType: 'municipality',
            wikipediaId: null,
            supportsNotifications: false,
            consultationsEnabled: false,
            peopleOrdering: 'default',
            highlightCreationPermission: 'ADMINS_ONLY',
            diavgeiaUid: null,
            language: 'el',
            realm: 'greece',
            population: null,
        },
        people: [],
        parties: [],
        subjects: [],
        speakerTags,
        taskStatus,
        transcriptHiddenForReview: false,
        highlights: [],
    };
}
