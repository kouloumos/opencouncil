import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getTranscript as getTranscriptData } from '@/lib/db/transcripts';
import { getTranscript } from '@/lib/db/transcript';
import { GenericTranscriptWrapper } from '@/components/workspaces/GenericTranscriptWrapper';
import { setRequestLocale } from 'next-intl/server';

export default async function GenericTranscriptPage({
  params
}: {
  params: { workspaceId: string; transcriptId: string; locale: string }
}) {
  setRequestLocale(params.locale);
  
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/api/auth/signin');
  }

  const canEdit = await isUserAuthorizedToEdit({ workspaceId: params.workspaceId });
  
  if (!canEdit) {
    redirect(`/workspaces/${params.workspaceId}`);
  }

  // Fetch transcript metadata
  const transcriptMeta = await getTranscriptData(params.workspaceId, params.transcriptId);
  
  if (!transcriptMeta) {
    notFound();
  }

  // Fetch full transcript with segments
  const transcript = await getTranscript(params.transcriptId, params.workspaceId);

  // Extract unique speaker tags
  const speakerTags = Array.from(
    new Map(transcript.map(seg => [seg.speakerTag.id, seg.speakerTag])).values()
  );

  const transcriptData = {
    transcript,
    speakerTags,
    transcriptMeta,
    workspaceId: params.workspaceId,
    transcriptId: params.transcriptId,
    editable: canEdit
  };

  return <GenericTranscriptWrapper data={transcriptData} />;
}

