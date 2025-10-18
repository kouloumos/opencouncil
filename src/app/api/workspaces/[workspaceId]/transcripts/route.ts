import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { listTranscripts, createTranscript } from '@/lib/db/transcripts';
import { assertGenericWorkspace } from '@/lib/db/workspaces';
import * as z from 'zod';
import { revalidatePath } from 'next/cache';
import { handleApiError } from '@/lib/api/errors';

const createTranscriptSchema = z.object({
  name: z.string().min(1, "Transcript name is required"),
  videoUrl: z.url().optional().or(z.literal('')),
  audioUrl: z.url().optional().or(z.literal('')),
  muxPlaybackId: z.string().optional()
});

type Params = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/transcripts
 * List transcripts in a workspace
 */
export async function GET(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const { searchParams } = request.nextUrl;
    const released = searchParams.get('released');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const transcripts = await listTranscripts(workspaceId, {
      ...(released !== null && { released: released === 'true' }),
      ...(limit && { limit: parseInt(limit) }),
      ...(offset && { offset: parseInt(offset) })
    });

    return NextResponse.json(transcripts);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch transcripts');
  }
}

/**
 * POST /api/workspaces/[workspaceId]/transcripts
 * Create a new transcript
 */
export async function POST(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const data = createTranscriptSchema.parse(await request.json());

    const transcript = await createTranscript({
      workspaceId,
      name: data.name,
      videoUrl: data.videoUrl || undefined,
      audioUrl: data.audioUrl || undefined,
      muxPlaybackId: data.muxPlaybackId,
      released: false
    });

    revalidatePath(`/workspaces/${workspaceId}`);

    return NextResponse.json(transcript, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create transcript');
  }
}
