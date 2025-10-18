import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { requestTranscribeTranscript } from '@/lib/tasks/transcribeGeneric';
import { z } from 'zod';

const transcribeRequestSchema = z.object({
  youtubeUrl: z.string().url("Valid YouTube URL required"),
  force: z.boolean().optional().default(false)
});

/**
 * POST /api/workspaces/[workspaceId]/transcripts/[transcriptId]/transcribe
 * Request transcription for a transcript
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string; transcriptId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const body = await request.json();
    const { youtubeUrl, force } = transcribeRequestSchema.parse(body);

    const task = await requestTranscribeTranscript(
      params.workspaceId,
      params.transcriptId,
      {
        youtubeUrl,
        force
      }
    );

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    // Handle specific error messages
    if (error instanceof Error) {
      if (error.message.includes('already has speaker segments')) {
        return NextResponse.json(
          { error: 'Transcript already transcribed. Use force=true to re-transcribe.' },
          { status: 409 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
      }
    }
    
    console.error('Failed to request transcription:', error);
    return NextResponse.json(
      { error: 'Failed to request transcription' },
      { status: 500 }
    );
  }
}

