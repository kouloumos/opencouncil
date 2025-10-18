import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { listTranscripts, createTranscript } from '@/lib/db/transcripts';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const createTranscriptSchema = z.object({
  name: z.string().min(1, "Transcript name is required"),
  videoUrl: z.string().url().optional().or(z.literal('')),
  audioUrl: z.string().url().optional().or(z.literal('')),
  muxPlaybackId: z.string().optional()
});

/**
 * GET /api/workspaces/[workspaceId]/transcripts
 * List transcripts in a workspace
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const { searchParams } = new URL(request.url);
    const released = searchParams.get('released');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const transcripts = await listTranscripts(params.workspaceId, {
      ...(released !== null && { released: released === 'true' }),
      ...(limit && { limit: parseInt(limit) }),
      ...(offset && { offset: parseInt(offset) })
    });

    return NextResponse.json(transcripts);
  } catch (error) {
    console.error('Failed to fetch transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/transcripts
 * Create a new transcript
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const body = await request.json();
    const data = createTranscriptSchema.parse(body);

    const transcript = await createTranscript({
      workspaceId: params.workspaceId,
      name: data.name,
      videoUrl: data.videoUrl || undefined,
      audioUrl: data.audioUrl || undefined,
      muxPlaybackId: data.muxPlaybackId,
      released: false
    });

    revalidatePath(`/workspaces/${params.workspaceId}`);

    return NextResponse.json(transcript, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Failed to create transcript:', error);
    return NextResponse.json(
      { error: 'Failed to create transcript' },
      { status: 500 }
    );
  }
}

