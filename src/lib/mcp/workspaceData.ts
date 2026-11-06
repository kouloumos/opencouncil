import "server-only";
import { assertGenericWorkspace, getWorkspaceActivity, listWorkspaces } from '@/lib/db/workspaces';
import { revalidatePath } from 'next/cache';
import { countTranscripts, createTranscript, listTranscripts } from '@/lib/db/transcripts';
import { paginationOf } from '@/lib/zod-schemas/listQuery';
import type { McpIdentity } from './auth';
import { requireAdminAccess, requireCityAdmin } from './adminAccess';
import { currentBaseUrl, transcriptUrl } from './realm-context';

/**
 * The tools of the MCP server in generic mode (OpenTranscripts) that have no
 * council counterpart: the workspaces a caller administers, their transcripts,
 * and a new transcript. A workspace is to these tools what a city is to the
 * council tools, so the guards are the same.
 */

export async function mcpListWorkspaces(identity: McpIdentity) {
    const access = await requireAdminAccess(identity);
    const workspaces = (await listWorkspaces()).filter(workspace => access.superadmin || access.cityIds.has(workspace.id));
    const activity = await getWorkspaceActivity(workspaces.map(workspace => workspace.id));
    return {
        workspaces: workspaces.map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            transcripts: workspace._count.transcripts,
            members: workspace._count.administrators,
            ...activity[workspace.id],
            url: `${currentBaseUrl()}/workspaces/${workspace.id}`,
        })),
    };
}

export async function mcpListTranscripts(
    identity: McpIdentity,
    args: { cityId: string; page: number; pageSize: number }
) {
    await requireCityAdmin(identity, args.cityId);
    await assertGenericWorkspace(args.cityId);
    const [total, transcripts] = await Promise.all([
        countTranscripts(args.cityId),
        listTranscripts(args.cityId, { limit: args.pageSize, offset: (args.page - 1) * args.pageSize }),
    ]);
    return {
        cityId: args.cityId,
        pagination: paginationOf(total, args.page, args.pageSize),
        transcripts: transcripts.map(transcript => {
            const task = transcript.taskStatuses[0];
            return {
                id: transcript.id,
                name: transcript.name,
                createdAt: transcript.createdAt,
                segments: transcript._count.speakerSegments,
                latestTask: task
                    ? { type: task.type, status: task.status, stage: task.stage, percentComplete: task.percentComplete, updatedAt: task.updatedAt }
                    : null,
                url: transcriptUrl(args.cityId, transcript.id),
            };
        }),
    };
}

/** A new transcript in a workspace, as the upload form of the workspace page creates one. */
export async function mcpCreateTranscript(
    identity: McpIdentity,
    args: { cityId: string; name: string; videoUrl?: string }
) {
    await requireCityAdmin(identity, args.cityId);
    await assertGenericWorkspace(args.cityId);
    const transcript = await createTranscript({ workspaceId: args.cityId, name: args.name, videoUrl: args.videoUrl });
    revalidatePath(`/workspaces/${args.cityId}`);
    return {
        cityId: args.cityId,
        meetingId: transcript.id,
        name: transcript.name,
        videoUrl: transcript.videoUrl,
        url: transcriptUrl(args.cityId, transcript.id),
        next: 'The transcript is empty. Pass meetingId to start_task with type transcribe: it transcribes '
            + (transcript.videoUrl ? 'this videoUrl.' : 'the videoUrl that you pass to it.'),
    };
}
