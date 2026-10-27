import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { assertGenericWorkspace } from '@/lib/db/workspaces';
import { handleApiError, NotFoundError } from '@/lib/api/errors';
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
  props: { params: Promise<{ workspaceId: string; transcriptId: string; format: string }> }
) {
  const params = await props.params;
  try {
    const { format } = params;

    if (!isExportFormat(format)) {
      return NextResponse.json(
        { error: `Unsupported export format: ${format}` },
        { status: 400 }
      );
    }

    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    await assertGenericWorkspace(params.workspaceId);

    const transcriptMeta = await getTranscriptData(params.workspaceId, params.transcriptId);
    if (!transcriptMeta) {
      throw new NotFoundError('Transcript not found');
    }

    // Fetch full transcript with segments
    const transcript = await getTranscript(params.transcriptId, params.workspaceId);

    // The ASCII name is the fallback for clients without RFC 5987; filename*
    // keeps a Greek name intact, where the ASCII one reduces it to underscores.
    const asciiName = transcriptMeta.name
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
    const filename = `${asciiName}_transcript.${format}`;
    const utf8Filename = encodeURIComponent(`${transcriptMeta.name}.${format}`);

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
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${utf8Filename}`,
        'Content-Length': buffer.length.toString(),
        // Each export reads the transcript as it is now, after any inline edit.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to export transcript');
  }
}
