import { NextRequest, NextResponse } from 'next/server';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getTranscript as getTranscriptData } from '@/lib/db/transcripts';
import { getTranscript } from '@/lib/db/transcript';
import { renderGenericTranscriptDocx } from '@/components/workspaces/docx/GenericTranscriptDocx';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string; transcriptId: string } }
) {
  try {
    // Check authorization
    const canView = await isUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    if (!canView) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Fetch transcript metadata
    const transcriptMeta = await getTranscriptData(params.workspaceId, params.transcriptId);
    
    if (!transcriptMeta) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    // Fetch full transcript with segments
    const transcript = await getTranscript(params.transcriptId, params.workspaceId);

    // Generate DOCX
    const docx = await renderGenericTranscriptDocx({ transcript, transcriptMeta });
    const blob = await docx.save();

    // Create a sanitized filename
    const sanitizedName = transcriptMeta.name
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
    const filename = `${sanitizedName}_transcript.docx`;

    // Convert blob to buffer
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Return the file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to export transcript:', error);
    return NextResponse.json(
      { error: 'Failed to export transcript' },
      { status: 500 }
    );
  }
}

