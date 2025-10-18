import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getTranscript as getTranscriptData } from '@/lib/db/transcripts';
import { getTranscript } from '@/lib/db/transcript';
import { getGenericWorkspace } from '@/lib/db/workspaces';
import { genericMeetingData } from '@/lib/workspaces/genericMeetingData';
import { GenericTranscriptWrapper } from '@/components/workspaces/GenericTranscriptWrapper';
import { setRequestLocale } from 'next-intl/server';

export default async function GenericTranscriptPage(props: {
  params: Promise<{ workspaceId: string; transcriptId: string; locale: string }>
}) {
  const params = await props.params;
  setRequestLocale(params.locale);

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const canEdit = await isUserAuthorizedToEdit({ workspaceId: params.workspaceId });
  const workspace = canEdit ? await getGenericWorkspace(params.workspaceId) : null;
  if (!workspace) {
    notFound();
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

  // Get latest task status
  const latestTask = transcriptMeta.taskStatuses?.[0] || null;

  const transcriptData = {
    meetingData: genericMeetingData({ workspace, transcriptRow: transcriptMeta, transcript, speakerTags }),
    latestTask,
    workspaceId: params.workspaceId,
    transcriptId: params.transcriptId,
    editable: canEdit
  };

  return <GenericTranscriptWrapper data={transcriptData} />;
}

