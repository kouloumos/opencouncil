import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { requestTranscribeTranscript } from '@/lib/tasks/transcribeGeneric';
import { assertGenericWorkspace } from '@/lib/db/workspaces';
import * as z from 'zod';
import { handleApiError } from '@/lib/api/errors';

const transcribeRequestSchema = z.object({
  youtubeUrl: z.url("Valid YouTube URL required"),
  force: z.boolean().optional().default(false)
});

type Params = { params: Promise<{ workspaceId: string; transcriptId: string }> };

/**
 * POST /api/workspaces/[workspaceId]/transcripts/[transcriptId]/transcribe
 * Request transcription for a transcript. Answers 404 for an unknown
 * transcript, and 409 for one that already has segments without force.
 */
export async function POST(request: NextRequest, props: Params) {
  const { workspaceId, transcriptId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const { youtubeUrl, force } = transcribeRequestSchema.parse(await request.json());

    const task = await requestTranscribeTranscript(workspaceId, transcriptId, { youtubeUrl, force });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to request transcription');
  }
}
