import { NextRequest, NextResponse } from 'next/server';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getTranscript as getTranscriptData } from '@/lib/db/transcripts';
import { getTranscript } from '@/lib/db/transcript';
import { renderGenericTranscriptDocx } from '@/components/workspaces/docx/GenericTranscriptDocx';
import { generateSrt } from '@/lib/export/srt';

const EXPORT_FORMATS = ['docx', 'srt'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

function isExportFormat(format: string): format is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(format);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string; transcriptId: string; format: string } }
) {
  try {
    const { format } = params;

    if (!isExportFormat(format)) {
      return NextResponse.json(
        { error: `Unsupported export format: ${format}` },
        { status: 400 }
      );
    }

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

    // Create a sanitized filename
    const sanitizedName = transcriptMeta.name
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
    const filename = `${sanitizedName}_transcript.${format}`;

    let buffer: Buffer;
    let contentType: string;

    if (format === 'docx') {
      const docx = await renderGenericTranscriptDocx({ transcript, transcriptMeta });
      const blob = await docx.save();
      buffer = Buffer.from(await blob.arrayBuffer());
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      buffer = Buffer.from(generateSrt(transcript), 'utf-8');
      contentType = 'application/x-subrip; charset=utf-8';
    }

    // Return the file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
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
