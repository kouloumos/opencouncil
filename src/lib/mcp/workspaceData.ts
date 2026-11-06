import "server-only";
import { assertGenericWorkspace, getWorkspaceActivity, listWorkspaces } from '@/lib/db/workspaces';
import { countTranscripts, listTranscripts } from '@/lib/db/transcripts';
import { paginationOf } from '@/lib/zod-schemas/listQuery';
import type { McpIdentity } from './auth';
import { requireAdminAccess, requireCityAdmin } from './adminAccess';
import { currentBaseUrl, transcriptUrl } from './realm-context';

/**
 * The read side of the MCP server in generic mode (OpenTranscripts): the
 * workspaces a caller administers and their transcripts. A workspace is to
 * these tools what a city is to the council tools, so the guards are the same.
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
