import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getTranscript, updateTranscript, deleteTranscript } from '@/lib/db/transcripts';
import { assertGenericWorkspace } from '@/lib/db/workspaces';
import * as z from 'zod';
import { revalidatePath } from 'next/cache';
import { handleApiError, NotFoundError } from '@/lib/api/errors';

const updateTranscriptSchema = z.object({
  name: z.string().min(1).optional(),
  videoUrl: z.url().optional().or(z.literal('')),
  audioUrl: z.url().optional().or(z.literal('')),
  muxPlaybackId: z.string().optional(),
  released: z.boolean().optional()
});

type Params = { params: Promise<{ workspaceId: string; transcriptId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/transcripts/[transcriptId]
 * Get transcript details
 */
export async function GET(request: NextRequest, props: Params) {
  const { workspaceId, transcriptId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const transcript = await getTranscript(workspaceId, transcriptId);
    if (!transcript) {
      throw new NotFoundError('Transcript not found');
    }

    return NextResponse.json(transcript);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch transcript');
  }
}

/**
 * PUT /api/workspaces/[workspaceId]/transcripts/[transcriptId]
 * Update transcript
 */
export async function PUT(request: NextRequest, props: Params) {
  const { workspaceId, transcriptId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const data = updateTranscriptSchema.parse(await request.json());
    const transcript = await updateTranscript(workspaceId, transcriptId, data);

    revalidatePath(`/workspaces/${workspaceId}`);
    revalidatePath(`/workspaces/${workspaceId}/transcripts/${transcriptId}`);

    return NextResponse.json(transcript);
  } catch (error) {
    return handleApiError(error, 'Failed to update transcript');
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/transcripts/[transcriptId]
 * Delete transcript (super admin only)
 */
export async function DELETE(request: NextRequest, props: Params) {
  const { workspaceId, transcriptId } = await props.params;
  try {
    await withUserAuthorizedToEdit({});
    await assertGenericWorkspace(workspaceId);

    await deleteTranscript(workspaceId, transcriptId);

    revalidatePath(`/workspaces/${workspaceId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete transcript');
  }
}
