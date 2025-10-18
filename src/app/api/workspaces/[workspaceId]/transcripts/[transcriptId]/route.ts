import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getTranscript, updateTranscript, deleteTranscript } from '@/lib/db/transcripts';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const updateTranscriptSchema = z.object({
  name: z.string().min(1).optional(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  audioUrl: z.string().url().optional().or(z.literal('')),
  muxPlaybackId: z.string().optional(),
  released: z.boolean().optional()
});

/**
 * GET /api/workspaces/[workspaceId]/transcripts/[transcriptId]
 * Get transcript details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string; transcriptId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const transcript = await getTranscript(params.workspaceId, params.transcriptId);
    
    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
    }

    return NextResponse.json(transcript);
  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspaces/[workspaceId]/transcripts/[transcriptId]
 * Update transcript
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string; transcriptId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const body = await request.json();
    const data = updateTranscriptSchema.parse(body);

    const transcript = await updateTranscript(
      params.workspaceId,
      params.transcriptId,
      data
    );

    revalidatePath(`/workspaces/${params.workspaceId}`);
    revalidatePath(`/workspaces/${params.workspaceId}/transcripts/${params.transcriptId}`);

    return NextResponse.json(transcript);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Failed to update transcript:', error);
    return NextResponse.json(
      { error: 'Failed to update transcript' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/transcripts/[transcriptId]
 * Delete transcript
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string; transcriptId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    await deleteTranscript(params.workspaceId, params.transcriptId);

    revalidatePath(`/workspaces/${params.workspaceId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete transcript:', error);
    return NextResponse.json(
      { error: 'Failed to delete transcript' },
      { status: 500 }
    );
  }
}

