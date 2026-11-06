import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { identityFromContext } from './auth';
import { mcpListTranscripts, mcpListWorkspaces } from './workspaceData';
import { category, run } from './toolSupport';
import { jsonPageFields } from '@/lib/zod-schemas/listQuery';

/**
 * The tools of generic mode that have no council counterpart. The other tools
 * name a workspace `cityId` and a transcript `meetingId`, so these do too.
 */
export function registerWorkspaceTools(server: McpServer) {
    server.registerTool(
        'list_workspaces',
        {
            title: 'List workspaces',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('directory'),
            description:
                'The workspaces you administer, with their transcript and member counts, the date of the ' +
                'last upload, and how many transcripts have a task that is running or failed. Pass a ' +
                'workspace id as `cityId` to the other tools.',
            inputSchema: z.object({}),
        },
        (_args, ctx: ServerContext) => run(() => mcpListWorkspaces(identityFromContext(ctx)))
    );

    server.registerTool(
        'list_transcripts',
        {
            title: 'List transcripts',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('meetings'),
            description:
                'The transcripts of a workspace, newest first, with their segment count and their latest ' +
                'task (type, status, stage, percent). A transcript with segments has a transcript to read: ' +
                'pass its id as `meetingId` to get_transcript. Poll this tool to follow a transcription.',
            inputSchema: z.object({
                cityId: z.string().min(1).describe('The workspace id (see list_workspaces)'),
                pageSize: jsonPageFields.pageSize.max(100).default(50).describe('Transcripts per page'),
                page: jsonPageFields.page.default(1).describe('Page number, starting at 1'),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpListTranscripts(identityFromContext(ctx), args))
    );
}
