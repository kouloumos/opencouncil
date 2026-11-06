// Server-only: no auth check. The caller authorizes first — the MCP admin
// tools do, with a token instead of a session.
import "server-only";
import type { TaskStatus } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { ApiError, BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { requestProcessAgendaInternal } from './processAgendaInternal';
import { requestTranscribeInternal } from './transcribeInternal';
import { requestFixTranscriptInternal } from './fixTranscriptInternal';
import { requestTranscribeTranscript } from './transcribeGeneric';
import { isGenericMode } from '@/lib/genericMode';
import { requestSummarizeInternal } from './summarizeInternal';
import { PipelineBusyError, TaskAlreadyExistsError } from './types';
import type { MeetingTaskRequest } from './startableTasks';

export type { MeetingTaskRequest, StartableMeetingTask } from './startableTasks';

/**
 * Start one pipeline step for a meeting. The step's own core builds the
 * request, refuses what it cannot do, and calls the task server; startTask
 * admits it under the lock of the meeting. This function supplies the
 * defaults from the meeting row and turns the refusals into errors that
 * name what the caller can do: a running step is waited out, with or
 * without force; a succeeded step is repeated with force.
 */
/**
 * A task the task server lost stays `pending` for good and blocks its step.
 * The admin page of the meeting can delete it; the error says so, or an
 * assistant has no way out but to wait.
 */
function stuckTaskHint(cityId: string, meetingId: string): string {
    const adminPage = isGenericMode() ? `/workspaces/${cityId}/admin/tasks` : `/${cityId}/${meetingId}/admin`;
    return `If it shows no progress for 10 minutes, an administrator can delete the stuck task on `
        + `${adminPage} and start the step again.`;
}

/** The tool that lists the tasks of a meeting, or in generic mode of a transcript. */
function tasksTool(): string {
    return isGenericMode() ? 'list_transcripts' : 'get_meeting';
}

export async function startMeetingTask(
    cityId: string,
    meetingId: string,
    request: MeetingTaskRequest
): Promise<TaskStatus> {
    try {
        return isGenericMode()
            ? await startTranscriptTask(cityId, meetingId, request)
            : await startCouncilTask(cityId, meetingId, request);
    } catch (error) {
        if (error instanceof PipelineBusyError) {
            throw new ConflictError(
                `A ${error.blockedBy} task is still running for this meeting, and ${request.type} must not run beside it: `
                + `its result would be lost when the ${error.blockedBy} result replaces the transcript. Wait for it, `
                + `with or without force. ${stuckTaskHint(cityId, meetingId)}`
            );
        }
        if (error instanceof TaskAlreadyExistsError) {
            throw new ConflictError(
                error.reason === 'already_running'
                    ? `A ${error.taskType} task is already running for this meeting. Wait for it: ${tasksTool()} lists the tasks. `
                        + stuckTaskHint(cityId, meetingId)
                    : `A ${error.taskType} task already succeeded for this meeting. Pass force to run it again.`
            );
        }
        // startTask records the task as failed and throws with the answer of the
        // task server. That answer is for the administrator, not an internal error.
        if (error instanceof Error && error.message.startsWith('Failed to start task')) {
            throw new ApiError(502, error.message);
        }
        throw error;
    }
}

async function startCouncilTask(cityId: string, meetingId: string, request: MeetingTaskRequest): Promise<TaskStatus> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: {
            youtubeUrl: true,
            agendaUrl: true,
            transcript: { select: { _count: { select: { speakerSegments: true } } } },
        },
    });
    if (!meeting) throw new NotFoundError('Meeting not found');

    const force = request.force ?? false;
    const transcribed = meeting.transcript._count.speakerSegments > 0;

    switch (request.type) {
        case 'processAgenda': {
            const agendaUrl = request.agendaUrl ?? meeting.agendaUrl;
            if (!agendaUrl) {
                throw new BadRequestError('The meeting has no agenda URL. Pass agendaUrl, or set it with update_meeting.');
            }
            return await requestProcessAgendaInternal(agendaUrl, meetingId, cityId, { force });
        }
        case 'transcribe': {
            const videoUrl = request.videoUrl ?? meeting.youtubeUrl;
            if (!videoUrl) {
                throw new BadRequestError('The meeting has no video URL. Pass videoUrl, or set youtubeUrl with update_meeting.');
            }
            return await requestTranscribeInternal(videoUrl, meetingId, cityId, { force });
        }
        case 'fixTranscript': {
            if (!transcribed) throw new BadRequestError('The meeting has no transcript to fix. Start transcribe first.');
            return await requestFixTranscriptInternal(meetingId, cityId, { force });
        }
        case 'summarize': {
            if (!transcribed) throw new BadRequestError('The meeting has no transcript to summarize. Start transcribe first.');
            return await requestSummarizeInternal(cityId, meetingId, [], request.additionalInstructions, { force });
        }
    }
}

/**
 * A workspace transcript has one step: transcribe. It reads the recording
 * from the transcript when the request names none, as a meeting reads its video.
 */
async function startTranscriptTask(cityId: string, meetingId: string, request: MeetingTaskRequest): Promise<TaskStatus> {
    if (request.type !== 'transcribe') {
        throw new BadRequestError(`A transcript has no ${request.type} step: only transcribe runs on it.`);
    }
    const transcript = await prisma.transcript.findUnique({
        where: { workspaceId_id: { workspaceId: cityId, id: meetingId } },
        select: { videoUrl: true },
    });
    if (!transcript) throw new NotFoundError('Transcript not found');
    const videoUrl = request.videoUrl ?? transcript.videoUrl;
    if (!videoUrl) throw new BadRequestError('The transcript has no recording URL. Pass videoUrl.');
    return await requestTranscribeTranscript(cityId, meetingId, { youtubeUrl: videoUrl, force: request.force ?? false });
}
