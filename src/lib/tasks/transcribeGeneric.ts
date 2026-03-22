import 'server-only';
import { CityLanguage } from '@prisma/client';
import { TranscribeRequest, Voiceprint } from '../apiTypes';
import prisma from '../db/prisma';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { startTask } from './tasks';

/**
 * Request the transcription of a transcript that is not a council meeting.
 *
 * No auth check: the caller (the workspace API route) checks the workspace.
 * The result comes back through handleTranscribeResult, which imports the
 * segments and skips the steps that only a council meeting has.
 */
export async function requestTranscribeTranscript(
    workspaceId: string,
    transcriptId: string,
    { youtubeUrl, voiceprints, language = 'el', force = false }: {
        youtubeUrl: string;
        voiceprints?: Voiceprint[];
        /** A workspace has no language of its own. */
        language?: CityLanguage;
        force?: boolean;
    },
) {
    const transcript = await prisma.transcript.findUnique({
        where: { workspaceId_id: { workspaceId, id: transcriptId } },
        select: { councilMeeting: { select: { id: true } }, _count: { select: { speakerSegments: true } } },
    });
    if (!transcript) {
        throw new NotFoundError('Transcript not found');
    }
    if (transcript.councilMeeting) {
        throw new ConflictError('The transcript is a council meeting. Transcribe it from the meeting.');
    }
    // As for a meeting, a re-run keeps the old segments until the new ones
    // land: handleTranscribeResult deletes them inside the import transaction.
    if (transcript._count.speakerSegments > 0 && !force) {
        throw new ConflictError('The transcript already has speaker segments. A re-run must set force, which replaces them.');
    }

    // `force` rides in the stored request so the callback can hand it to the
    // result handler; the task server ignores it.
    const body: Omit<TranscribeRequest, 'callbackUrl'> & { force?: boolean } = {
        youtubeUrl,
        voiceprints: voiceprints && voiceprints.length > 0 ? voiceprints : undefined,
        cityLanguage: language,
        ...(force && { force }),
    };

    await prisma.transcript.update({
        where: { workspaceId_id: { workspaceId, id: transcriptId } },
        data: { videoUrl: youtubeUrl },
    });

    return startTask('transcribe', body, transcriptId, workspaceId, { force });
}
